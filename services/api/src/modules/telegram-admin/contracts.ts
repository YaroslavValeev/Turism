export const TELEGRAM_ADMIN_CALLBACK_PREFIX = "MTA1";

export const CAMP_MODERATION_STATUSES = [
  "new",
  "needs_review",
  "approved",
  "published",
  "hidden",
  "archived",
] as const;

export type CampModerationStatus = (typeof CAMP_MODERATION_STATUSES)[number];

export const CAMP_CONTENT_RIGHTS_STATUSES = [
  "partner_allowed",
  "unknown",
  "restricted",
] as const;

export type CampContentRightsStatus = (typeof CAMP_CONTENT_RIGHTS_STATUSES)[number];

export const CAMP_ADMIN_ACTIONS = [
  "approve",
  "publish",
  "hide",
  "archive",
  "rights_allowed",
  "rights_unknown",
  "rights_restricted",
  "rights_request",
  "duplicate_review",
] as const;

export type CampAdminAction = (typeof CAMP_ADMIN_ACTIONS)[number];

const CAMP_ACTION_TO_CODE: Record<CampAdminAction, string> = {
  approve: "APP",
  publish: "PUB",
  hide: "HID",
  archive: "ARC",
  rights_allowed: "RAL",
  rights_unknown: "RUN",
  rights_restricted: "RRS",
  rights_request: "RQR",
  duplicate_review: "DUP",
};

const CAMP_CODE_TO_ACTION = Object.fromEntries(
  Object.entries(CAMP_ACTION_TO_CODE).map(([action, code]) => [code, action]),
) as Record<string, CampAdminAction>;

export interface CampAdminCallback {
  entity: "camp";
  action: CampAdminAction;
  id: string;
}

/** Program publish operator flow (отдельно от camp moderation graph). */
export const PROGRAM_ADMIN_ACTIONS = [
  "preview",
  "publish",
  "needs_fix",
  "cancel",
] as const;

export type ProgramAdminAction = (typeof PROGRAM_ADMIN_ACTIONS)[number];

const PROGRAM_ACTION_TO_CODE: Record<ProgramAdminAction, string> = {
  preview: "PRV",
  publish: "PUB",
  needs_fix: "NFX",
  cancel: "CXL",
};

const PROGRAM_CODE_TO_ACTION = Object.fromEntries(
  Object.entries(PROGRAM_ACTION_TO_CODE).map(([action, code]) => [code, action]),
) as Record<string, ProgramAdminAction>;

export interface ProgramAdminCallback {
  entity: "program";
  action: ProgramAdminAction;
  id: string;
}

/** Операторский пульт /menu. Действия с `_confirm` выполняются только после второго нажатия. */
export const MENU_ADMIN_ACTIONS = [
  "home",
  "queue",
  "status",
  "sync",
  "sync_confirm",
  "media",
  "media_confirm",
  "close",
] as const;

export type MenuAdminAction = (typeof MENU_ADMIN_ACTIONS)[number];

const MENU_ACTION_TO_CODE: Record<MenuAdminAction, string> = {
  home: "HOM",
  queue: "QUE",
  status: "STA",
  sync: "SYN",
  sync_confirm: "SYY",
  media: "MED",
  media_confirm: "MEY",
  close: "CXL",
};

const MENU_CODE_TO_ACTION = Object.fromEntries(
  Object.entries(MENU_ACTION_TO_CODE).map(([action, code]) => [code, action]),
) as Record<string, MenuAdminAction>;

export interface MenuAdminCallback {
  entity: "menu";
  action: MenuAdminAction;
}

export type TelegramAdminCallback = CampAdminCallback | ProgramAdminCallback | MenuAdminCallback;

export function buildMenuAdminCallback(action: MenuAdminAction): string {
  return assertCallbackSize(`${TELEGRAM_ADMIN_CALLBACK_PREFIX}|M|${MENU_ACTION_TO_CODE[action]}|0`);
}

export function parseMenuAdminCallback(raw: string | undefined): MenuAdminCallback | null {
  if (!raw) return null;
  const [prefix, entity, code, ...rest] = raw.split("|");
  if (prefix !== TELEGRAM_ADMIN_CALLBACK_PREFIX || entity !== "M" || rest.length !== 1) {
    return null;
  }
  const action = MENU_CODE_TO_ACTION[code ?? ""];
  return action ? { entity: "menu", action } : null;
}

function assertCallbackSize(payload: string): string {
  if (Buffer.byteLength(payload, "utf8") > 64) {
    throw new Error("telegram callback_data exceeds 64 bytes");
  }
  return payload;
}

export function buildCampAdminCallback(input: CampAdminCallback): string {
  const id = input.id.trim();
  if (!id) throw new Error("id is required");
  return assertCallbackSize(
    `${TELEGRAM_ADMIN_CALLBACK_PREFIX}|C|${CAMP_ACTION_TO_CODE[input.action]}|${id}`,
  );
}

export function buildProgramAdminCallback(input: ProgramAdminCallback): string {
  const id = input.id.trim();
  if (!id) throw new Error("id is required");
  return assertCallbackSize(
    `${TELEGRAM_ADMIN_CALLBACK_PREFIX}|P|${PROGRAM_ACTION_TO_CODE[input.action]}|${id}`,
  );
}

export function parseCampAdminCallback(raw: string | undefined): CampAdminCallback | null {
  if (!raw) return null;
  const [prefix, entity, code, ...rest] = raw.split("|");
  if (prefix !== TELEGRAM_ADMIN_CALLBACK_PREFIX || entity !== "C" || rest.length !== 1) {
    return null;
  }
  const action = CAMP_CODE_TO_ACTION[code ?? ""];
  const id = rest[0]?.trim();
  if (!action || !id) return null;
  return { entity: "camp", action, id };
}

export function parseProgramAdminCallback(raw: string | undefined): ProgramAdminCallback | null {
  if (!raw) return null;
  const [prefix, entity, code, ...rest] = raw.split("|");
  if (prefix !== TELEGRAM_ADMIN_CALLBACK_PREFIX || entity !== "P" || rest.length !== 1) {
    return null;
  }
  const action = PROGRAM_CODE_TO_ACTION[code ?? ""];
  const id = rest[0]?.trim();
  if (!action || !id) return null;
  return { entity: "program", action, id };
}

/** Универсальный разбор MTA1 (camp, program или menu). */
export function parseTelegramAdminCallback(raw: string | undefined): TelegramAdminCallback | null {
  return parseProgramAdminCallback(raw) ?? parseCampAdminCallback(raw) ?? parseMenuAdminCallback(raw);
}
