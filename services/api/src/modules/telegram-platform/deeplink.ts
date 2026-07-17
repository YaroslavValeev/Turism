/**
 * Парсинг и валидация deep-link payload (не доверять клиенту без проверки program/lead в БД).
 */

export type DeeplinkKind =
  | "program"
  | "apply"
  | "similar"
  | "subscribe"
  | "post"
  | "lead"
  | "unknown";

export type ParsedDeeplink = {
  kind: DeeplinkKind;
  raw: string;
  programId?: string;
  leadToken?: string;
  disciplineSlug?: string;
  subscribeKey?: string;
  channelPostId?: string;
};

const PROGRAM_RE = /^program_([a-z0-9]{8,32})$/i;
const APPLY_RE = /^apply_([a-z0-9]{8,32})$/i;
const SIMILAR_RE = /^similar_([a-z0-9_-]{2,64})$/i;
const SUBSCRIBE_RE = /^subscribe_([a-z0-9_-]{2,128})$/i;
const POST_RE = /^post_([a-z0-9]{8,64})$/i;
const LEAD_RE = /^lead_([a-z0-9]{16,64})$/i;

export function parseDeeplinkPayload(raw: string | undefined | null): ParsedDeeplink | null {
  const payload = raw?.trim();
  if (!payload) return null;

  let m = payload.match(PROGRAM_RE);
  if (m) return { kind: "program", raw: payload, programId: m[1] };

  m = payload.match(APPLY_RE);
  if (m) return { kind: "apply", raw: payload, programId: m[1] };

  m = payload.match(SIMILAR_RE);
  if (m) return { kind: "similar", raw: payload, disciplineSlug: m[1] };

  m = payload.match(SUBSCRIBE_RE);
  if (m) return { kind: "subscribe", raw: payload, subscribeKey: m[1] };

  m = payload.match(POST_RE);
  if (m) return { kind: "post", raw: payload, channelPostId: m[1] };

  m = payload.match(LEAD_RE);
  if (m) return { kind: "lead", raw: payload, leadToken: m[1] };

  return { kind: "unknown", raw: payload };
}
