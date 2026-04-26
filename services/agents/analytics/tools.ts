import { createApiClient } from "../shared/http.js";

/** Соответствует `GET /metrics/content-entries` (G4.1). */
export type ContentEntriesResponse = {
  from: string;
  toInclusive: string;
  note?: string;
  totals: {
    bookingsInRange: number;
    withEntryPair: number;
    entryIncomplete: number;
    noEntryTracking: number;
  };
  rows: Array<{
    entryType: string;
    entryId: string;
    bookingCount: number;
    firstCreatedAt: string;
    lastCreatedAt: string;
    exploreType: string | null;
    exploreSlug: string | null;
  }>;
  truncated: boolean;
};

/**
 * G4.1: GET /metrics/content-entries (admin JWT или INTERNAL_ANALYTICS_TOKEN).
 */
export async function getContentEntries(params?: { from?: string; to?: string }): Promise<ContentEntriesResponse> {
  const client = createApiClient();
  const search = new URLSearchParams();
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  const q = search.toString();
  const path = `/metrics/content-entries${q ? `?${q}` : ""}`;
  const { data } = await client.get<ContentEntriesResponse>(path);
  return data;
}
