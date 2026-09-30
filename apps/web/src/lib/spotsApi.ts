import { getServerApiBaseUrl, safeServerFetch } from "./serverApiBase";

export type PublicSpotRating = {
  officialScore: number;
  band: string;
  bandLabelRu: string;
  methodologyVersion: string;
  ratingVersion: string;
  publishedAt: string;
  expiresAt: string;
};

export type PublicSpotUnit = {
  id: string;
  discipline: string;
  serviceName: string;
  equipment: Record<string, string>;
  rating: PublicSpotRating | null;
};

export type PublicSpot = {
  id: string;
  name: string;
  region: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  waterBodyType: string | null;
  relatedToMyWave: boolean;
  bestRating: PublicSpotRating | null;
  units: PublicSpotUnit[];
};

export type SpotsMethodology = {
  methodologyVersion: string;
  discipline: string;
  categories: { id: string; label: string; weight: number }[];
  mandatoryGates: { id: string; label: string }[];
  bands: { band: string; label: string; minScore: number }[];
  validityMonths: number;
  principles: string[];
};

export const WATER_BODY_LABEL_RU: Record<string, string> = {
  lake: "Озеро",
  river: "Река",
  reservoir: "Водохранилище",
  sea: "Море",
  bay: "Залив",
};

export const EQUIPMENT_LABEL_RU: Record<string, string> = {
  boat: "Лодка",
  model: "Модель",
  ballast: "Балласт",
};

export async function fetchPublicSpots(): Promise<PublicSpot[] | null> {
  const res = await safeServerFetch(`${getServerApiBaseUrl()}/public/spots`, { next: { revalidate: 300 } });
  if (!res || !res.ok) return null;
  const data = (await res.json()) as { items?: PublicSpot[] };
  return data.items ?? [];
}

export async function fetchPublicSpot(id: string): Promise<PublicSpot | null> {
  const clean = id.trim();
  if (!clean) return null;
  const res = await safeServerFetch(`${getServerApiBaseUrl()}/public/spots/${encodeURIComponent(clean)}`, {
    next: { revalidate: 300 },
  });
  if (!res || !res.ok) return null;
  const data = (await res.json()) as { spot?: PublicSpot };
  return data.spot ?? null;
}

export async function fetchSpotsMethodology(): Promise<SpotsMethodology | null> {
  const res = await safeServerFetch(`${getServerApiBaseUrl()}/public/spots/methodology`, {
    next: { revalidate: 3600 },
  });
  if (!res || !res.ok) return null;
  const data = (await res.json()) as { methodology?: SpotsMethodology };
  return data.methodology ?? null;
}

export function yandexMapsUrl(latitude: number, longitude: number): string {
  return `https://yandex.ru/maps/?pt=${longitude},${latitude}&z=15&l=map`;
}

export function formatScore(score: number): string {
  return score.toFixed(1).replace(".", ",");
}
