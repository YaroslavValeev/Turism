import type { Env } from "@mywave/config";
import type { ChannelPublisher, PublishAdapterInput, PublishAdapterResult } from "./types";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Временный адаптер до полноценного blog CMS: формирует стабильный внешний URL. */
export function createSitePublisher(env: Env, channel: "site_blog" | "site_landing"): ChannelPublisher {
  return {
    channel,
    async publish(input: PublishAdapterInput): Promise<PublishAdapterResult> {
      const title = input.draft.generatedHeadline || `content-${input.draft.id}`;
      const slug = slugify(title || input.draft.id) || input.draft.id;
      const base = env.PUBLIC_WEB_BASE_URL.replace(/\/+$/, "");
      const path = channel === "site_blog" ? `/blog/${slug}` : `/announcements/${slug}`;
      return {
        externalId: `${channel}:${input.draft.id}`,
        url: `${base}${path}?utm_source=${encodeURIComponent(input.utmSource)}&utm_campaign=${encodeURIComponent(input.utmCampaign)}`,
        raw: { mode: "synthetic_site_publish", slug, path, placement: channel === "site_blog" ? "blog" : "landing" },
      };
    },
  };
}

