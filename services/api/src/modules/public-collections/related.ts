import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { isProgramPubliclyVisible } from "../programs/publicVisibility";
import type { PublicOrganizerCard, PublicProgramCard } from "../public-blog/related";

function orderByIdOrder<T extends { id: string }>(rows: T[], idOrder: string[]): T[] {
  const m = new Map(rows.map((r) => [r.id, r]));
  const out: T[] = [];
  for (const id of idOrder) {
    const r = m.get(id);
    if (r) out.push(r);
  }
  return out;
}

export type PublicBlogPostCard = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: string;
};

export async function loadCollectionRelated(
  _env: Env,
  col: {
    id: string;
    relatedBlogPostIds: string[];
    relatedProgramIds: string[];
    relatedOrganizerIds: string[];
  },
): Promise<{
  programs: PublicProgramCard[];
  organizers: PublicOrganizerCard[];
  blogPosts: PublicBlogPostCard[];
}> {
  const [programsRaw, organizersRaw, postsRaw] = await Promise.all([
    col.relatedProgramIds.length
      ? prisma.program.findMany({
          where: { id: { in: col.relatedProgramIds } },
          include: {
            media: true,
            organizer: { select: { id: true, displayName: true, verificationStatus: true } },
          },
        })
      : [],
    col.relatedOrganizerIds.length
      ? prisma.organizer.findMany({
          where: { id: { in: col.relatedOrganizerIds } },
          select: { id: true, displayName: true, verificationStatus: true, legalStatus: true },
        })
      : [],
    col.relatedBlogPostIds.length
      ? prisma.blogPost.findMany({
          where: {
            id: { in: col.relatedBlogPostIds },
            placement: "blog",
            status: "published",
          },
          select: { id: true, slug: true, title: true, excerpt: true, publishedAt: true },
        })
      : [],
  ]);

  const programsVisible = orderByIdOrder(
    programsRaw.filter((p) => isProgramPubliclyVisible(p)).map((p) => ({
      id: p.id,
      title: p.title,
      discipline: p.discipline,
      region: p.region,
      exactLocation: p.exactLocation,
      startDate: p.startDate.toISOString(),
      endDate: p.endDate.toISOString(),
      durationDays: p.durationDays,
      priceFromRub: p.priceFromRub,
      levelRequired: p.levelRequired,
      audienceFit: p.audienceFit,
      riskLevel: p.riskLevel,
      autoPublished: p.autoPublished,
      sourceType: p.sourceType,
      reviewStatus: p.reviewStatus,
      publishStatus: p.publishStatus,
      media: p.media.map((m) => ({ id: m.id, url: m.url, mediaType: m.mediaType })),
      organizer: p.organizer,
    })),
    col.relatedProgramIds,
  );

  const organizersOrdered = orderByIdOrder(organizersRaw, col.relatedOrganizerIds);

  const postsOrdered = orderByIdOrder(
    postsRaw.map((b) => ({
      id: b.id,
      slug: b.slug,
      title: b.title,
      excerpt: b.excerpt,
      publishedAt: b.publishedAt.toISOString(),
    })),
    col.relatedBlogPostIds,
  );

  return {
    programs: programsVisible,
    organizers: organizersOrdered,
    blogPosts: postsOrdered,
  };
}
