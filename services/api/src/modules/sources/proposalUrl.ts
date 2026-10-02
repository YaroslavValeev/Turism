import { detectSourceType, normalizeSourceUrlOrHandle } from "./sourceRegistry";

// Prisma-free on purpose: imported by pure validators (Scout) and by sourceProposal.ts.
const PROPOSAL_TYPES = new Set(["instagram", "telegram", "rss", "site"]);
const INSTAGRAM_NON_PROFILE_SEGMENTS = new Set(["p", "reel", "reels", "tv", "stories", "share"]);

export function normalizeProposedSourceUrl(value: unknown): { normalizedUrl: string; detectedType: string } {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("source_url_required");
  }
  const candidate = value.trim();
  const detectedType = detectSourceType(candidate);
  if (!PROPOSAL_TYPES.has(detectedType)) {
    throw new Error("unsupported_source_url");
  }
  const normalizedUrl = normalizeSourceUrlOrHandle(detectedType, candidate);
  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    throw new Error("invalid_source_url");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error("invalid_source_url");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || /^127\.|^0\.0\.0\.0$|^::1$/.test(hostname)) {
    throw new Error("unsafe_source_url");
  }
  if (detectedType === "instagram") {
    const firstPathSegment = parsed.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
    if (firstPathSegment && INSTAGRAM_NON_PROFILE_SEGMENTS.has(firstPathSegment)) {
      throw new Error("instagram_profile_required");
    }
  }
  return { normalizedUrl, detectedType };
}
