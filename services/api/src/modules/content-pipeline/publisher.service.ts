import type { Env } from "@mywave/config";
import type { ContentPublicationChannel } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";
import { createFacebookPublisher } from "./publishers/facebook.publisher";
import { createSitePublisher } from "./publishers/site.publisher";
import { createTelegramPublisher } from "./publishers/telegram.publisher";
import type { ChannelPublisher } from "./publishers/types";
import { createVkPublisher } from "./publishers/vk.publisher";

export const MAX_CONTENT_PUBLICATION_RETRY = 3;
const MAX_RETRY = MAX_CONTENT_PUBLICATION_RETRY;

function getPublisherMap(env: Env): Map<ContentPublicationChannel, ChannelPublisher> {
  const map = new Map<ContentPublicationChannel, ChannelPublisher>();
  const tg = createTelegramPublisher(env);
  const vk = createVkPublisher();
  const fb = createFacebookPublisher();
  const blog = createSitePublisher(env, "site_blog");
  const landing = createSitePublisher(env, "site_landing");
  map.set(tg.channel, tg);
  map.set(vk.channel, vk);
  map.set(fb.channel, fb);
  map.set(blog.channel, blog);
  map.set(landing.channel, landing);
  return map;
}

function nowDateOnly(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function buildUtm(contentItemId: string, channel: ContentPublicationChannel): { source: string; campaign: string } {
  return {
    source: `content_${channel}`,
    campaign: `item_${contentItemId}`,
  };
}

export async function publishDraft(
  env: Env,
  input: { draftId: string; channels: ContentPublicationChannel[]; actorId?: string | null },
): Promise<{ published: string[]; failed: Array<{ channel: string; error: string }> }> {
  const draft = await prisma.contentDraft.findUnique({
    where: { id: input.draftId },
    include: {
      contentItem: { include: { program: { select: { id: true, title: true } } } },
    },
  });
  if (!draft) throw new Error("draft not found");
  if (draft.contentItem.workflowStatus !== "approved") {
    throw new Error("content item is not approved");
  }
  if (draft.status !== "ready") throw new Error("draft is not ready");

  const map = getPublisherMap(env);
  const published: string[] = [];
  const failed: Array<{ channel: string; error: string }> = [];
  const channels = Array.from(new Set(input.channels));
  for (const channel of channels) {
    const adapter = map.get(channel);
    if (!adapter) {
      failed.push({ channel, error: "adapter not found" });
      continue;
    }
    const utm = buildUtm(draft.contentItemId, channel);
    const existing = await prisma.contentPublication.findUnique({
      where: { contentDraftId_channel: { contentDraftId: draft.id, channel } },
    });
    if (existing?.state === "published") {
      published.push(channel);
      continue;
    }
    const pub = existing
      ? await prisma.contentPublication.update({
          where: { id: existing.id },
          data: { state: "publishing" },
        })
      : await prisma.contentPublication.create({
          data: {
            contentItemId: draft.contentItemId,
            contentDraftId: draft.id,
            channel,
            state: "pending",
            retryCount: 0,
            idempotencyKey: `pub:${draft.id}:${channel}`,
          },
        });
    try {
      const text = draft.finalDraftText || draft.longCopy || draft.shortCopy || draft.generatedHeadline || "";
      const result = await adapter.publish({
        draft,
        text,
        utmSource: utm.source,
        utmCampaign: utm.campaign,
      });
      const publicationTime = new Date();
      const txOps: Array<ReturnType<typeof prisma.contentPublication.update> | ReturnType<typeof prisma.contentMetric.create> | ReturnType<typeof prisma.blogPost.upsert>> = [
        prisma.contentPublication.update({
          where: { id: pub.id },
          data: {
            state: "published",
            externalPostId: result.externalId,
            externalUrl: result.url || null,
            publishedAt: publicationTime,
            errorCode: null,
            errorDetail: null,
          },
        }),
        prisma.contentMetric.create({
          data: {
            contentItemId: draft.contentItemId,
            contentPublicationId: pub.id,
            channel,
            publishedAt: publicationTime,
            utmSource: utm.source,
            utmCampaign: utm.campaign,
            asOfDate: nowDateOnly(),
            clicks: 0,
            views: 0,
            leads: 0,
            applications: 0,
            siteSessions: 0,
            bookingCount: 0,
            propertiesJson: result.raw as object,
          },
        }),
      ];
      if (channel === "site_blog" || channel === "site_landing") {
        const raw = (result.raw ?? {}) as { slug?: string; placement?: string };
        const placement = channel === "site_blog" ? "blog" : "landing";
        const baseWeb = env.PUBLIC_WEB_BASE_URL.replace(/\/+$/, "");
        const baseBody = draft.finalDraftText || draft.longCopy || draft.shortCopy || draft.generatedHeadline || "";
        const program = draft.contentItem.program;
        const uq = `utm_source=${encodeURIComponent(utm.source)}&utm_campaign=${encodeURIComponent(utm.campaign)}`;
        let blogBody = baseBody;
        const relatedProgramIds: string[] = [];
        const payload = (draft.inputPayloadJson ?? null) as { relatedCollectionIds?: unknown } | null;
        const relatedCollectionIds: string[] = Array.isArray(payload?.relatedCollectionIds)
          ? payload!.relatedCollectionIds.filter((x): x is string => typeof x === "string")
          : [];
        if (program) {
          relatedProgramIds.push(program.id);
          blogBody = `${baseBody}\n\n---\n\n[Смотреть программу: ${program.title}](${baseWeb}/program/${program.id}?${uq})\n\nОставьте заявку на странице программы — команда MyWave передаст контакт организатору.`;
        }
        txOps.push(
          prisma.blogPost.upsert({
            where: { contentDraftId_placement: { contentDraftId: draft.id, placement } },
            create: {
              contentItemId: draft.contentItemId,
              contentDraftId: draft.id,
              placement,
              slug: raw.slug || `content-${draft.id}`,
              title: draft.generatedHeadline || `Материал ${draft.id}`,
              excerpt: draft.shortCopy,
              body: blogBody,
              sourceUrl: result.url || null,
              publishedAt: publicationTime,
              status: "published",
              relatedProgramIds,
              relatedCollectionIds,
            },
            update: {
              slug: raw.slug || `content-${draft.id}`,
              title: draft.generatedHeadline || `Материал ${draft.id}`,
              excerpt: draft.shortCopy,
              body: blogBody,
              sourceUrl: result.url || null,
              publishedAt: publicationTime,
              status: "published",
              relatedProgramIds: { set: relatedProgramIds },
              ...(relatedCollectionIds.length
                ? { relatedCollectionIds: { set: relatedCollectionIds } }
                : {}),
            },
          }),
        );
      }
      await prisma.$transaction(txOps);
      published.push(channel);
      await writeAuditLog({
        entityType: "content_publication",
        entityId: pub.id,
        changedField: "published",
        oldValue: existing?.state || "pending",
        newValue: "published",
        changedBy: input.actorId || null,
        reason: `channel:${channel}`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const nextRetry = (existing?.retryCount || 0) + 1;
      await prisma.contentPublication.update({
        where: { id: pub.id },
        data: {
          state: "failed",
          retryCount: nextRetry,
          errorCode: "publish_error",
          errorDetail: msg,
        },
      });
      failed.push({ channel, error: msg });
    }
  }
  return { published, failed };
}

export async function retryFailedPublication(
  env: Env,
  publicationId: string,
  actorId: string | null,
): Promise<{ ok: boolean; message: string }> {
  const pub = await prisma.contentPublication.findUnique({
    where: { id: publicationId },
    include: { contentDraft: true },
  });
  if (!pub) return { ok: false, message: "publication not found" };
  if (pub.state !== "failed") return { ok: false, message: "publication is not failed" };
  if (pub.retryCount >= MAX_RETRY) return { ok: false, message: "retry limit reached" };
  const out = await publishDraft(env, {
    draftId: pub.contentDraftId,
    channels: [pub.channel],
    actorId,
  });
  if (out.failed.length) return { ok: false, message: out.failed[0].error };
  return { ok: true, message: "retried" };
}

