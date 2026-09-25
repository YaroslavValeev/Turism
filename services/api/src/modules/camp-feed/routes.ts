import { Router, type Request, type Response } from "express";
import { Prisma } from "@prisma/client";
import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { requireCampApiAuth } from "./auth";
import { mapProgramToCamp, resolveProgramIdFromCampId, type CampContract, type CampPublicationStatus, type CampSport } from "./mapper";
import { getCampApiRuntimeStatus, recordCampApiFeedError, recordCampApiFeedSuccess } from "./monitoring";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;

const campProgramInclude = {
  media: true,
  organizer: { select: { id: true, displayName: true, verificationStatus: true } },
  source: { select: { id: true, name: true, urlOrHandle: true, country: true, region: true, language: true } },
} satisfies Prisma.ProgramInclude;

const CAMP_TERMS = ["camp", "кэмп", "кемп", "лагерь"];

const SPORT_TERMS: Record<CampSport, string[]> = {
  wakesurf: ["wakesurf", "wake surf", "вейксерф", "вейк-серф", "вейк серф"],
  wakeboard: ["wakeboard", "wake board", "вейкборд", "вейк-борд", "вейк борд"],
};

const STATUS_TO_PROGRAM_STATUSES: Record<CampPublicationStatus, string[]> = {
  published: ["published"],
  hidden: ["draft", "internal_review", "needs_fix", "approved", "paused"],
  archived: ["archived"],
};

export interface CampListQuery {
  status: CampPublicationStatus;
  sports: CampSport[];
  audience: "ru";
  updatedSince?: Date;
  limit: number;
  offset: number;
}

export interface CampListResponse {
  items: CampContract[];
  next_offset: number | null;
}

function parseCsv(value: string | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNonNegativeInt(value: string | undefined, fallback: number, max?: number): number | null {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return max == null ? parsed : Math.min(parsed, max);
}

export function parseCampListQuery(req: Request): { ok: true; query: CampListQuery } | { ok: false; error: string } {
  const raw = req.query as Record<string, string | undefined>;
  const status = (raw.status ?? "published") as CampPublicationStatus;
  if (!Object.prototype.hasOwnProperty.call(STATUS_TO_PROGRAM_STATUSES, status)) {
    return { ok: false, error: "status must be one of: published, hidden, archived" };
  }

  const sports = parseCsv(raw.sports ?? "wakesurf,wakeboard");
  if (sports.length === 0 || sports.some((sport) => sport !== "wakesurf" && sport !== "wakeboard")) {
    return { ok: false, error: "sports must be wakesurf,wakeboard" };
  }

  const audience = raw.audience ?? "ru";
  if (audience !== "ru") {
    return { ok: false, error: "audience must be ru" };
  }

  let updatedSince: Date | undefined;
  if (raw.updated_since) {
    updatedSince = new Date(raw.updated_since);
    if (Number.isNaN(updatedSince.getTime())) {
      return { ok: false, error: "updated_since must be a valid ISO date" };
    }
  }

  const limit = parseNonNegativeInt(raw.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const offset = parseNonNegativeInt(raw.offset, 0);
  if (limit == null || offset == null) {
    return { ok: false, error: "limit and offset must be non-negative integers" };
  }

  return {
    ok: true,
    query: {
      status,
      sports: sports as CampSport[],
      audience: "ru",
      updatedSince,
      limit,
      offset,
    },
  };
}

function stringContainsAny(field: "title" | "discipline" | "formatType" | "audienceFit", terms: string[]): Prisma.ProgramWhereInput[] {
  return terms.map((term) => ({
    [field]: { contains: term, mode: "insensitive" },
  }));
}

export function buildCampWhere(query: CampListQuery): Prisma.ProgramWhereInput {
  const programStatuses = STATUS_TO_PROGRAM_STATUSES[query.status];
  if (programStatuses.length === 0) return { id: "__no_cancelled_camp_status_in_program_model__" };

  const sportTerms = query.sports.flatMap((sport) => SPORT_TERMS[sport]);
  const and: Prisma.ProgramWhereInput[] = [
    { publishStatus: { in: programStatuses } },
    {
      OR: [
        ...stringContainsAny("formatType", CAMP_TERMS),
        ...stringContainsAny("title", CAMP_TERMS),
        ...stringContainsAny("audienceFit", CAMP_TERMS),
      ],
    },
    {
      OR: [
        ...stringContainsAny("discipline", sportTerms),
        ...stringContainsAny("title", sportTerms),
        ...stringContainsAny("audienceFit", sportTerms),
      ],
    },
  ];

  if (query.updatedSince) {
    and.push({
      OR: [
        { updatedAt: { gte: query.updatedSince } },
        { updatedFromSourceAt: { gte: query.updatedSince } },
      ],
    });
  }

  return { AND: and };
}

/**
 * offset/next_offset считаются по строкам БД, а не по кемпам после маппинга:
 * часть программ отсеивается mapProgramToCamp, и иначе клиент прекращал листать раньше времени.
 */
export function buildCampListResponse(
  pageCamps: CampContract[],
  hasMoreRows: boolean,
  query: Pick<CampListQuery, "limit" | "offset">,
): CampListResponse {
  if (query.limit <= 0) return { items: [], next_offset: null };
  return {
    items: pageCamps.slice(0, query.limit),
    next_offset: hasMoreRows ? query.offset + query.limit : null,
  };
}

async function listCamps(query: CampListQuery, env: Env): Promise<CampListResponse> {
  if (query.limit === 0) {
    const empty = buildCampListResponse([], false, query);
    recordCampApiFeedSuccess(empty.items.length, empty.next_offset);
    return empty;
  }

  const rows = await prisma.program.findMany({
    where: buildCampWhere(query),
    include: campProgramInclude,
    orderBy: [{ updatedFromSourceAt: "asc" }, { updatedAt: "asc" }, { id: "asc" }],
    take: query.limit + 1,
    skip: query.offset,
  });

  const camps = rows
    .slice(0, query.limit)
    .map((row) => mapProgramToCamp(row, env))
    .filter((camp): camp is CampContract => Boolean(camp));
  const payload = buildCampListResponse(camps, rows.length > query.limit, query);
  recordCampApiFeedSuccess(payload.items.length, payload.next_offset);
  return payload;
}

function sendCampListError(parsed: { ok: false; error: string }, res: Response): void {
  res.status(400).json({ error: parsed.error });
}

export function campFeedRoutes(env: Env): Router {
  const router = Router();
  const auth = requireCampApiAuth(env);

  async function handleList(req: Request, res: Response): Promise<void> {
    const parsed = parseCampListQuery(req);
    if (!parsed.ok) {
      sendCampListError(parsed, res);
      return;
    }

    try {
      const payload = await listCamps(parsed.query, env);
      res.set("Cache-Control", "private, max-age=60");
      res.json(payload);
    } catch (error) {
      recordCampApiFeedError(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  async function handleDetail(req: Request, res: Response): Promise<void> {
    const programId = resolveProgramIdFromCampId(req.params.id);
    const row = await prisma.program.findUnique({
      where: { id: programId },
      include: campProgramInclude,
    });
    const camp = row ? mapProgramToCamp(row, env) : null;
    if (!camp) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.set("Cache-Control", "private, max-age=60");
    res.json(camp);
  }

  function handleHealth(_req: Request, res: Response): void {
    res.set("Cache-Control", "private, no-store");
    res.json({
      service: "camp-api",
      token_configured: Boolean(env.CAMP_API_TOKEN),
      telegram_alerts_configured: Boolean(env.TELEGRAM_BOT_API_BASE_URL && env.TELEGRAM_ALERT_CHAT_ID),
      ...getCampApiRuntimeStatus(),
    });
  }

  router.get("/api/v1/camps", auth, handleList);
  router.get("/api/v1/camps/health", auth, handleHealth);
  router.get("/api/v1/camps/:id", auth, handleDetail);
  // Production nginx strips `/api` on mywavetour.ru/api/* before proxying to Express.
  router.get("/v1/camps", auth, handleList);
  router.get("/v1/camps/health", auth, handleHealth);
  router.get("/v1/camps/:id", auth, handleDetail);

  router.get("/camps-feed.json", auth, async (_req, res) => {
    try {
      const payload = await listCamps({
        status: "published",
        sports: ["wakesurf", "wakeboard"],
        audience: "ru",
        limit: MAX_LIMIT,
        offset: 0,
      }, env);
      res.set("Cache-Control", "private, max-age=300");
      res.json(payload);
    } catch (error) {
      recordCampApiFeedError(error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
