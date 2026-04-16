export const ALLOWED_EVENT_NAMES = new Set<string>([
  // frontend
  "page_view",
  "view_item_list",
  "select_item",
  "view_item",
  "search",
  "apply_filter",
  "save_program",
  "share_program",
  "open_chat",
  "send_chat_message",
  "contract_download_pdf",
  "contract_download_docx",
  "contract_view_block",
  "contract_acknowledged",
  "organizer_apply_started",
  "organizer_apply_submitted",
  "organizer_contract_downloaded",
  "organizer_profile_completed",
  "program_submit_started",
  "program_submitted",
  // backend / system
  "lead_created",
  "lead_qualified",
  "lead_disqualified",
  "organizer_contacted_lead",
  "booking_created",
  "booking_confirmed",
  "booking_canceled",
  "payment_recorded",
  "refund_recorded",
  "commission_accrued",
  "commission_reversed",
  "statement_generated",
  "invoice_paid",
  "organizer_verified",
  "organizer_trusted",
  "contract_signed",
  "billing_connected",
  "complaint_created",
  "complaint_resolved",
  "review_submitted",
  "nps_submitted",
]);

const ALLOWED_EVENT_SOURCES = new Set(["frontend", "backend", "system"]);

const FORBIDDEN_SUBSTRINGS = ["@", "mailto:", "tel:", "passport"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type ParsedIngestionEvent = {
  eventName: string;
  eventVersion: number;
  eventSource: string;
  eventTime: Date;
  idempotencyKey: string;
  traceId?: string;
  sessionId?: string;
  userIdHash?: string;
  userRole?: string;
  pageType?: string;
  programId?: string;
  organizerId?: string;
  discipline?: string;
  region?: string;
  verifiedStatus?: string;
  trafficSource?: string;
  leadId?: string;
  bookingId?: string;
  statementId?: string;
  paymentId?: string;
  refundId?: string;
  commissionId?: string;
  contractVersion?: string;
  paymentStatus?: string;
  grossAmount?: number;
  netAmount?: number;
  refundAmount?: number;
  commissionRate?: number;
  commissionAmount?: number;
  propertiesJson?: Record<string, unknown> | null;
};

export type ValidationIssue =
  | { code: "INVALID_JSON"; message: string }
  | { code: "UNKNOWN_FIELD"; message: string }
  | { code: "INVALID_FIELD"; message: string }
  | { code: "NOT_ON_ALLOWLIST"; message: string }
  | { code: "PII_DETECTED"; message: string };

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  "event_name",
  "event_version",
  "event_source",
  "event_time",
  "idempotency_key",
  "trace_id",
  "session_id",
  "user_id_hash",
  "user_role",
  "page_type",
  "program_id",
  "organizer_id",
  "discipline",
  "region",
  "verified_status",
  "traffic_source",
  "lead_id",
  "booking_id",
  "statement_id",
  "payment_id",
  "refund_id",
  "commission_id",
  "contract_version",
  "payment_status",
  "gross_amount",
  "net_amount",
  "refund_amount",
  "commission_rate",
  "commission_amount",
  "properties_json",
]);

function asNonEmptyString(value: unknown, field: string): string | ValidationIssue {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { code: "INVALID_FIELD", message: `${field} must be a non-empty string` };
  }
  return value.trim();
}

function asInt(value: unknown, field: string): number | ValidationIssue {
  if (value === undefined || value === null) {
    return { code: "INVALID_FIELD", message: `${field} is required` };
  }
  if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value);
    if (Number.isFinite(n) && Number.isInteger(n)) return n;
  }
  return { code: "INVALID_FIELD", message: `${field} must be an integer` };
}

function scanForPiiText(text: string): boolean {
  const lower = text.toLowerCase();
  for (const s of FORBIDDEN_SUBSTRINGS) {
    if (lower.includes(s)) return true;
  }
  // very rough phone/email heuristics
  if (/\b\+?\d[\d\s\-()]{8,}\b/.test(text)) return true;
  if (/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(text)) return true;
  return false;
}

export function scanValueForPii(value: unknown, path: string): string | null {
  if (typeof value === "string") {
    if (scanForPiiText(value)) return `${path}: suspicious string`;
    return null;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = scanValueForPii(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) {
      const lowerKey = k.toLowerCase();
      if (
        lowerKey === "email" ||
        lowerKey.endsWith("_email") ||
        lowerKey.includes("phone") ||
        lowerKey.includes("telephone") ||
        lowerKey === "name" ||
        lowerKey.endsWith("_name") ||
        lowerKey.includes("firstname") ||
        lowerKey.includes("lastname") ||
        lowerKey.includes("full_name") ||
        lowerKey.includes("contact") ||
        lowerKey.includes("telegram") ||
        lowerKey === "inn" ||
        lowerKey.includes("passport")
      ) {
        return `${path}.${k}: forbidden key shape`;
      }
      const hit = scanValueForPii(v, `${path}.${k}`);
      if (hit) return hit;
    }
    return null;
  }
  return null;
}

export function parseIngestionEvent(raw: unknown): { ok: true; value: ParsedIngestionEvent } | { ok: false; issue: ValidationIssue } {
  if (!isPlainObject(raw)) {
    return { ok: false, issue: { code: "INVALID_JSON", message: "Event must be a JSON object" } };
  }
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
      return { ok: false, issue: { code: "UNKNOWN_FIELD", message: `Unknown field: ${key}` } };
    }
  }

  const eventName = asNonEmptyString(raw.event_name, "event_name");
  if (typeof eventName !== "string") return { ok: false, issue: eventName };
  if (!ALLOWED_EVENT_NAMES.has(eventName)) {
    return { ok: false, issue: { code: "NOT_ON_ALLOWLIST", message: `Unknown event_name: ${eventName}` } };
  }

  const eventSource = asNonEmptyString(raw.event_source, "event_source");
  if (typeof eventSource !== "string") return { ok: false, issue: eventSource };
  if (!ALLOWED_EVENT_SOURCES.has(eventSource)) {
    return { ok: false, issue: { code: "INVALID_FIELD", message: "event_source must be frontend|backend|system" } };
  }

  const idempotencyKey = asNonEmptyString(raw.idempotency_key, "idempotency_key");
  if (typeof idempotencyKey !== "string") return { ok: false, issue: idempotencyKey };

  const eventVersionRaw = raw.event_version ?? 1;
  const eventVersion = asInt(eventVersionRaw, "event_version");
  if (typeof eventVersion !== "number") return { ok: false, issue: eventVersion };
  if (eventVersion < 1) {
    return { ok: false, issue: { code: "INVALID_FIELD", message: "event_version must be >= 1" } };
  }

  const eventTimeRaw = asNonEmptyString(raw.event_time, "event_time");
  if (typeof eventTimeRaw !== "string") return { ok: false, issue: eventTimeRaw };
  const eventTime = new Date(eventTimeRaw);
  if (Number.isNaN(eventTime.valueOf())) {
    return { ok: false, issue: { code: "INVALID_FIELD", message: "event_time must be a valid ISO-8601 datetime" } };
  }

  const grossAmountRaw = raw.gross_amount;
  const grossAmount =
    grossAmountRaw === undefined || grossAmountRaw === null ? undefined : asInt(grossAmountRaw, "gross_amount");
  if (typeof grossAmount !== "number" && grossAmount !== undefined) return { ok: false, issue: grossAmount };

  const netAmountRaw = raw.net_amount;
  const netAmount = netAmountRaw === undefined || netAmountRaw === null ? undefined : asInt(netAmountRaw, "net_amount");
  if (typeof netAmount !== "number" && netAmount !== undefined) return { ok: false, issue: netAmount };

  const refundAmountRaw = raw.refund_amount;
  const refundAmount =
    refundAmountRaw === undefined || refundAmountRaw === null ? undefined : asInt(refundAmountRaw, "refund_amount");
  if (typeof refundAmount !== "number" && refundAmount !== undefined) return { ok: false, issue: refundAmount };

  const commissionRateRaw = raw.commission_rate;
  const commissionRate =
    commissionRateRaw === undefined || commissionRateRaw === null ? undefined : asInt(commissionRateRaw, "commission_rate");
  if (typeof commissionRate !== "number" && commissionRate !== undefined) return { ok: false, issue: commissionRate };

  const commissionAmountRaw = raw.commission_amount;
  const commissionAmount =
    commissionAmountRaw === undefined || commissionAmountRaw === null
      ? undefined
      : asInt(commissionAmountRaw, "commission_amount");
  if (typeof commissionAmount !== "number" && commissionAmount !== undefined) return { ok: false, issue: commissionAmount };

  let propertiesJson: Record<string, unknown> | null | undefined;
  if (raw.properties_json !== undefined && raw.properties_json !== null) {
    if (!isPlainObject(raw.properties_json)) {
      return { ok: false, issue: { code: "INVALID_FIELD", message: "properties_json must be an object" } };
    }
    propertiesJson = raw.properties_json;
  }

  const piiHit =
    scanValueForPii(raw.trace_id, "trace_id") ||
    scanValueForPii(raw.session_id, "session_id") ||
    scanValueForPii(raw.user_id_hash, "user_id_hash") ||
    scanValueForPii(raw.page_type, "page_type") ||
    scanValueForPii(raw.program_id, "program_id") ||
    scanValueForPii(raw.organizer_id, "organizer_id") ||
    scanValueForPii(raw.discipline, "discipline") ||
    scanValueForPii(raw.region, "region") ||
    scanValueForPii(raw.verified_status, "verified_status") ||
    scanValueForPii(raw.traffic_source, "traffic_source") ||
    scanValueForPii(raw.lead_id, "lead_id") ||
    scanValueForPii(raw.booking_id, "booking_id") ||
    scanValueForPii(raw.statement_id, "statement_id") ||
    scanValueForPii(raw.payment_id, "payment_id") ||
    scanValueForPii(raw.refund_id, "refund_id") ||
    scanValueForPii(raw.commission_id, "commission_id") ||
    scanValueForPii(raw.contract_version, "contract_version") ||
    scanValueForPii(raw.payment_status, "payment_status") ||
    scanValueForPii(propertiesJson, "properties_json");
  if (piiHit) {
    return { ok: false, issue: { code: "PII_DETECTED", message: piiHit } };
  }

  const optionalString = (v: unknown, field: string): string | undefined | ValidationIssue => {
    if (v === undefined || v === null) return undefined;
    if (typeof v !== "string") return { code: "INVALID_FIELD", message: `${field} must be a string` };
    const t = v.trim();
    return t.length ? t : undefined;
  };

  const readOptionalString = (v: unknown, field: string): { ok: true; value?: string } | { ok: false; issue: ValidationIssue } => {
    const parsed = optionalString(v, field);
    if (parsed && typeof parsed === "object" && "code" in parsed) {
      return { ok: false, issue: parsed };
    }
    return { ok: true, value: parsed as string | undefined };
  };

  const traceId = readOptionalString(raw.trace_id, "trace_id");
  if (!traceId.ok) return { ok: false, issue: traceId.issue };
  const sessionId = readOptionalString(raw.session_id, "session_id");
  if (!sessionId.ok) return { ok: false, issue: sessionId.issue };
  const userIdHash = readOptionalString(raw.user_id_hash, "user_id_hash");
  if (!userIdHash.ok) return { ok: false, issue: userIdHash.issue };
  const userRole = readOptionalString(raw.user_role, "user_role");
  if (!userRole.ok) return { ok: false, issue: userRole.issue };
  const pageType = readOptionalString(raw.page_type, "page_type");
  if (!pageType.ok) return { ok: false, issue: pageType.issue };
  const programId = readOptionalString(raw.program_id, "program_id");
  if (!programId.ok) return { ok: false, issue: programId.issue };
  const organizerId = readOptionalString(raw.organizer_id, "organizer_id");
  if (!organizerId.ok) return { ok: false, issue: organizerId.issue };
  const discipline = readOptionalString(raw.discipline, "discipline");
  if (!discipline.ok) return { ok: false, issue: discipline.issue };
  const region = readOptionalString(raw.region, "region");
  if (!region.ok) return { ok: false, issue: region.issue };
  const verifiedStatus = readOptionalString(raw.verified_status, "verified_status");
  if (!verifiedStatus.ok) return { ok: false, issue: verifiedStatus.issue };
  const trafficSource = readOptionalString(raw.traffic_source, "traffic_source");
  if (!trafficSource.ok) return { ok: false, issue: trafficSource.issue };
  const leadId = readOptionalString(raw.lead_id, "lead_id");
  if (!leadId.ok) return { ok: false, issue: leadId.issue };
  const bookingId = readOptionalString(raw.booking_id, "booking_id");
  if (!bookingId.ok) return { ok: false, issue: bookingId.issue };
  const statementId = readOptionalString(raw.statement_id, "statement_id");
  if (!statementId.ok) return { ok: false, issue: statementId.issue };
  const paymentId = readOptionalString(raw.payment_id, "payment_id");
  if (!paymentId.ok) return { ok: false, issue: paymentId.issue };
  const refundId = readOptionalString(raw.refund_id, "refund_id");
  if (!refundId.ok) return { ok: false, issue: refundId.issue };
  const commissionId = readOptionalString(raw.commission_id, "commission_id");
  if (!commissionId.ok) return { ok: false, issue: commissionId.issue };
  const contractVersion = readOptionalString(raw.contract_version, "contract_version");
  if (!contractVersion.ok) return { ok: false, issue: contractVersion.issue };
  const paymentStatus = readOptionalString(raw.payment_status, "payment_status");
  if (!paymentStatus.ok) return { ok: false, issue: paymentStatus.issue };

  const built: ParsedIngestionEvent = {
      eventName,
      eventVersion,
      eventSource,
      eventTime,
      idempotencyKey,
      traceId: traceId.value,
      sessionId: sessionId.value,
      userIdHash: userIdHash.value,
      userRole: userRole.value,
      pageType: pageType.value,
      programId: programId.value,
      organizerId: organizerId.value,
      discipline: discipline.value,
      region: region.value,
      verifiedStatus: verifiedStatus.value,
      trafficSource: trafficSource.value,
      leadId: leadId.value,
      bookingId: bookingId.value,
      statementId: statementId.value,
      paymentId: paymentId.value,
      refundId: refundId.value,
      commissionId: commissionId.value,
      contractVersion: contractVersion.value,
      paymentStatus: paymentStatus.value,
      grossAmount,
      netAmount,
      refundAmount,
      commissionRate,
      commissionAmount,
      propertiesJson: propertiesJson ?? null,
    };

  const contractIssue = validateContractInstrumentationEvent(built);
  if (contractIssue) {
    return { ok: false, issue: contractIssue };
  }

  return { ok: true, value: built };
}

const CONTRACT_INSTRUMENTATION_EVENTS = new Set([
  "contract_view_block",
  "contract_download_pdf",
  "contract_download_docx",
  "contract_acknowledged",
]);

/** Доп. правила для воронки договора (Phase 2 runtime). */
export function validateContractInstrumentationEvent(e: ParsedIngestionEvent): ValidationIssue | null {
  if (!CONTRACT_INSTRUMENTATION_EVENTS.has(e.eventName)) {
    return null;
  }
  if (e.eventSource !== "frontend") {
    return { code: "INVALID_FIELD", message: "contract instrumentation events must use event_source=frontend" };
  }
  if (!e.sessionId || !e.sessionId.trim()) {
    return { code: "INVALID_FIELD", message: "session_id is required for contract instrumentation events" };
  }
  if (!e.userRole || !e.userRole.trim()) {
    return { code: "INVALID_FIELD", message: "user_role is required for contract instrumentation events" };
  }
  if (!e.contractVersion || !e.contractVersion.trim()) {
    return { code: "INVALID_FIELD", message: "contract_version is required for contract instrumentation events" };
  }
  const p = e.propertiesJson;
  if (!p || typeof p !== "object") {
    return { code: "INVALID_FIELD", message: "properties_json is required for contract instrumentation events" };
  }
  const area = p.area;
  const page = p.page;
  const fileType = p.file_type;
  const component = p.component;
  if (area !== "organizers") {
    return { code: "INVALID_FIELD", message: "properties_json.area must be organizers" };
  }
  if (page !== "program" && page !== "verification") {
    return { code: "INVALID_FIELD", message: "properties_json.page must be program or verification" };
  }
  if (typeof component !== "string" || !component.trim() || component.length > 200) {
    return { code: "INVALID_FIELD", message: "properties_json.component must be a non-empty string (<=200)" };
  }
  if (fileType !== "pdf" && fileType !== "docx" && fileType !== "none") {
    return { code: "INVALID_FIELD", message: "properties_json.file_type must be pdf, docx, or none" };
  }
  if (e.eventName === "contract_download_pdf" && fileType !== "pdf") {
    return { code: "INVALID_FIELD", message: "contract_download_pdf requires properties_json.file_type=pdf" };
  }
  if (e.eventName === "contract_download_docx" && fileType !== "docx") {
    return { code: "INVALID_FIELD", message: "contract_download_docx requires properties_json.file_type=docx" };
  }
  if ((e.eventName === "contract_view_block" || e.eventName === "contract_acknowledged") && fileType !== "none") {
    return {
      code: "INVALID_FIELD",
      message: `${e.eventName} requires properties_json.file_type=none`,
    };
  }
  return null;
}
