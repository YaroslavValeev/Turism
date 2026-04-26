import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { isProgramPubliclyVisible } from "../programs/publicVisibility";
import { publicCollectionVisibilityWhere } from "../public-collections/resolve";

export type PublicProgramCard = {
  id: string;
  title: string;
  discipline: string;
  region: string;
  exactLocation: string | null;
  startDate: string;
  endDate: string;
  durationDays: number;
  priceFromRub: number | null;
  levelRequired: string | null;
  audienceFit: string | null;
  riskLevel: string | null;
  autoPublished: boolean;
  sourceType: string | null;
  reviewStatus: string | null;
  publishStatus: string;
  media: { id: string; url: string; mediaType: string }[];
  organizer: { id: string; displayName: string; verificationStatus: string };
};

export type PublicOrganizerCard = {
  id: string;
  displayName: string;
  verificationStatus: string;
  legalStatus: string | null;
};

type BlogPostForRelated = {
  id: string;
  slug: string;
  placement: string;
  relatedProgramIds: string[];
  relatedOrganizerIds: string[];
  discipline: string | null;
  region: string | null;
};

function orderByIdOrder<T extends { id: string }>(rows: T[], idOrder: string[]): T[] {
  const m = new Map(rows.map((r) => [r.id, r]));
  const out: T[] = [];
  for (const id of idOrder) {
    const r = m.get(id);
    if (r) out.push(r);
  }
  return out;
}

export type PublicCollectionRef = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  discipline: string | null;
  region: string | null;
  season: string | null;
};

export async function loadBlogRelated(
  _env: Env,
  post: BlogPostForRelated,
): Promise<{
  programs: PublicProgramCard[];
  organizers: PublicOrganizerCard[];
  collections: PublicCollectionRef[];
  similarPosts: {
    id: string;
    slug: string;
    title: string;
    excerpt: string | null;
    publishedAt: string;
  }[];
}> {
  const orFilter: { discipline?: string; region?: string }[] = [];
  if (post.discipline?.trim()) orFilter.push({ discipline: post.discipline.trim() });
  if (post.region?.trim()) orFilter.push({ region: post.region.trim() });

  const [programsRaw, organizersRaw, collectionRows, similarRows] = await Promise.all([
    post.relatedProgramIds.length
      ? prisma.program.findMany({
          where: { id: { in: post.relatedProgramIds } },
          include: {
            media: true,
            organizer: { select: { id: true, displayName: true, verificationStatus: true } },
          },
        })
      : [],
    post.relatedOrganizerIds.length
      ? prisma.organizer.findMany({
          where: { id: { in: post.relatedOrganizerIds } },
          select: { id: true, displayName: true, verificationStatus: true, legalStatus: true },
        })
      : [],
    prisma.contentCollection.findMany({
      where: {
        AND: [...publicCollectionVisibilityWhere().AND, { relatedBlogPostIds: { has: post.id } }],
      },
      select: { id: true, slug: true, title: true, description: true, discipline: true, region: true, season: true },
      orderBy: { publishedAt: "desc" },
      take: 24,
    }),
    prisma.blogPost.findMany({
      where: {
        placement: "blog",
        status: "published",
        id: { not: post.id },
        ...(orFilter.length ? { OR: orFilter } : {}),
      },
      select: { id: true, slug: true, title: true, excerpt: true, publishedAt: true },
      orderBy: { publishedAt: "desc" },
      take: 6,
    }),
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
    post.relatedProgramIds,
  );

  const organizersOrdered = orderByIdOrder(organizersRaw, post.relatedOrganizerIds);

  let similarPosts = similarRows.slice(0, 4).map((s) => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    excerpt: s.excerpt,
    publishedAt: s.publishedAt.toISOString(),
  }));

  if (similarPosts.length < 2) {
    const extra = await prisma.blogPost.findMany({
      where: {
        placement: "blog",
        status: "published",
        id: { not: post.id, notIn: similarPosts.map((x) => x.id) },
      },
      select: { id: true, slug: true, title: true, excerpt: true, publishedAt: true },
      orderBy: { publishedAt: "desc" },
      take: 4 - similarPosts.length,
    });
    similarPosts = [
      ...similarPosts,
      ...extra.map((e) => ({
        id: e.id,
        slug: e.slug,
        title: e.title,
        excerpt: e.excerpt,
        publishedAt: e.publishedAt.toISOString(),
      })),
    ];
  }

  const collections: PublicCollectionRef[] = collectionRows.map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    description: c.description,
    discipline: c.discipline,
    region: c.region,
    season: c.season,
  }));

  return {
    programs: programsVisible,
    organizers: organizersOrdered,
    collections,
    similarPosts,
  };
}
