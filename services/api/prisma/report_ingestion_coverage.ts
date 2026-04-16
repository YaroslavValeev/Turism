import fs from "fs/promises";
import path from "path";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

type SourceCoverageRow = {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  priority: number;
  parserProfile: string | null;
  urlOrHandle: string;
  externalSiteUrls: string[];
  verificationUrls: string[];
  rawItems: number;
  normalizedItems: number;
  publishedPrograms: number;
  candidateStatuses: Record<string, number>;
  recommendedClass: "A" | "B" | "C" | "D";
  recommendedAction: string;
};

const SOCIAL_HOST_PATTERNS = [
  /(^|\.)instagram\.com$/i,
  /(^|\.)t\.me$/i,
  /(^|\.)vk\.com$/i,
  /(^|\.)youtube\.com$/i,
  /(^|\.)youtu\.be$/i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)telemetr\.io$/i,
];

function getMetaObject(meta: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    return meta as Record<string, unknown>;
  }
  return {};
}

function getStringArrayMeta(meta: Prisma.JsonValue | null | undefined, key: string): string[] {
  const value = getMetaObject(meta)[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function isSocialUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return SOCIAL_HOST_PATTERNS.some((pattern) => pattern.test(host));
  } catch {
    return false;
  }
}

function hasCalendarLikeUrl(urls: string[]): boolean {
  return urls.some((url) => /(calendar|raspis|schedule|event|camp|trip|tour|program)/i.test(url));
}

function classifySource(row: Omit<SourceCoverageRow, "recommendedClass" | "recommendedAction">): Pick<SourceCoverageRow, "recommendedClass" | "recommendedAction"> {
  if (row.publishedPrograms > 0) {
    return {
      recommendedClass: "A",
      recommendedAction: "Уже даёт publishable events. Усиливать detail-page extraction и качество карточек.",
    };
  }

  if (row.externalSiteUrls.length > 0 && hasCalendarLikeUrl(row.externalSiteUrls)) {
    return {
      recommendedClass: "A",
      recommendedAction: "Писать source-specific parser profile под календарь/расписание и detail pages.",
    };
  }

  if (row.externalSiteUrls.length > 0) {
    return {
      recommendedClass: "B",
      recommendedAction: "Проверить структуру сайта. Вероятно нужен site cards/grid parser или follow-links extraction.",
    };
  }

  if (row.type === "telegram" && row.rawItems > 0) {
    return {
      recommendedClass: "C",
      recommendedAction: "Оставить как event-feed/discovery. Нужен parser для event-like posts, без ожидания site-quality.",
    };
  }

  return {
    recommendedClass: "D",
    recommendedAction: "Discovery-only или low-value source. Не тратить parser effort до появления структурированного источника.",
  };
}

function toMarkdown(rows: SourceCoverageRow[], generatedAt: string): string {
  const total = rows.length;
  const active = rows.filter((row) => row.isActive).length;
  const published = rows.filter((row) => row.publishedPrograms > 0).length;
  const classCounts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.recommendedClass] = (acc[row.recommendedClass] ?? 0) + 1;
    return acc;
  }, {});

  const topA = rows.filter((row) => row.recommendedClass === "A").slice(0, 10);
  const topB = rows.filter((row) => row.recommendedClass === "B").slice(0, 10);
  const currentPublished = rows.filter((row) => row.publishedPrograms > 0);

  const lines: string[] = [];
  lines.push("# Ingestion Coverage Report");
  lines.push("");
  lines.push(`Generated at: ${generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Sources total: ${total}`);
  lines.push(`- Active sources: ${active}`);
  lines.push(`- Sources with published programs: ${published}`);
  lines.push(`- Class A: ${classCounts.A ?? 0}`);
  lines.push(`- Class B: ${classCounts.B ?? 0}`);
  lines.push(`- Class C: ${classCounts.C ?? 0}`);
  lines.push(`- Class D: ${classCounts.D ?? 0}`);
  lines.push("");
  lines.push("## Current Published Sources");
  if (currentPublished.length === 0) {
    lines.push("- None");
  } else {
    for (const row of currentPublished) {
      lines.push(`- ${row.name}: ${row.publishedPrograms} published`);
    }
  }
  lines.push("");
  lines.push("## Priority A Sources");
  if (topA.length === 0) {
    lines.push("- None");
  } else {
    for (const row of topA) {
      lines.push(`- ${row.name} (${row.type})`);
      lines.push(`  Action: ${row.recommendedAction}`);
      lines.push(`  External URLs: ${row.externalSiteUrls.join(", ") || "none"}`);
      lines.push(`  Coverage: raw=${row.rawItems}, normalized=${row.normalizedItems}, published=${row.publishedPrograms}`);
    }
  }
  lines.push("");
  lines.push("## Priority B Sources");
  if (topB.length === 0) {
    lines.push("- None");
  } else {
    for (const row of topB) {
      lines.push(`- ${row.name} (${row.type})`);
      lines.push(`  Action: ${row.recommendedAction}`);
      lines.push(`  External URLs: ${row.externalSiteUrls.join(", ") || "none"}`);
      lines.push(`  Coverage: raw=${row.rawItems}, normalized=${row.normalizedItems}, published=${row.publishedPrograms}`);
    }
  }
  lines.push("");
  lines.push("## Full Matrix");
  lines.push("");
  lines.push("| Source | Type | Active | Raw | Normalized | Published | Class | Action |");
  lines.push("|---|---:|---:|---:|---:|---:|---|---|");
  for (const row of rows) {
    lines.push(`| ${row.name} | ${row.type} | ${row.isActive ? "yes" : "no"} | ${row.rawItems} | ${row.normalizedItems} | ${row.publishedPrograms} | ${row.recommendedClass} | ${row.recommendedAction} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const sources = await prisma.source.findMany({
    orderBy: [{ priority: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { rawItems: true } },
    },
  });

  const rows: SourceCoverageRow[] = [];

  for (const source of sources) {
    const verificationUrls = getStringArrayMeta(source.metaJson, "verificationUrls");
    const externalSiteUrls = verificationUrls.filter((url) => /^https?:\/\//i.test(url) && !isSocialUrl(url));
    const normalizedItems = await prisma.normalizedItem.count({
      where: { rawItem: { sourceId: source.id } },
    });
    const candidateGroups = await prisma.eventCandidate.groupBy({
      by: ["status"],
      where: { normalizedItem: { rawItem: { sourceId: source.id } } },
      _count: { _all: true },
    });
    const publishedPrograms = await prisma.publishedProgram.count({
      where: { candidate: { normalizedItem: { rawItem: { sourceId: source.id } } } },
    });

    const baseRow = {
      id: source.id,
      name: source.name,
      type: source.type,
      isActive: source.isActive,
      priority: source.priority,
      parserProfile: source.parserProfile,
      urlOrHandle: source.urlOrHandle,
      verificationUrls,
      externalSiteUrls,
      rawItems: source._count.rawItems,
      normalizedItems,
      publishedPrograms,
      candidateStatuses: Object.fromEntries(candidateGroups.map((row) => [row.status, row._count._all])),
    };
    rows.push({
      ...baseRow,
      ...classifySource(baseRow),
    });
  }

  const sorted = [...rows].sort((a, b) => {
    const classOrder = { A: 0, B: 1, C: 2, D: 3 };
    const byClass = classOrder[a.recommendedClass] - classOrder[b.recommendedClass];
    if (byClass !== 0) return byClass;
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.publishedPrograms !== b.publishedPrograms) return b.publishedPrograms - a.publishedPrograms;
    return a.name.localeCompare(b.name, "ru");
  });

  const generatedAt = new Date().toISOString();
  const reportJsonPath = path.resolve(__dirname, "../../../tmp/reports/ingestion-source-coverage-2026-04-08.json");
  const reportMdPath = path.resolve(__dirname, "../../../docs/INGESTION_SOURCE_COVERAGE_2026-04-08.md");

  await fs.mkdir(path.dirname(reportJsonPath), { recursive: true });
  await fs.writeFile(reportJsonPath, JSON.stringify(sorted, null, 2), "utf8");
  await fs.writeFile(reportMdPath, toMarkdown(sorted, generatedAt), "utf8");

  console.log(
    JSON.stringify(
      {
        generatedAt,
        reportJsonPath,
        reportMdPath,
        totalSources: sorted.length,
        classSummary: sorted.reduce<Record<string, number>>((acc, row) => {
          acc[row.recommendedClass] = (acc[row.recommendedClass] ?? 0) + 1;
          return acc;
        }, {}),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
