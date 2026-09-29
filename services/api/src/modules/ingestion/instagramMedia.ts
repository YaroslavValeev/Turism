export type InstagramMediaEntry = { url: string; mediaType: "image" | "video" };

type InstagramNode = {
  display_url?: string | null;
  thumbnail_src?: string | null;
  thumbnail_tall_src?: string | null;
  video_url?: string | null;
  is_video?: boolean | null;
  edge_sidecar_to_children?: { edges?: Array<{ node?: InstagramNode | null } | null> | null } | null;
};

const MAX_INSTAGRAM_MEDIA_PER_POST = 10;

function normalizeUrl(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  return normalized.startsWith("//") ? `https:${normalized}` : normalized;
}

function nodeEntries(node: InstagramNode): InstagramMediaEntry[] {
  const image =
    normalizeUrl(node.display_url) ?? normalizeUrl(node.thumbnail_tall_src) ?? normalizeUrl(node.thumbnail_src);
  const video = node.is_video ? normalizeUrl(node.video_url) : null;
  const out: InstagramMediaEntry[] = [];
  // Reel/video: the poster frame is the usable card image, the clip goes alongside as video.
  if (image) out.push({ url: image, mediaType: "image" });
  if (video) out.push({ url: video, mediaType: "video" });
  if (!image && !video) {
    const fallback = normalizeUrl(node.video_url);
    if (fallback) out.push({ url: fallback, mediaType: "video" });
  }
  return out;
}

/**
 * All media of an Instagram timeline node from web_profile_info:
 * carousel children (edge_sidecar_to_children) in order, otherwise the single photo/reel.
 */
export function extractInstagramEdgeMedia(edge: Record<string, unknown>): InstagramMediaEntry[] {
  const node = edge as InstagramNode;
  const children = (node.edge_sidecar_to_children?.edges ?? [])
    .map((item) => item?.node ?? null)
    .filter((child): child is InstagramNode => Boolean(child) && typeof child === "object");

  const entries = children.length > 0 ? children.flatMap(nodeEntries) : nodeEntries(node);
  if (entries.length === 0 && children.length > 0) entries.push(...nodeEntries(node));

  const seen = new Set<string>();
  const unique: InstagramMediaEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.url)) continue;
    seen.add(entry.url);
    unique.push(entry);
    if (unique.length >= MAX_INSTAGRAM_MEDIA_PER_POST) break;
  }
  return unique;
}
