"use client";

type ConsentState = "unknown" | "accepted" | "rejected";

const CONSENT_KEY = "mw_analytics_consent_v1";
const SESSION_KEY = "mw_analytics_session_v1";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    ym?: (id: number, method: string, ...args: unknown[]) => void;
  }
}

export function getAnalyticsConsent(): ConsentState {
  if (typeof window === "undefined") return "unknown";
  const v = window.localStorage.getItem(CONSENT_KEY);
  if (v === "accepted") return "accepted";
  if (v === "rejected") return "rejected";
  return "unknown";
}

export function setAnalyticsConsent(state: "accepted" | "rejected") {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONSENT_KEY, state);
  window.dispatchEvent(new Event("mw_analytics_consent_changed"));
}

/** Экспорт для согласованных ключей idempotency (например contract_view_block). */
export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "server";
  const existing = window.sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `sess_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  window.sessionStorage.setItem(SESSION_KEY, id);
  return id;
}

function pushGtag(...args: unknown[]) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(args);
}

export function trackGa4Event(name: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (getAnalyticsConsent() !== "accepted") return;
  if (typeof window.gtag !== "function") return;
  window.gtag("event", name, params ?? {});
}

export function trackYmEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (getAnalyticsConsent() !== "accepted") return;
  const ymIdRaw = process.env.NEXT_PUBLIC_YM_ID;
  if (!ymIdRaw) return;
  const ymId = Number(ymIdRaw);
  if (!Number.isFinite(ymId)) return;
  if (typeof window.ym !== "function") return;
  window.ym(ymId, "reachGoal", name, params ?? {});
}

export type TrackProductEventOptions = {
  /** Если не задан — часовой bucket на сессию+path (совместимость со старыми событиями). */
  idempotencyKey?: string;
  contract_version?: string;
};

export async function trackProductEvent(
  eventName: string,
  payload: Record<string, unknown> = {},
  options?: TrackProductEventOptions
) {
  if (typeof window === "undefined") return;
  if (getAnalyticsConsent() !== "accepted") return;

  const sessionId = getOrCreateSessionId();
  const idempotencyKey =
    options?.idempotencyKey ??
    `fe:${eventName}:${sessionId}:${window.location.pathname}:${new Date()
      .toISOString()
      .slice(0, 13)
      .replaceAll("-", "")}`;

  trackGa4Event(eventName, payload);
  trackYmEvent(eventName, payload);

  try {
    const reservedKeys = new Set([
      "page_type",
      "program_id",
      "organizer_id",
      "discipline",
      "region",
      "traffic_source",
      "user_role",
      "contract_version",
    ]);
    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (!reservedKeys.has(k)) extra[k] = v;
    }

    const contractVersion =
      typeof options?.contract_version === "string"
        ? options.contract_version
        : typeof payload.contract_version === "string"
          ? payload.contract_version
          : undefined;

    await fetch("/api/analytics/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        events: [
          {
            event_name: eventName,
            event_version: 1,
            event_source: "frontend",
            event_time: new Date().toISOString(),
            idempotency_key: idempotencyKey,
            session_id: sessionId,
            page_type: typeof payload.page_type === "string" ? payload.page_type : undefined,
            program_id: typeof payload.program_id === "string" ? payload.program_id : undefined,
            organizer_id: typeof payload.organizer_id === "string" ? payload.organizer_id : undefined,
            discipline: typeof payload.discipline === "string" ? payload.discipline : undefined,
            region: typeof payload.region === "string" ? payload.region : undefined,
            traffic_source: typeof payload.traffic_source === "string" ? payload.traffic_source : undefined,
            user_role: typeof payload.user_role === "string" ? payload.user_role : undefined,
            contract_version: contractVersion,
            properties_json: Object.keys(extra).length ? extra : undefined,
          },
        ],
      }),
    });
  } catch {
    // never break UX
  }
}

export function bootThirdPartyTags() {
  if (typeof window === "undefined") return;
  if (getAnalyticsConsent() !== "accepted") return;

  const gaId = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;
  if (gaId && typeof window.gtag !== "function") {
    pushGtag("js", new Date());
    pushGtag("config", gaId, { anonymize_ip: true });
  }
}
