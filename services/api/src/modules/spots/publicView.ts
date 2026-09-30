import {
  SPOT_MANDATORY_GATES,
  SPOT_RATING_BAND_LABEL_RU,
  SPOT_RATING_METHODOLOGY_VERSION,
  SPOT_RATING_WEIGHTS,
  type SpotRatingBand,
} from "./ratingEngine";

type DecimalLike = number | string | { toString(): string } | null;

export interface SnapshotRow {
  officialScore: DecimalLike;
  band: string | null;
  methodologyVersion: string;
  ratingVersion: string;
  publishedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}

export interface UnitRow {
  id: string;
  discipline: string;
  serviceName: string;
  equipmentConfig: unknown;
  isActive: boolean;
  snapshots: SnapshotRow[];
}

export interface SpotRow {
  id: string;
  name: string;
  region: string;
  address: string | null;
  latitude: DecimalLike;
  longitude: DecimalLike;
  waterBodyType: string | null;
  relatedToMyWave: boolean;
  serviceUnits: UnitRow[];
}

export interface PublicSpotRating {
  officialScore: number;
  band: SpotRatingBand;
  bandLabelRu: string;
  methodologyVersion: string;
  ratingVersion: string;
  publishedAt: string;
  expiresAt: string;
}

export interface PublicSpotUnit {
  id: string;
  discipline: string;
  serviceName: string;
  equipment: Record<string, string>;
  rating: PublicSpotRating | null;
}

export interface PublicSpot {
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
}

function toNumber(value: DecimalLike): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(n) ? n : null;
}

function isBand(value: string | null): value is SpotRatingBand {
  return value != null && value in SPOT_RATING_BAND_LABEL_RU;
}

/** Действующий = опубликован, не отозван, тест не истёк; из нескольких — последний опубликованный. */
export function pickCurrentSnapshot(snapshots: SnapshotRow[], now: Date): PublicSpotRating | null {
  const current = snapshots
    .filter((s) => s.publishedAt != null && s.revokedAt == null && s.expiresAt.getTime() > now.getTime())
    .sort((a, b) => b.publishedAt!.getTime() - a.publishedAt!.getTime())[0];
  if (!current) return null;
  const score = toNumber(current.officialScore);
  if (score == null || !isBand(current.band)) return null;
  return {
    officialScore: score,
    band: current.band,
    bandLabelRu: SPOT_RATING_BAND_LABEL_RU[current.band],
    methodologyVersion: current.methodologyVersion,
    ratingVersion: current.ratingVersion,
    publishedAt: current.publishedAt!.toISOString(),
    expiresAt: current.expiresAt.toISOString(),
  };
}

function publicEquipment(config: unknown): Record<string, string> {
  if (typeof config !== "object" || config === null || Array.isArray(config)) return {};
  const out: Record<string, string> = {};
  for (const key of ["boat", "model", "ballast"]) {
    const value = (config as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
  }
  return out;
}

export function toPublicSpot(spot: SpotRow, now: Date): PublicSpot {
  const units = spot.serviceUnits
    .filter((u) => u.isActive)
    .map((u) => ({
      id: u.id,
      discipline: u.discipline,
      serviceName: u.serviceName,
      equipment: publicEquipment(u.equipmentConfig),
      rating: pickCurrentSnapshot(u.snapshots, now),
    }));
  const bestRating = units
    .map((u) => u.rating)
    .filter((r): r is PublicSpotRating => r != null)
    .sort((a, b) => b.officialScore - a.officialScore)[0] ?? null;
  return {
    id: spot.id,
    name: spot.name,
    region: spot.region,
    address: spot.address,
    latitude: toNumber(spot.latitude),
    longitude: toNumber(spot.longitude),
    waterBodyType: spot.waterBodyType,
    relatedToMyWave: spot.relatedToMyWave,
    bestRating,
    units,
  };
}

/** Сначала споты с действующим рейтингом (по убыванию), затем остальные по региону и названию. */
export function sortPublicSpots(spots: PublicSpot[]): PublicSpot[] {
  return [...spots].sort((a, b) => {
    const sa = a.bestRating?.officialScore ?? -1;
    const sb = b.bestRating?.officialScore ?? -1;
    if (sa !== sb) return sb - sa;
    return a.region.localeCompare(b.region, "ru") || a.name.localeCompare(b.name, "ru");
  });
}

const CATEGORY_LABEL_RU: Record<keyof typeof SPOT_RATING_WEIGHTS, string> = {
  infrastructure: "Инфраструктура",
  instrument: "Инструмент (лодка и волна)",
  waterArea: "Акватория",
  personnel: "Персонал",
  safety: "Безопасность",
  atmosphere: "Атмосфера",
};

const GATE_LABEL_RU: Record<keyof typeof SPOT_MANDATORY_GATES, string> = {
  G01: "Рабочий инструмент",
  G02: "Безопасная акватория",
  G03: "Закрытая раздевалка",
  G04: "Туалет",
  G05: "Горячий душ",
  G06: "Инструктаж по безопасности",
  G07: "Аптечка и спасательные средства",
  G08: "Система безопасности",
};

export function publicMethodology() {
  return {
    methodologyVersion: SPOT_RATING_METHODOLOGY_VERSION,
    discipline: "wakesurf",
    categories: (Object.keys(SPOT_RATING_WEIGHTS) as Array<keyof typeof SPOT_RATING_WEIGHTS>).map((id) => ({
      id,
      label: CATEGORY_LABEL_RU[id],
      weight: SPOT_RATING_WEIGHTS[id],
    })),
    mandatoryGates: (Object.keys(SPOT_MANDATORY_GATES) as Array<keyof typeof SPOT_MANDATORY_GATES>).map((id) => ({
      id,
      label: GATE_LABEL_RU[id],
    })),
    bands: [
      { band: "premium_plus", label: SPOT_RATING_BAND_LABEL_RU.premium_plus, minScore: 9 },
      { band: "premium", label: SPOT_RATING_BAND_LABEL_RU.premium, minScore: 7.5 },
      { band: "standard", label: SPOT_RATING_BAND_LABEL_RU.standard, minScore: 6 },
      { band: "basic", label: SPOT_RATING_BAND_LABEL_RU.basic, minScore: 4 },
      { band: "below_standard", label: SPOT_RATING_BAND_LABEL_RU.below_standard, minScore: 0 },
    ],
    validityMonths: 12,
    principles: [
      "Оценка ставится конкретной услуге на споте после профессионального теста, а не месту в целом.",
      "Без пройденных обязательных требований рейтинг не публикуется.",
      "Отзывы, спонсорство, оплата и реклама на официальную оценку не влияют.",
      "Оценка действует 12 месяцев с даты теста, затем нужен повторный тест.",
      "Если спот связан с MyWave, нужны внешний эксперт и независимый редактор.",
    ],
  };
}
