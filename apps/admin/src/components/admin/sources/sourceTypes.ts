export type OrganizerOption = {
  id: string;
  displayName: string;
};

export type SourceRun = {
  id: string;
  status: string;
  runType: string;
  startedAt: string;
  finishedAt: string | null;
  itemsFound: number;
  itemsCreated: number;
  errorMessage: string | null;
};

export type SourceRecord = {
  id: string;
  type: string;
  name: string;
  urlOrHandle: string;
  discipline: string | null;
  country: string | null;
  region: string | null;
  language: string | null;
  priority: number;
  trustScore: number;
  parserProfile: string | null;
  fetchIntervalMinutes: number;
  isActive: boolean;
  organizerId: string | null;
  metaJson?: {
    autoPublish?: boolean;
    fallbackImageUrl?: string;
  } | null;
  organizer: OrganizerOption | null;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  runs: SourceRun[];
  _count: { rawItems: number };
};

export type SourceDraft = {
  type: string;
  name: string;
  urlOrHandle: string;
  discipline: string;
  country: string;
  region: string;
  language: string;
  priority: string;
  trustScore: string;
  parserProfile: string;
  fetchIntervalMinutes: string;
  organizerId: string;
  isActive: boolean;
  autoPublish: boolean;
  fallbackImageUrl: string;
};

export const EMPTY_DRAFT: SourceDraft = {
  type: "instagram",
  name: "",
  urlOrHandle: "",
  discipline: "",
  country: "",
  region: "",
  language: "ru",
  priority: "100",
  trustScore: "0.5",
  parserProfile: "",
  fetchIntervalMinutes: "1440",
  organizerId: "",
  isActive: true,
  autoPublish: false,
  fallbackImageUrl: "",
};

export function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

export type LinkageBackfillSummary = {
  scanned: number;
  no_meta_channel_id: number;
  channel_not_found: number;
  organizer_mismatch: number;
  would_link: number;
  duplicate_would_link: number;
  channel_already_linked_elsewhere: number;
  applyable: number;
};

export type LinkageBackfillRow = {
  sourceId: string;
  organizerId: string | null;
  metaChannelId: string | null;
  proposedExternalChannelId: string | null;
  status: string;
  detail?: string;
};

export type LinkageBackfillReport = {
  mode: "dry_run" | "apply";
  writeEnabled: boolean;
  organizerScope: string | null;
  summary: LinkageBackfillSummary;
  rows: LinkageBackfillRow[];
  appliedCount?: number;
};

export const LINKAGE_ROWS_PREVIEW = 60;

export const LINKAGE_KPI_KEYS: [keyof LinkageBackfillSummary, string][] = [
  ["scanned", "Проверено"],
  ["applyable", "К записи (would_link)"],
  ["would_link", "would_link"],
  ["no_meta_channel_id", "Нет channel в meta"],
  ["channel_not_found", "Канал не найден"],
  ["organizer_mismatch", "Organizer ≠ канал"],
  ["duplicate_would_link", "Дубль на канал"],
  ["channel_already_linked_elsewhere", "FK уже у другого"],
];

export function toDraft(source: SourceRecord): SourceDraft {
  return {
    type: source.type,
    name: source.name,
    urlOrHandle: source.urlOrHandle,
    discipline: source.discipline ?? "",
    country: source.country ?? "",
    region: source.region ?? "",
    language: source.language ?? "",
    priority: String(source.priority),
    trustScore: String(source.trustScore),
    parserProfile: source.parserProfile ?? "",
    fetchIntervalMinutes: String(source.fetchIntervalMinutes),
    organizerId: source.organizerId ?? "",
    isActive: source.isActive,
    autoPublish: Boolean(source.metaJson?.autoPublish),
    fallbackImageUrl: source.metaJson?.fallbackImageUrl ?? "",
  };
}

export type SourceActiveFilter = "all" | "active" | "inactive";
