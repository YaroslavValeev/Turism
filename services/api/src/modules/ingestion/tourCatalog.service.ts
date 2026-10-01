/**
 * ИИ-сборщик каталога туров с сайта турфирмы и импорт найденных туров в черновики программ.
 * Публикацию не делает: что выпускать на витрину, решает владелец (или отдельный шаг с отчётом о дублях).
 */
import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { callOpenAiJson } from "../ai-pilot/openaiJson";
import {
  createSourceRun,
  finalizeSourceRun,
  persistCollectedItems,
  publishCandidateToDraft,
  runNormalizationJob,
  type CollectedItem,
} from "./service";
import {
  AI_TOUR_PAYLOAD_MODE,
  LINK_PICK_SYSTEM_PROMPT,
  TOUR_EXTRACT_SYSTEM_PROMPT,
  aiTourRawText,
  buildLinkPickUserMessage,
  buildTourExtractUserMessage,
  extractPageImage,
  extractPageTitle,
  extractSameSiteLinks,
  htmlToPlainText,
  parseExtractedTour,
  parsePickedLinks,
  titleSimilarity,
  type TourLink,
} from "./tourCatalog";

const MAX_HTML_BYTES = 3_000_000;
const DUPLICATE_SIMILARITY = 0.75;

function sameSite(a: string, b: string): boolean {
  try {
    const ha = new URL(a).hostname.toLowerCase().replace(/^www\./, "");
    const hb = new URL(b).hostname.toLowerCase().replace(/^www\./, "");
    return ha === hb;
  } catch {
    return false;
  }
}

/** HTML страницы сайта источника: только http(s), тот же хост (в т.ч. после редиректа), не больше 3 МБ. */
async function fetchSiteHtml(url: string, siteUrl: string): Promise<string> {
  if (!/^https?:\/\//i.test(url) || !sameSite(url, siteUrl)) throw new Error(`foreign_url ${url}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; MyWaveTourBot/1.0; +https://mywavetour.ru)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (response.url && !sameSite(response.url, siteUrl)) throw new Error(`redirect_off_site ${response.url}`);
    const type = response.headers.get("content-type") ?? "";
    if (type && !/html|xml|text\/plain/i.test(type)) throw new Error(`not_html ${type}`);
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_HTML_BYTES) throw new Error("too_large");
    const text = await response.text();
    return text.length > MAX_HTML_BYTES ? text.slice(0, MAX_HTML_BYTES) : text;
  } finally {
    clearTimeout(timeout);
  }
}

export type TourCatalogPageResult = { url: string; status: "collected" | "known" | "not_tour" | "error"; title?: string; detail?: string };

export type TourCatalogCollectResult = {
  sourceId: string;
  sourceName: string;
  linksSeen: number;
  tourPages: number;
  created: number;
  pages: TourCatalogPageResult[];
  error?: string;
};

async function pickTourLinks(env: Env, siteName: string, siteUrl: string, links: TourLink[]) {
  if (!links.length) return { tours: [] as string[], catalogPages: [] as string[] };
  const ai = await callOpenAiJson(
    env,
    [
      { role: "system", content: LINK_PICK_SYSTEM_PROMPT },
      { role: "user", content: buildLinkPickUserMessage(siteName, siteUrl, links) },
    ],
    { timeoutMs: 90_000 },
  );
  if (!ai.ok) throw new Error(`ai_link_pick_${ai.reason}${ai.detail ? `: ${ai.detail.slice(0, 160)}` : ""}`);
  return parsePickedLinks(ai.json, links);
}

/**
 * Собирает туры с сайта источника: главная (и до 3 страниц-каталогов) → ИИ выбирает страницы туров →
 * ИИ извлекает тур со страницы → RawItem с payload `ai_tour_v1`. Уже собранные страницы повторно не разбираются.
 */
export async function collectTourCatalog(
  env: Env,
  sourceId: string,
  actorId: string | null,
  options: { maxTours?: number; refresh?: boolean } = {},
): Promise<TourCatalogCollectResult> {
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source) throw new Error("Источник не найден");
  const siteUrl = source.urlOrHandle.trim();
  const maxTours = Math.min(Math.max(options.maxTours ?? 25, 1), 60);
  const result: TourCatalogCollectResult = { sourceId, sourceName: source.name, linksSeen: 0, tourPages: 0, created: 0, pages: [] };
  const runId = await createSourceRun(source.id, "collect");
  try {
    const homeHtml = await fetchSiteHtml(siteUrl, siteUrl);
    const links = extractSameSiteLinks(homeHtml, siteUrl);
    const picked = await pickTourLinks(env, source.name, siteUrl, links);
    const tourUrls = [...picked.tours];
    let seen = links.length;
    if (tourUrls.length < maxTours) {
      for (const catalogUrl of picked.catalogPages) {
        try {
          const catalogLinks = extractSameSiteLinks(await fetchSiteHtml(catalogUrl, siteUrl), catalogUrl);
          seen += catalogLinks.length;
          const more = await pickTourLinks(env, source.name, siteUrl, catalogLinks);
          for (const url of more.tours) if (!tourUrls.includes(url)) tourUrls.push(url);
        } catch (error) {
          result.pages.push({ url: catalogUrl, status: "error", detail: error instanceof Error ? error.message : String(error) });
        }
        if (tourUrls.length >= maxTours) break;
      }
    }
    result.linksSeen = seen;
    const selected = tourUrls.slice(0, maxTours);
    result.tourPages = selected.length;

    const known = options.refresh
      ? new Set<string>()
      : new Set(
          (
            await prisma.rawItem.findMany({
              where: { sourceId: source.id, externalItemId: { in: selected } },
              select: { externalItemId: true },
            })
          ).map((r) => r.externalItemId),
        );

    const items: CollectedItem[] = [];
    for (const url of selected) {
      if (known.has(url)) {
        result.pages.push({ url, status: "known" });
        continue;
      }
      try {
        const html = await fetchSiteHtml(url, siteUrl);
        const pageTitle = extractPageTitle(html);
        const ai = await callOpenAiJson(
          env,
          [
            { role: "system", content: TOUR_EXTRACT_SYSTEM_PROMPT },
            { role: "user", content: buildTourExtractUserMessage(source.name, url, pageTitle, htmlToPlainText(html)) },
          ],
          { timeoutMs: 90_000 },
        );
        if (!ai.ok) {
          result.pages.push({ url, status: "error", detail: `ai_${ai.reason}` });
          continue;
        }
        const tour = parseExtractedTour(ai.json);
        if (!tour) {
          result.pages.push({ url, status: "not_tour", title: pageTitle ?? undefined });
          continue;
        }
        const image = extractPageImage(html, url);
        items.push({
          externalItemId: url,
          sourceUrl: url,
          authorName: source.name,
          rawTitle: tour.title,
          rawText: aiTourRawText(tour),
          rawMedia: image ? [{ url: image }] : [],
          rawPayload: { mode: AI_TOUR_PAYLOAD_MODE, tour, pageTitle, model: ai.model },
        });
        result.pages.push({ url, status: "collected", title: tour.title });
      } catch (error) {
        result.pages.push({ url, status: "error", detail: error instanceof Error ? error.message : String(error) });
      }
    }
    result.created = items.length ? await persistCollectedItems(source, runId, items, actorId) : 0;
    await finalizeSourceRun(runId, "success", { itemsFound: selected.length, itemsCreated: result.created });
    await prisma.source.update({ where: { id: source.id }, data: { lastCheckedAt: new Date(), lastSuccessAt: new Date() } });
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    await finalizeSourceRun(runId, "failed", { errorMessage: result.error.slice(0, 500) });
  }
  return result;
}

export type TourImportEntry = {
  candidateId: string;
  title: string;
  url: string | null;
  programId?: string;
  duplicateOf?: { programId: string; title: string; publishStatus: string; similarity: number };
  error?: string;
};

/** Похожая программа того же организатора/источника или той же дисциплины в том же регионе. */
async function findSimilarProgram(title: string, discipline: string, region: string, sourceId: string, organizerId: string | null) {
  const or: object[] = [{ sourceId }, { discipline, region: { equals: region, mode: "insensitive" } }];
  if (organizerId) or.push({ organizerId });
  const pool = await prisma.program.findMany({
    where: { publishStatus: { not: "archived" }, OR: or },
    select: { id: true, title: true, publishStatus: true },
  });
  let best: { programId: string; title: string; publishStatus: string; similarity: number } | null = null;
  for (const p of pool) {
    const similarity = titleSimilarity(title, p.title);
    if (similarity >= DUPLICATE_SIMILARITY && (!best || similarity > best.similarity)) {
      best = { programId: p.id, title: p.title, publishStatus: p.publishStatus, similarity: Math.round(similarity * 100) / 100 };
    }
  }
  return best;
}

/**
 * Нормализует собранные туры источника и превращает их в черновики программ.
 * Туры, похожие на уже существующие программы, не импортируются — попадают в отчёт как дубли.
 */
export async function importTourCatalogDrafts(sourceId: string, actorId: string | null): Promise<TourImportEntry[]> {
  await runNormalizationJob(actorId, [sourceId]);
  const candidates = await prisma.eventCandidate.findMany({
    where: {
      status: { in: ["new", "needs_review", "approved", "archived"] },
      publishedProgram: null,
      normalizedItem: { parseVersion: "v1_ai_tour", rawItem: { sourceId } },
    },
    include: { normalizedItem: { include: { rawItem: { include: { source: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  const out: TourImportEntry[] = [];
  const importedTitles: string[] = [];
  for (const c of candidates) {
    const n = c.normalizedItem;
    const title = n.title ?? "";
    const entry: TourImportEntry = { candidateId: c.id, title, url: n.rawItem.sourceUrl };
    try {
      const duplicate = await findSimilarProgram(
        title,
        n.discipline ?? "",
        n.region ?? "",
        sourceId,
        n.rawItem.source.organizerId ?? null,
      );
      const sameBatch = importedTitles.find((t) => titleSimilarity(title, t) >= DUPLICATE_SIMILARITY);
      if (duplicate || sameBatch) {
        entry.duplicateOf = duplicate ?? { programId: "", title: sameBatch ?? "", publishStatus: "same_batch", similarity: 1 };
        await prisma.eventCandidate.update({
          where: { id: c.id },
          data: { status: "rejected", decisionNotes: `Дубль: ${entry.duplicateOf.title}`, reviewedBy: actorId, reviewedAt: new Date() },
        });
      } else {
        if (c.status === "archived") {
          await prisma.eventCandidate.update({ where: { id: c.id }, data: { status: "needs_review" } });
        }
        const link = await publishCandidateToDraft(c.id, actorId, "ИИ-сборщик каталога туров");
        entry.programId = link.programId;
        importedTitles.push(title);
      }
    } catch (error) {
      entry.error = error instanceof Error ? error.message : String(error);
    }
    out.push(entry);
  }
  return out;
}
