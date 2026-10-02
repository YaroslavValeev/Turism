import {
  SPOT_MANDATORY_GATES,
  SPOT_RATING_WEIGHTS,
  type GateStatus,
  type SpotMandatoryGateId,
  type SpotRatingCategory,
} from "./ratingEngine";

export type Parsed<T> = { ok: true; data: T } | { ok: false; error: string };

export const SPOT_DISCOVERY_STATUSES = ["candidate", "listed", "archived"] as const;
export const SPOT_WATER_BODY_TYPES = ["lake", "river", "reservoir", "sea", "bay"] as const;
export const SPOT_DISCIPLINES = ["wakesurf"] as const;

export const SPOT_CATEGORIES = Object.keys(SPOT_RATING_WEIGHTS) as SpotRatingCategory[];
export const SPOT_GATE_IDS = Object.keys(SPOT_MANDATORY_GATES) as SpotMandatoryGateId[];

export type SpotAuditStatus = "draft" | "submitted" | "signed" | "void";

const NAME_MAX = 200;
const TEXT_MAX = 5000;

function fail<T>(error: string): Parsed<T> {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown, field: string, max: number): Parsed<string | null | undefined> {
  if (value === undefined) return { ok: true, data: undefined };
  if (value === null) return { ok: true, data: null };
  if (typeof value !== "string") return fail(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length > max) return fail(`${field} is too long`);
  return { ok: true, data: trimmed === "" ? null : trimmed };
}

function requiredText(value: unknown, field: string, max: number): Parsed<string> {
  if (typeof value !== "string" || value.trim() === "") return fail(`${field} is required`);
  if (value.trim().length > max) return fail(`${field} is too long`);
  return { ok: true, data: value.trim() };
}

function optionalCoordinate(value: unknown, field: string, limit: number): Parsed<number | null | undefined> {
  if (value === undefined) return { ok: true, data: undefined };
  if (value === null || value === "") return { ok: true, data: null };
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || Math.abs(n) > limit) return fail(`${field} must be a number between -${limit} and ${limit}`);
  return { ok: true, data: Math.round(n * 1e6) / 1e6 };
}

function optionalEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): Parsed<T | null | undefined> {
  if (value === undefined) return { ok: true, data: undefined };
  if (value === null || value === "") return { ok: true, data: null };
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    return fail(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return { ok: true, data: value as T };
}

function optionalBoolean(value: unknown, field: string): Parsed<boolean | undefined> {
  if (value === undefined) return { ok: true, data: undefined };
  if (typeof value !== "boolean") return fail(`${field} must be a boolean`);
  return { ok: true, data: value };
}

function optionalDate(value: unknown, field: string): Parsed<Date | undefined> {
  if (value === undefined) return { ok: true, data: undefined };
  if (typeof value !== "string") return fail(`${field} must be an ISO date string`);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fail(`${field} must be an ISO date string`);
  return { ok: true, data: d };
}

export interface SpotInput {
  name?: string;
  region?: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  waterBodyType?: string | null;
  organizerId?: string | null;
  relatedToMyWave?: boolean;
  discoveryStatus?: string;
}

export function parseSpotInput(body: unknown, mode: "create" | "patch"): Parsed<SpotInput> {
  if (!isRecord(body)) return fail("body must be an object");
  const data: SpotInput = {};

  if (mode === "create" || body.name !== undefined) {
    const name = requiredText(body.name, "name", NAME_MAX);
    if (!name.ok) return name;
    data.name = name.data;
  }
  if (mode === "create" || body.region !== undefined) {
    const region = requiredText(body.region, "region", NAME_MAX);
    if (!region.ok) return region;
    data.region = region.data;
  }

  const address = optionalText(body.address, "address", 500);
  if (!address.ok) return address;
  if (address.data !== undefined) data.address = address.data;

  const lat = optionalCoordinate(body.latitude, "latitude", 90);
  if (!lat.ok) return lat;
  const lng = optionalCoordinate(body.longitude, "longitude", 180);
  if (!lng.ok) return lng;
  if (lat.data !== undefined) data.latitude = lat.data;
  if (lng.data !== undefined) data.longitude = lng.data;
  if ((data.latitude == null) !== (data.longitude == null)) {
    return fail("latitude and longitude must be set together");
  }

  const water = optionalEnum(body.waterBodyType, "waterBodyType", SPOT_WATER_BODY_TYPES);
  if (!water.ok) return water;
  if (water.data !== undefined) data.waterBodyType = water.data;

  const organizerId = optionalText(body.organizerId, "organizerId", 100);
  if (!organizerId.ok) return organizerId;
  if (organizerId.data !== undefined) data.organizerId = organizerId.data;

  const related = optionalBoolean(body.relatedToMyWave, "relatedToMyWave");
  if (!related.ok) return related;
  if (related.data !== undefined) data.relatedToMyWave = related.data;

  const status = optionalEnum(body.discoveryStatus, "discoveryStatus", SPOT_DISCOVERY_STATUSES);
  if (!status.ok) return status;
  if (status.data) data.discoveryStatus = status.data;

  if (mode === "patch" && Object.keys(data).length === 0) return fail("nothing to update");
  return { ok: true, data };
}

export interface UnitInput {
  discipline?: string;
  serviceName?: string;
  equipmentConfig?: Record<string, unknown>;
  isActive?: boolean;
}

export function parseUnitInput(body: unknown, mode: "create" | "patch"): Parsed<UnitInput> {
  if (!isRecord(body)) return fail("body must be an object");
  const data: UnitInput = {};

  if (mode === "create" || body.serviceName !== undefined) {
    const serviceName = requiredText(body.serviceName, "serviceName", NAME_MAX);
    if (!serviceName.ok) return serviceName;
    data.serviceName = serviceName.data;
  }

  const discipline = optionalEnum(body.discipline, "discipline", SPOT_DISCIPLINES);
  if (!discipline.ok) return discipline;
  if (discipline.data) data.discipline = discipline.data;

  if (mode === "create" || body.equipmentConfig !== undefined) {
    if (!isRecord(body.equipmentConfig)) return fail("equipmentConfig must be an object (boat, model, ballast…)");
    if (JSON.stringify(body.equipmentConfig).length > TEXT_MAX) return fail("equipmentConfig is too large");
    data.equipmentConfig = body.equipmentConfig;
  }

  const isActive = optionalBoolean(body.isActive, "isActive");
  if (!isActive.ok) return isActive;
  if (isActive.data !== undefined) data.isActive = isActive.data;

  if (mode === "patch" && Object.keys(data).length === 0) return fail("nothing to update");
  return { ok: true, data };
}

export interface AuditInput {
  testedAt?: Date;
  methodologyId?: string;
  methodologyVersion?: string;
  protocolVersion?: string;
  criteriaVersion?: string;
  externalExpertConfirmed?: boolean;
  externalExpertName?: string | null;
  independentEditorUserId?: string | null;
  notes?: string | null;
}

export function parseAuditInput(body: unknown, mode: "create" | "patch"): Parsed<AuditInput> {
  if (!isRecord(body)) return fail("body must be an object");
  const data: AuditInput = {};

  if (mode === "create" && body.testedAt === undefined) return fail("testedAt is required");
  const testedAt = optionalDate(body.testedAt, "testedAt");
  if (!testedAt.ok) return testedAt;
  if (testedAt.data) data.testedAt = testedAt.data;

  const pinFields = ["methodologyId", "methodologyVersion", "protocolVersion", "criteriaVersion"] as const;
  if (mode === "patch") {
    if (pinFields.some((field) => body[field] !== undefined)) {
      return fail("methodology is pinned to the assessment; create a new assessment to change it");
    }
  } else {
    // Оценка закрепляется за методикой: по methodologyId либо по полному набору версий.
    const versionsRequired = body.methodologyId === undefined;
    for (const field of pinFields) {
      if (body[field] !== undefined || (versionsRequired && field !== "methodologyId")) {
        const v = requiredText(body[field], field, 100);
        if (!v.ok) return v;
        data[field] = v.data;
      }
    }
  }

  const external = optionalBoolean(body.externalExpertConfirmed, "externalExpertConfirmed");
  if (!external.ok) return external;
  if (external.data !== undefined) data.externalExpertConfirmed = external.data;

  const externalName = optionalText(body.externalExpertName, "externalExpertName", NAME_MAX);
  if (!externalName.ok) return externalName;
  if (externalName.data !== undefined) data.externalExpertName = externalName.data;

  const editor = optionalText(body.independentEditorUserId, "independentEditorUserId", 100);
  if (!editor.ok) return editor;
  if (editor.data !== undefined) data.independentEditorUserId = editor.data;

  const notes = optionalText(body.notes, "notes", TEXT_MAX);
  if (!notes.ok) return notes;
  if (notes.data !== undefined) data.notes = notes.data;

  if (mode === "patch" && Object.keys(data).length === 0) return fail("nothing to update");
  return { ok: true, data };
}

/** Шкала 0–10 с шагом 0.1: так хранится Decimal(3,1), лишние знаки не округляем молча. */
export function parseCategoryScores(body: unknown): Parsed<Partial<Record<SpotRatingCategory, number>>> {
  if (!isRecord(body) || !isRecord(body.scores)) return fail("scores must be an object");
  const out: Partial<Record<SpotRatingCategory, number>> = {};
  for (const [key, raw] of Object.entries(body.scores)) {
    if (!(SPOT_CATEGORIES as string[]).includes(key)) {
      return fail(`unknown category: ${key}; allowed: ${SPOT_CATEGORIES.join(", ")}`);
    }
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > 10) {
      return fail(`${key} score must be a number between 0 and 10`);
    }
    if (Math.round(raw * 10) !== raw * 10) return fail(`${key} score must have at most one decimal place`);
    out[key as SpotRatingCategory] = raw;
  }
  if (Object.keys(out).length === 0) return fail("scores must not be empty");
  return { ok: true, data: out };
}

export function parseGateResults(body: unknown): Parsed<Partial<Record<SpotMandatoryGateId, GateStatus>>> {
  if (!isRecord(body) || !isRecord(body.gates)) return fail("gates must be an object");
  const out: Partial<Record<SpotMandatoryGateId, GateStatus>> = {};
  for (const [key, raw] of Object.entries(body.gates)) {
    if (!(SPOT_GATE_IDS as string[]).includes(key)) return fail(`unknown gate: ${key}`);
    if (raw !== "pass" && raw !== "fail" && raw !== "unknown") return fail(`${key} must be pass, fail or unknown`);
    out[key as SpotMandatoryGateId] = raw;
  }
  if (Object.keys(out).length === 0) return fail("gates must not be empty");
  return { ok: true, data: out };
}

export function parseEvidenceCriterion(value: unknown): Parsed<string | null> {
  if (value === undefined || value === null || value === "") return { ok: true, data: null };
  if (typeof value !== "string") return fail("criterion must be a string");
  if (!(SPOT_CATEGORIES as string[]).includes(value) && !(SPOT_GATE_IDS as string[]).includes(value)) {
    return fail(`criterion must be a category (${SPOT_CATEGORIES.join(", ")}) or a gate (G01–G08)`);
  }
  return { ok: true, data: value };
}

const AUDIT_TRANSITIONS: Record<SpotAuditStatus, SpotAuditStatus[]> = {
  draft: ["submitted", "void"],
  submitted: ["draft", "signed", "void"],
  signed: ["void"],
  void: [],
};

export function canTransitionAudit(from: string, to: SpotAuditStatus): boolean {
  return (AUDIT_TRANSITIONS[from as SpotAuditStatus] ?? []).includes(to);
}
