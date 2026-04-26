import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import type { ExploreHubType } from "@mywave/explore-links";
import {
  MANUAL_EXPLORE_HUBS,
  getManualHub,
  matchValuesForRaws,
  rawStringToHubSlug,
} from "@mywave/explore-links";
import { isProgramPubliclyVisible } from "../programs/publicVisibility";
import { getProgramVisibilityThresholdDate } from "../programs/publicVisibility";
import { publicCollectionVisibilityWhere } from "../public-collections/resolve";
import type { PublicProgramCard } from "../public-blog/related";
import { resolveExploreHubSeo, type ResolvedExploreSeo } from "./resolveSeo";
import { resolveBlogSeo } from "../public-blog/resolve";
import { resolveCollectionSeo } from "../public-collections/resolve";

const PUB = { placement: "blog" as const, status: "published" as const };
const TAKE = 40;

type FieldKey = "discipline" | "region" | "season";

function fieldForType(t: ExploreHubType): FieldKey {
  return t;
}

function prismaOrField(field: FieldKey, matchStrings: string[]) {
  if (matchStrings.length === 0) {
    return { id: { equals: "__no_match__" } };
  }
  return { OR: matchStrings.map((v) => ({ [field]: { equals: v, mode: "insensitive" as const } })) } as const;
}

function getManualSlugsSet(type: ExploreHubType): Set<string> {
  return new Set(MANUAL_EXPLORE_HUBS[type].map((h) => h.slug));
}

async function getDistinctRawsForType(t: ExploreHubType): Promise<string[]> {
  const out = new Set<string>();
  const f = fieldForType(t);
  if (t === "season") {
    const coll = await prisma.contentCollection.findMany({
      where: { AND: [publicCollectionVisibilityWhere(), { season: { not: null } }] },
      select: { season: true },
    });
    for (const r of coll) {
      if (r.season?.trim()) out.add(r.season.trim());
    }
    return [...out];
  }

  const [blogRows, programs, collRows] = await Promise.all([
    prisma.blogPost.findMany({
      where: { ...PUB },
      select: { discipline: true, region: true },
    }),
    prisma.program.findMany({
      where: { publishStatus: "published" },
      select: { discipline: true, region: true, endDate: true, spotsAvailable: true, publishStatus: true },
    }),
    prisma.contentCollection.findMany({
      where: publicCollectionVisibilityWhere(),
      select: { discipline: true, region: true },
    }),
  ]);

  for (const b of blogRows) {
    const v = t === "discipline" ? b.discipline : b.region;
    if (v?.trim()) out.add(v.trim());
  }
  for (const p of programs) {
    if (!isProgramPubliclyVisible(p)) continue;
    const v = t === "discipline" ? p.discipline : p.region;
    if (v?.trim()) out.add(v.trim());
  }
  for (const c of collRows) {
    const v = t === "discipline" ? c.discipline : c.region;
    if (v?.trim()) out.add(v.trim());
  }
  return [...out];
}

function bucketRawsBySlug(type: ExploreHubType, raws: string[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const raw of raws) {
    const hubSlug = rawStringToHubSlug(type, raw);
    if (!hubSlug) continue;
    const a = m.get(hubSlug) ?? [];
    if (!a.includes(raw)) a.push(raw);
    m.set(hubSlug, a);
  }
  return m;
}

export function buildExploreBucketsForType(
  t: ExploreHubType,
  raws: string[],
  manualSlugs: Set<string>,
): Map<string, string[]> {
  const m = bucketRawsBySlug(t, raws);
  for (const s of manualSlugs) {
    if (!m.has(s)) m.set(s, []);
  }
  return m;
}

function resolveLabelForBucket(slug: string, raws: string[], manualLabel: string | null) {
  if (manualLabel) return manualLabel;
  if (raws[0]) return raws[0];
  return slug.replace(/-/g, " ");
}

type HubResolution = { slug: string; label: string; matchStrings: string[] };

function resolveHubOrThrow(type: ExploreHubType, urlSlug: string, buckets: Map<string, string[]>): HubResolution | null {
  const man = getManualHub(type, urlSlug);
  if (man) {
    return { slug: man.slug, label: man.label, matchStrings: matchValuesForRaws(type, man.variants) };
  }
  const raws = buckets.get(urlSlug);
  if (!raws || raws.length === 0) return null;
  return {
    slug: urlSlug,
    label: resolveLabelForBucket(urlSlug, raws, null),
    matchStrings: matchValuesForRaws(type, raws),
  };
}

type ProgramWithMediaOrg = {
  id: string;
  title: string;
  discipline: string;
  region: string;
  exactLocation: string | null;
  startDate: Date;
  endDate: Date;
  durationDays: number;
  priceFromRub: number | null;
  levelRequired: string | null;
  audienceFit: string | null;
  riskLevel: string | null;
  autoPublished: boolean;
  sourceType: string | null;
  reviewStatus: string;
  publishStatus: string;
  media: { id: string; url: string; mediaType: string }[];
  organizer: { id: string; displayName: string; verificationStatus: string };
};

function cardFromProgram(p: ProgramWithMediaOrg): PublicProgramCard {
  return {
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
  };
}

export type ExploreListItem = {
  type: ExploreHubType;
  slug: string;
  label: string;
  counts: { blogPosts: number; programs: number; collections: number; total: number };
  updatedAt: string;
};

export async function loadExploreIndex(): Promise<ExploreListItem[]> {
  const items: ExploreListItem[] = [];
  const now = new Date();

  for (const t of ["discipline", "region", "season"] as ExploreHubType[]) {
    const raws = await getDistinctRawsForType(t);
    const manualSet = getManualSlugsSet(t);
    const buckets = buildExploreBucketsForType(t, raws, manualSet);

    for (const [slug, _] of buckets) {
      const res = resolveHubOrThrow(t, slug, buckets);
      if (!res) continue;
      if (res.matchStrings.length === 0) continue;

      const field = fieldForType(t);
      const orF = prismaOrField(field, res.matchStrings);

      const [blogPosts, prows, collections] = await Promise.all([
        t === "season"
          ? 0
          : prisma.blogPost.count({
              where: { ...PUB, ...orF },
            }),
        t === "season"
          ? []
          : prisma.program.findMany({
              where: { ...orF, publishStatus: "published" },
              select: { endDate: true, spotsAvailable: true, publishStatus: true, updatedAt: true },
            }),
        prisma.contentCollection.count({
          where: { AND: [publicCollectionVisibilityWhere(now), { ...orF }] },
        }),
      ]);

      const programs = prows.filter((p) => isProgramPubliclyVisible(p));

      const [blogMax, collMax] = await Promise.all([
        t === "season"
          ? null
          : prisma.blogPost.findFirst({
              where: { ...PUB, ...orF },
              orderBy: { updatedAt: "desc" },
              select: { updatedAt: true },
            }),
        prisma.contentCollection.findFirst({
          where: { AND: [publicCollectionVisibilityWhere(now), { ...orF }] },
          orderBy: { updatedAt: "desc" },
          select: { updatedAt: true },
        }),
      ]);

      const maxProg = prows.length
        ? (() => {
            let m: Date | null = null;
            for (const p of prows) {
              if (isProgramPubliclyVisible(p) && (!m || p.updatedAt > m)) m = p.updatedAt;
            }
            return m;
          })()
        : null;

      const total = blogPosts + programs.length + collections;
      if (total < 1) continue;

      const u = [blogMax?.updatedAt, collMax?.updatedAt, maxProg].filter(Boolean) as Date[];
      const maxD = u.length ? new Date(Math.max(...u.map((d) => d.getTime()))) : new Date();

      items.push({
        type: t,
        slug: res.slug,
        label: res.label,
        counts: { blogPosts, programs: programs.length, collections, total },
        updatedAt: maxD.toISOString(),
      });
    }
  }
  return items.sort((a, b) => b.counts.total - a.counts.total);
}

export type ExploreHubResponse = {
  type: ExploreHubType;
  slug: string;
  label: string;
  resolved: ResolvedExploreSeo;
  blogPosts: {
    id: string;
    slug: string;
    title: string;
    excerpt: string | null;
    publishedAt: string;
    updatedAt: string;
    resolved: { seoTitle: string; seoDescription: string; canonicalUrl: string; ogImage: string };
  }[];
  collections: {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    publishedAt: string | null;
    updatedAt: string;
    resolved: { seoTitle: string; seoDescription: string; canonicalUrl: string; ogImage: string };
  }[];
  programs: PublicProgramCard[];
  counts: { blogPosts: number; programs: number; collections: number; total: number };
  breadcrumbs: {
    items: { name: string; path: string | null }[];
  };
};

export async function loadExploreHub(
  env: Env,
  type: ExploreHubType,
  urlSlug: string,
): Promise<ExploreHubResponse | null> {
  const raws = await getDistinctRawsForType(type);
  const manualSet = getManualSlugsSet(type);
  const buckets = buildExploreBucketsForType(type, raws, manualSet);
  const res = resolveHubOrThrow(type, urlSlug, buckets);
  if (!res) return null;

  const now = new Date();
  const field = fieldForType(type);
  const orF = prismaOrField(field, res.matchStrings);

  const [blogCount, proList, colCount, blogList, colList] = await Promise.all([
    type === "season" ? 0 : prisma.blogPost.count({ where: { ...PUB, ...orF } }),
    type === "season"
      ? []
      : prisma.program.findMany({
          where: { ...orF, publishStatus: "published" },
          include: {
            media: true,
            organizer: { select: { id: true, displayName: true, verificationStatus: true } },
          },
          orderBy: { startDate: "asc" },
          take: 120,
        }),
    prisma.contentCollection.count({ where: { AND: [publicCollectionVisibilityWhere(now), { ...orF }] } }),
    type === "season"
      ? []
      : prisma.blogPost.findMany({
          where: { ...PUB, ...orF },
          orderBy: { publishedAt: "desc" },
          take: TAKE,
        }),
    prisma.contentCollection.findMany({
      where: { AND: [publicCollectionVisibilityWhere(now), { ...orF }] },
      orderBy: { publishedAt: "desc" },
      take: TAKE,
    }),
  ]);

  const programsVis = (type === "season" ? [] : proList).filter((p) => isProgramPubliclyVisible(p)).slice(0, TAKE);

  const total = blogCount + programsVis.length + colCount;
  if (total < 1) return null;

  const resolved = resolveExploreHubSeo(env, type, res.slug, res.label);

  return {
    type,
    slug: res.slug,
    label: res.label,
    resolved,
    blogPosts: (type === "season" ? [] : blogList).map((b) => {
      const path = `/blog/${b.slug}`;
      const r = resolveBlogSeo(env, b, path);
      return {
        id: b.id,
        slug: b.slug,
        title: b.title,
        excerpt: b.excerpt,
        publishedAt: b.publishedAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
        resolved: {
          seoTitle: r.seoTitle,
          seoDescription: r.seoDescription,
          canonicalUrl: r.canonicalUrl,
          ogImage: r.ogImage,
        },
      };
    }),
    collections: colList.map((c) => {
      const path = `/collections/${c.slug}`;
      const r = resolveCollectionSeo(env, c, path);
      return {
        id: c.id,
        slug: c.slug,
        title: c.title,
        description: c.description,
        publishedAt: c.publishedAt?.toISOString() ?? null,
        updatedAt: c.updatedAt.toISOString(),
        resolved: { seoTitle: r.seoTitle, seoDescription: r.seoDescription, canonicalUrl: r.canonicalUrl, ogImage: r.ogImage },
      };
    }),
    programs: programsVis.map(cardFromProgram),
    counts: { blogPosts: blogCount, programs: programsVis.length, collections: colCount, total },
    breadcrumbs: {
      items: [
        { name: "Главная", path: "/" },
        { name: "Темы", path: "/explore" },
        { name: res.label, path: null },
      ],
    },
  };
}
