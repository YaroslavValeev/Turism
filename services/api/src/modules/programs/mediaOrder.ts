import type { Prisma } from "@prisma/client";

/** Обложка карточки — media[0] при этом порядке; id — стабильный tie-break для одинаковых position. */
export const PROGRAM_MEDIA_ORDER: Prisma.ProgramMediaOrderByWithRelationInput[] = [{ position: "asc" }, { id: "asc" }];

export const orderedProgramMedia = { orderBy: PROGRAM_MEDIA_ORDER };

export function nextMediaPosition(existing: ReadonlyArray<{ position: number }>): number {
  return existing.reduce((max, item) => Math.max(max, item.position + 1), 0);
}

export type MediaReorderResult = { ok: true; order: string[] } | { ok: false; error: string };

/** Новый порядок принимается только как перестановка всех медиа программы — без потерь и чужих id. */
export function validateMediaReorder(body: unknown, existingIds: ReadonlyArray<string>): MediaReorderResult {
  const raw = (body as { mediaIds?: unknown } | null)?.mediaIds;
  if (!Array.isArray(raw) || !raw.every((id) => typeof id === "string" && id.length > 0)) {
    return { ok: false, error: "mediaIds must be a non-empty array of media ids" };
  }
  const order = raw as string[];
  if (new Set(order).size !== order.length) return { ok: false, error: "mediaIds contains duplicates" };
  const known = new Set(existingIds);
  if (order.length !== known.size || !order.every((id) => known.has(id))) {
    return { ok: false, error: "mediaIds must list every media of this program exactly once" };
  }
  return { ok: true, order };
}
