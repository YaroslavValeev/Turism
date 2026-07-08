const CAMPS_FEED_FILE = "camps-feed.json";

export interface CampListOptions {
  status: string;
  sports: string[];
  audience: string;
  limit: number;
  offset: number;
  updatedSince: Date | null;
}

export interface CampListResult {
  items: unknown[];
  nextOffset: number | null;
}

export async function listCamps(_opts: CampListOptions): Promise<CampListResult> {
  void CAMPS_FEED_FILE;
  return { items: [], nextOffset: null };
}

export async function getCampById(_id: string): Promise<unknown | null> {
  return null;
}
