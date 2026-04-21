"use client";

import { Fragment, Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { adminJson } from "../../lib/admin";
import {
  PILOT_SCOPE_LABEL,
  PROGRAM_INTAKE_SOURCES,
  PROGRAM_PUBLISH_STATUSES,
  getMediaTypeLabel,
  getOrganizerVerificationStatusLabel,
  getProgramIntakeSourceLabel,
  getProgramLevelLabel,
  getProgramPublishStatusLabel,
  getSeverityLabel,
  isPilotProgramScope,
} from "@mywave/shared-types";
import { ProgramStatusTimelineBlock } from "../../components/ProgramStatusTimelineBlock";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type OrganizerOption = {
  id: string;
  displayName: string;
  verificationStatus: string;
};

type ProgramScoreSnap = {
  programId: string;
  totalProgramScore: number;
  scoreBand: string;
  sampleViews?: number;
  componentsJson?: Record<string, number | null>;
};

type Program = {
  id: string;
  title: string;
  discipline: string;
  region: string;
  publishStatus: string;
  /** С сервера (?all=1): допустимые следующие publishStatus (policy). */
  nextPublishStatuses?: string[];
  intakeSource: string | null;
  startDate: string;
  endDate: string;
  durationDays: number;
  capacityTotal: number | null;
  spotsAvailable: number | null;
  isStarred: boolean;
  media: unknown[];
  organizer?: { id: string; displayName: string; verificationStatus: string };
  packingListNotes?: string | null;
  accommodationNotes?: string | null;
  transportNotes?: string | null;
  sightsNotes?: string | null;
  planBWeatherNotes?: string | null;
  platformTravelTips?: string | null;
  exactLocation?: string | null;
  formatType?: string | null;
  levelRequired?: string | null;
  riskLevel?: string | null;
  currency?: string | null;
  priceFromRub?: number | null;
  audienceFit?: string | null;
  exclusions?: string | null;
  inclusions?: string | null;
  gearRequirements?: string | null;
  medicalLimitations?: string | null;
  cancellationRules?: string | null;
  itineraryDayByDay?: string | null;
  organizerName?: string | null;
  trustReason?: string | null;
  reviewsSummary?: string | null;
  whatHappensAfterBooking?: string | null;
  cta?: string | null;
};

function publishStatusSelectOptions(program: Program): readonly string[] {
  const next = program.nextPublishStatuses;
  if (Array.isArray(next)) {
    return Array.from(new Set<string>([program.publishStatus, ...next]));
  }
  return PROGRAM_PUBLISH_STATUSES;
}

type TravelCardDraft = {
  packingListNotes: string;
  accommodationNotes: string;
  transportNotes: string;
  sightsNotes: string;
  planBWeatherNotes: string;
  platformTravelTips: string;
};

function strNorm(s: string | null | undefined): string {
  return typeof s === "string" ? s.trim() : "";
}

function travelDraftFromProgram(p: Program): TravelCardDraft {
  return {
    packingListNotes: strNorm(p.packingListNotes),
    accommodationNotes: strNorm(p.accommodationNotes),
    transportNotes: strNorm(p.transportNotes),
    sightsNotes: strNorm(p.sightsNotes),
    planBWeatherNotes: strNorm(p.planBWeatherNotes),
    platformTravelTips: strNorm(p.platformTravelTips),
  };
}

/** Редактируемые через PATCH без смены дат (длительность считается отдельно). */
type ProgramContentDraft = {
  title: string;
  discipline: string;
  region: string;
  exactLocation: string;
  formatType: string;
  levelRequired: string;
  riskLevel: string;
  currency: string;
  priceFromRub: string;
  audienceFit: string;
  exclusions: string;
  inclusions: string;
  gearRequirements: string;
  medicalLimitations: string;
  cancellationRules: string;
  itineraryDayByDay: string;
  organizerName: string;
  trustReason: string;
  reviewsSummary: string;
  whatHappensAfterBooking: string;
  cta: string;
};

function contentDraftFromProgram(p: Program): ProgramContentDraft {
  return {
    title: typeof p.title === "string" ? p.title : "",
    discipline: typeof p.discipline === "string" ? p.discipline : "",
    region: typeof p.region === "string" ? p.region : "",
    exactLocation: strNorm(p.exactLocation),
    formatType: strNorm(p.formatType),
    levelRequired: strNorm(p.levelRequired),
    riskLevel: strNorm(p.riskLevel),
    currency: strNorm(p.currency) || "RUB",
    priceFromRub: p.priceFromRub != null && !Number.isNaN(Number(p.priceFromRub)) ? String(p.priceFromRub) : "",
    audienceFit: strNorm(p.audienceFit),
    exclusions: strNorm(p.exclusions),
    inclusions: strNorm(p.inclusions),
    gearRequirements: strNorm(p.gearRequirements),
    medicalLimitations: p.medicalLimitations == null ? "" : String(p.medicalLimitations),
    cancellationRules: strNorm(p.cancellationRules),
    itineraryDayByDay: strNorm(p.itineraryDayByDay),
    organizerName: strNorm(p.organizerName),
    trustReason: strNorm(p.trustReason),
    reviewsSummary: strNorm(p.reviewsSummary),
    whatHappensAfterBooking: strNorm(p.whatHappensAfterBooking),
    cta: strNorm(p.cta),
  };
}

function programContentDirty(p: Program, d: ProgramContentDraft): boolean {
  const cur = contentDraftFromProgram(p);
  return (Object.keys(cur) as (keyof ProgramContentDraft)[]).some((k) => cur[k] !== d[k]);
}

function parsePriceDraft(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

/** Значение для `<input type="date">` из ISO строки API. */
function isoToDateInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type ProgramDateDraft = {
  startDate: string;
  endDate: string;
};

function dateDraftFromProgram(p: Program): ProgramDateDraft {
  return { startDate: isoToDateInput(p.startDate), endDate: isoToDateInput(p.endDate) };
}

/** Совпадает с сервером `inclusiveDurationDaysUTC` при PATCH дат. */
function previewInclusiveDays(startYmd: string, endYmd: string): number | null {
  if (!startYmd || !endYmd) return null;
  const ps = startYmd.split("-").map(Number);
  const pe = endYmd.split("-").map(Number);
  if (ps.length !== 3 || pe.length !== 3 || ps.some((n) => Number.isNaN(n)) || pe.some((n) => Number.isNaN(n))) {
    return null;
  }
  const [ys, ms, ds] = ps;
  const [ye, me, de] = pe;
  const s = Date.UTC(ys, ms - 1, ds);
  const e = Date.UTC(ye, me - 1, de);
  if (e < s) return null;
  return Math.floor((e - s) / 86400000) + 1;
}

function programDateDirty(p: Program, d: ProgramDateDraft): boolean {
  return isoToDateInput(p.startDate) !== d.startDate.trim() || isoToDateInput(p.endDate) !== d.endDate.trim();
}

type ProgramForm = {
  organizerId: string;
  intakeSource: string;
  title: string;
  discipline: string;
  region: string;
  exactLocation: string;
  startDate: string;
  endDate: string;
  levelRequired: string;
  riskLevel: string;
  capacityTotal: string;
  spotsAvailable: string;
  isStarred: boolean;
  gearRequirements: string;
  medicalLimitations: string;
  cancellationRules: string;
  itineraryDayByDay: string;
  inclusions: string;
  priceFromRub: string;
  packingListNotes: string;
  accommodationNotes: string;
  transportNotes: string;
  sightsNotes: string;
  planBWeatherNotes: string;
  platformTravelTips: string;
};

type MediaDraft = {
  mediaType: string;
  url: string;
  caption: string;
};

type AvailabilityDraft = {
  capacityTotal: string;
  spotsAvailable: string;
};

type SpotlightDraft = {
  isStarred: boolean;
};

const EMPTY_MEDIA_DRAFT: MediaDraft = {
  mediaType: "image",
  url: "",
  caption: "",
};

const LEVEL_OPTIONS = ["beginner", "intermediate", "advanced", "expert", "all_levels"];
const RISK_LEVEL_OPTIONS = ["low", "medium", "high", "critical"];

function programBandMeta(scoreBand: string): { label: string; bg: string; color: string } {
  if (scoreBand === "low") return { label: "weak program", bg: "#ffe8e8", color: "#9f1d1d" };
  if (scoreBand === "medium") return { label: "watchlist", bg: "#fff3dd", color: "#8a5800" };
  if (scoreBand === "insufficient_data" || scoreBand === "unknown") {
    return { label: "insufficient data", bg: "#eef1ff", color: "#364fc7" };
  }
  return { label: "stable", bg: "#eaf7ee", color: "#1d6f42" };
}

function programBreakdown(score: ProgramScoreSnap | undefined): string {
  if (!score) return "Нет snapshot score.";
  const c = score.componentsJson ?? {};
  const content = Number(c.content_completeness_score ?? 0);
  const media = Number(c.has_media_score ?? 0);
  const safety = Number(c.has_safety_score ?? 0);
  const cancellation = Number(c.has_cancellation_policy_score ?? 0);
  const v2l = c.view_to_lead_score == null ? null : Number(c.view_to_lead_score);
  const l2b = c.lead_to_booking_score == null ? null : Number(c.lead_to_booking_score);
  const b2p = c.booking_to_paid_score == null ? null : Number(c.booking_to_paid_score);
  return `Content ${content.toFixed(0)} · media ${media.toFixed(0)} · safety ${safety.toFixed(0)} · cancellation ${cancellation.toFixed(0)} · funnel: ${v2l == null ? "n/a" : v2l.toFixed(0)}/${l2b == null ? "n/a" : l2b.toFixed(0)}/${b2p == null ? "n/a" : b2p.toFixed(0)}`;
}

function programHints(program: Program, score: ProgramScoreSnap | undefined): string[] {
  if (!score) return ["Снимок score ещё не создан — запустить recalculate."];
  const hints: string[] = [];
  const c = score.componentsJson ?? {};
  if (score.scoreBand === "insufficient_data" || score.scoreBand === "unknown") {
    hints.push("Недостаточно трафика для performance score: нужна выборка просмотров.");
  }
  if (Number(c.content_completeness_score ?? 100) < 70) hints.push("Низкая completeness: дополнить audience/inclusions/gear/after-booking.");
  if (Number(c.has_media_score ?? 100) < 100) hints.push("Добавить медиа (фото/видео), иначе карточка теряет конверсию.");
  if (Number(c.has_schedule_score ?? 100) < 100) hints.push("Добавить программу по дням (itinerary).");
  if (Number(c.has_safety_score ?? 100) < 100) hints.push("Заполнить risk + medical ограничения для trust.");
  if (Number(c.has_cancellation_policy_score ?? 100) < 100) hints.push("Заполнить cancellation policy.");
  if ((c.booking_to_paid_score ?? 100) !== null && Number(c.booking_to_paid_score ?? 100) < 55) {
    hints.push("Провал booking→paid: проверить оффер/оплату/следующий шаг после заявки.");
  }
  if (program.publishStatus !== "published") hints.push("Карточка не published: проверить blockers публикации.");
  return hints.slice(0, 3);
}

function moderationPriorityForProgram(score: ProgramScoreSnap | undefined): { label: string; color: string } {
  if (!score) return { label: "P3 · ждём snapshot", color: "#666" };
  if (score.scoreBand === "low") return { label: "P1 · moderation review", color: "#9f1d1d" };
  if (score.scoreBand === "insufficient_data" || score.scoreBand === "unknown") {
    return { label: "P2 · data/traffic check", color: "#364fc7" };
  }
  if (score.scoreBand === "medium") return { label: "P2 · quality follow-up", color: "#8a5800" };
  return { label: "P3 · monitor", color: "#1d6f42" };
}

function AdminProgramsPageInner() {
  const searchParams = useSearchParams();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programScores, setProgramScores] = useState<Record<string, ProgramScoreSnap>>({});
  const [organizers, setOrganizers] = useState<OrganizerOption[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [statusDrafts, setStatusDrafts] = useState<Record<string, string>>({});
  const [mediaDrafts, setMediaDrafts] = useState<Record<string, MediaDraft>>({});
  const [creating, setCreating] = useState(false);
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null);
  const [savingMediaId, setSavingMediaId] = useState<string | null>(null);
  const [intakeDrafts, setIntakeDrafts] = useState<Record<string, string>>({});
  const [savingIntakeId, setSavingIntakeId] = useState<string | null>(null);
  const [availabilityDrafts, setAvailabilityDrafts] = useState<Record<string, AvailabilityDraft>>({});
  const [savingAvailabilityId, setSavingAvailabilityId] = useState<string | null>(null);
  const [spotlightDrafts, setSpotlightDrafts] = useState<Record<string, SpotlightDraft>>({});
  const [savingSpotlightId, setSavingSpotlightId] = useState<string | null>(null);
  const [travelCardDrafts, setTravelCardDrafts] = useState<Record<string, TravelCardDraft>>({});
  const [savingTravelId, setSavingTravelId] = useState<string | null>(null);
  const [programContentDrafts, setProgramContentDrafts] = useState<Record<string, ProgramContentDraft>>({});
  const [savingContentId, setSavingContentId] = useState<string | null>(null);
  const [programDateDrafts, setProgramDateDrafts] = useState<Record<string, ProgramDateDraft>>({});
  const [savingDatesId, setSavingDatesId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<ProgramForm>({
    organizerId: "",
    intakeSource: "admin_manual",
    title: "",
    discipline: "Wakesurf",
    region: "Krasnodar",
    exactLocation: "",
    startDate: "",
    endDate: "",
    levelRequired: "intermediate",
    riskLevel: "medium",
    capacityTotal: "",
    spotsAvailable: "",
    isStarred: false,
    gearRequirements: "Доска/оборудование согласуются с организатором",
    medicalLimitations: "",
    cancellationRules: "Бесплатная отмена за 14 дней, далее по договорённости с организатором.",
    itineraryDayByDay: "День 1: знакомство и брифинг. День 2-3: катание, разбор техники, восстановление.",
    inclusions: "Тренировки, сопровождение организатора, координация от MyWave.",
    priceFromRub: "",
    packingListNotes: "",
    accommodationNotes: "",
    transportNotes: "",
    sightsNotes: "",
    planBWeatherNotes: "",
    platformTravelTips: "",
  });

  const getToken = () => (typeof window !== "undefined" ? window.localStorage.getItem("admin_token") : null);

  useEffect(() => {
    const pid = searchParams?.get("program")?.trim();
    if (!pid || programs.length === 0) return;
    const el = document.getElementById(`admin-program-${pid}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      (el as HTMLElement).style.outline = "2px solid #0d9488";
      const t = window.setTimeout(() => {
        (el as HTMLElement).style.outline = "";
      }, 2600);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [searchParams, programs]);

  const loadPrograms = async () => {
    const token = getToken();
    if (!token) {
      window.location.href = "/login";
      return;
    }
    setLoading(true);
    setError("");
    const q = "?all=1" + (filter ? `&publish_status=${encodeURIComponent(filter)}` : "");
    try {
      const res = await fetch(`${API_URL}/programs${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403 || res.status === 401) {
        if (res.status === 401) window.localStorage.removeItem("admin_token");
        window.location.href = "/login";
        return;
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setPrograms(list);
      setStatusDrafts(Object.fromEntries(list.map((program) => [program.id, program.publishStatus])));
      setIntakeDrafts(Object.fromEntries(list.map((program) => [program.id, program.intakeSource ?? ""])));
      setAvailabilityDrafts(
        Object.fromEntries(
          list.map((program) => [
            program.id,
            {
              capacityTotal: program.capacityTotal != null ? String(program.capacityTotal) : "",
              spotsAvailable: program.spotsAvailable != null ? String(program.spotsAvailable) : "",
            },
          ]),
        ),
      );
      setSpotlightDrafts(
        Object.fromEntries(
          list.map((program) => [
            program.id,
            {
              isStarred: program.isStarred,
            },
          ]),
        ),
      );
      setTravelCardDrafts(Object.fromEntries(list.map((program) => [program.id, travelDraftFromProgram(program)])));
      setProgramContentDrafts(Object.fromEntries(list.map((program) => [program.id, contentDraftFromProgram(program)])));
      setProgramDateDrafts(Object.fromEntries(list.map((program) => [program.id, dateDraftFromProgram(program)])));
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setLoading(false);
    }
  };

  const loadOrganizers = async () => {
    try {
      const res = await fetch(`${API_URL}/organizers`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setOrganizers(list);
      setCreateForm((current) => ({
        ...current,
        organizerId: current.organizerId || list[0]?.id || "",
      }));
    } catch {
      setOrganizers([]);
    }
  };

  useEffect(() => {
    loadPrograms();
  }, [filter]);

  useEffect(() => {
    loadOrganizers();
  }, []);

  useEffect(() => {
    if (loading || programs.length === 0) return;
    let cancelled = false;
    adminJson<{ rows: Array<{ programId: string; totalProgramScore: number; scoreBand: string; sampleViews?: number; componentsJson?: Record<string, number | null> }> }>(
      "/metrics/programs/scores/latest"
    )
      .then((data) => {
        if (cancelled || !Array.isArray(data.rows)) return;
        const m: Record<string, ProgramScoreSnap> = {};
        for (const r of data.rows) {
          m[r.programId] = {
            programId: r.programId,
            totalProgramScore: r.totalProgramScore,
            scoreBand: r.scoreBand,
            sampleViews: r.sampleViews,
            componentsJson: r.componentsJson,
          };
        }
        setProgramScores(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loading, programs]);

  const handleCreateProgram = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = getToken();
    if (!token) return;
    setCreating(true);
    setError("");
    setMessage("");
    try {
      if (!createForm.startDate.trim() || !createForm.endDate.trim()) {
        throw new Error("Укажите даты старта и окончания.");
      }
      const createDurationPreview = previewInclusiveDays(createForm.startDate.trim(), createForm.endDate.trim());
      if (createDurationPreview == null) {
        throw new Error("Некорректный диапазон дат: конец раньше начала.");
      }
      const organizer = organizers.find((item) => item.id === createForm.organizerId);
      const res = await fetch(`${API_URL}/programs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          organizerId: createForm.organizerId,
          title: createForm.title.trim(),
          discipline: createForm.discipline.trim(),
          region: createForm.region.trim(),
          exactLocation: createForm.exactLocation.trim() || undefined,
          startDate: createForm.startDate,
          endDate: createForm.endDate,
          levelRequired: createForm.levelRequired.trim(),
          riskLevel: createForm.riskLevel.trim(),
          capacityTotal: createForm.capacityTotal ? Number(createForm.capacityTotal) : null,
          spotsAvailable: createForm.spotsAvailable ? Number(createForm.spotsAvailable) : null,
          isStarred: createForm.isStarred,
          gearRequirements: createForm.gearRequirements.trim(),
          medicalLimitations: createForm.medicalLimitations,
          cancellationRules: createForm.cancellationRules.trim(),
          itineraryDayByDay: createForm.itineraryDayByDay.trim(),
          inclusions: createForm.inclusions.trim(),
          priceFromRub: createForm.priceFromRub ? Number(createForm.priceFromRub) : undefined,
          organizerName: organizer?.displayName,
          intakeSource: createForm.intakeSource || undefined,
          packingListNotes: createForm.packingListNotes.trim() || undefined,
          accommodationNotes: createForm.accommodationNotes.trim() || undefined,
          transportNotes: createForm.transportNotes.trim() || undefined,
          sightsNotes: createForm.sightsNotes.trim() || undefined,
          planBWeatherNotes: createForm.planBWeatherNotes.trim() || undefined,
          platformTravelTips: createForm.platformTravelTips.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? "Не удалось создать программу");
      }
      const savedDays = typeof body?.durationDays === "number" ? body.durationDays : createDurationPreview;
      setMessage(
        `Программа создана в статусе «${getProgramPublishStatusLabel("draft")}». Длительность по датам: ${savedDays} дн. (считает API).`,
      );
      setCreateForm((current) => ({
        ...current,
        title: "",
        exactLocation: "",
        startDate: "",
        endDate: "",
        priceFromRub: "",
        capacityTotal: "",
        spotsAvailable: "",
        isStarred: false,
      }));
      await loadPrograms();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Не удалось создать программу");
    } finally {
      setCreating(false);
    }
  };

  const handleSaveStatus = async (programId: string) => {
    const token = getToken();
    if (!token) return;
    setSavingStatusId(programId);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/programs/${programId}/publish-status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ publishStatus: statusDrafts[programId] }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const missing = Array.isArray(body?.missing) ? `: ${body.missing.join(", ")}` : "";
        const transition =
          body?.from != null && body?.to != null ? ` (${String(body.from)} → ${String(body.to)})` : "";
        throw new Error((body?.error ?? "Не удалось сменить статус публикации") + missing + transition);
      }
      setMessage("Статус публикации обновлён.");
      await loadPrograms();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сменить статус публикации");
    } finally {
      setSavingStatusId(null);
    }
  };

  const handleSaveIntake = async (programId: string) => {
    const token = getToken();
    if (!token) return;
    setSavingIntakeId(programId);
    setError("");
    setMessage("");
    const raw = intakeDrafts[programId] ?? "";
    try {
      const res = await fetch(`${API_URL}/programs/${programId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ intakeSource: raw === "" ? null : raw }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? "Не удалось сохранить источник");
      }
      setMessage("Источник intake обновлён.");
      await loadPrograms();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить источник");
    } finally {
      setSavingIntakeId(null);
    }
  };

  const handleAddMedia = async (programId: string) => {
    const token = getToken();
    if (!token) return;
    const draft = mediaDrafts[programId] ?? EMPTY_MEDIA_DRAFT;
    setSavingMediaId(programId);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/programs/${programId}/media`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mediaType: draft.mediaType,
          url: draft.url.trim(),
          caption: draft.caption.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? "Не удалось добавить медиа");
      }
      setMediaDrafts((current) => ({ ...current, [programId]: EMPTY_MEDIA_DRAFT }));
      setMessage("Медиа добавлено.");
      await loadPrograms();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось добавить медиа");
    } finally {
      setSavingMediaId(null);
    }
  };

  const handleSaveAvailability = async (programId: string) => {
    const token = getToken();
    if (!token) return;
    setSavingAvailabilityId(programId);
    setError("");
    setMessage("");
    const draft = availabilityDrafts[programId] ?? { capacityTotal: "", spotsAvailable: "" };
    try {
      const res = await fetch(`${API_URL}/programs/${programId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          capacityTotal: draft.capacityTotal === "" ? null : Number(draft.capacityTotal),
          spotsAvailable: draft.spotsAvailable === "" ? null : Number(draft.spotsAvailable),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? "Не удалось сохранить наличие");
      }
      setMessage("Наличие и лимит мест обновлены.");
      await loadPrograms();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить наличие");
    } finally {
      setSavingAvailabilityId(null);
    }
  };

  const handleSaveProgramContent = async (programId: string) => {
    const token = getToken();
    if (!token) return;
    const program = programs.find((p) => p.id === programId);
    if (!program) return;
    const draft = programContentDrafts[programId] ?? contentDraftFromProgram(program);
    if (!draft.title.trim() || !draft.discipline.trim() || !draft.region.trim()) {
      setError("Название, дисциплина и регион не могут быть пустыми.");
      return;
    }
    const priceVal = parsePriceDraft(draft.priceFromRub);
    if (Number.isNaN(priceVal)) {
      setError("Цена «от» должна быть пустой или неотрицательным числом.");
      return;
    }
    setSavingContentId(programId);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/programs/${programId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: draft.title.trim(),
          discipline: draft.discipline.trim(),
          region: draft.region.trim(),
          exactLocation: draft.exactLocation.trim() || null,
          formatType: draft.formatType.trim() || null,
          levelRequired: draft.levelRequired.trim() || null,
          riskLevel: draft.riskLevel.trim() || null,
          currency: draft.currency.trim() || "RUB",
          priceFromRub: priceVal,
          audienceFit: draft.audienceFit.trim() || null,
          exclusions: draft.exclusions.trim() || null,
          inclusions: draft.inclusions.trim() || null,
          gearRequirements: draft.gearRequirements.trim() || null,
          medicalLimitations: draft.medicalLimitations,
          cancellationRules: draft.cancellationRules.trim() || null,
          itineraryDayByDay: draft.itineraryDayByDay.trim() || null,
          organizerName: draft.organizerName.trim() || null,
          trustReason: draft.trustReason.trim() || null,
          reviewsSummary: draft.reviewsSummary.trim() || null,
          whatHappensAfterBooking: draft.whatHappensAfterBooking.trim() || null,
          cta: draft.cta.trim() || null,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? "Не удалось сохранить контент программы");
      }
      setMessage("Контент карточки программы обновлён.");
      await loadPrograms();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить контент программы");
    } finally {
      setSavingContentId(null);
    }
  };

  const handleSaveProgramDates = async (programId: string) => {
    const token = getToken();
    if (!token) return;
    const program = programs.find((p) => p.id === programId);
    if (!program) return;
    const draft = programDateDrafts[programId] ?? dateDraftFromProgram(program);
    if (!draft.startDate.trim() || !draft.endDate.trim()) {
      setError("Укажите дату старта и окончания.");
      return;
    }
    const preview = previewInclusiveDays(draft.startDate.trim(), draft.endDate.trim());
    if (preview == null) {
      setError("Некорректный диапазон дат: конец раньше начала или неверный формат.");
      return;
    }
    setSavingDatesId(programId);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/programs/${programId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          startDate: draft.startDate.trim(),
          endDate: draft.endDate.trim(),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? "Не удалось сохранить даты");
      }
      const saved = typeof body?.durationDays === "number" ? body.durationDays : preview;
      setMessage(`Даты обновлены; длительность в БД: ${saved} дн. (совпадает с календарём, включительно).`);
      await loadPrograms();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить даты");
    } finally {
      setSavingDatesId(null);
    }
  };

  const handleSaveTravelCard = async (programId: string) => {
    const token = getToken();
    if (!token) return;
    const program = programs.find((p) => p.id === programId);
    if (!program) return;
    const draft = travelCardDrafts[programId] ?? travelDraftFromProgram(program);
    setSavingTravelId(programId);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/programs/${programId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          packingListNotes: draft.packingListNotes.trim() || null,
          accommodationNotes: draft.accommodationNotes.trim() || null,
          transportNotes: draft.transportNotes.trim() || null,
          sightsNotes: draft.sightsNotes.trim() || null,
          planBWeatherNotes: draft.planBWeatherNotes.trim() || null,
          platformTravelTips: draft.platformTravelTips.trim() || null,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? "Не удалось сохранить блок карточки тура");
      }
      setMessage("Поля «карточка тура» обновлены.");
      await loadPrograms();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить блок карточки тура");
    } finally {
      setSavingTravelId(null);
    }
  };

  const handleSaveSpotlight = async (programId: string) => {
    const token = getToken();
    if (!token) return;
    setSavingSpotlightId(programId);
    setError("");
    setMessage("");
    const draft = spotlightDrafts[programId] ?? { isStarred: false };
    try {
      const res = await fetch(`${API_URL}/programs/${programId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          isStarred: draft.isStarred,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? "Не удалось сохранить витрину");
      }
      setMessage(draft.isStarred ? "Программа отмечена звёздочкой для витрины." : "Звёздочка для витрины снята.");
      await loadPrograms();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить витрину");
    } finally {
      setSavingSpotlightId(null);
    }
  };

  return (
    <main style={{ padding: 24 }}>
      <p><Link href="/organizers">Организаторы</Link> | <strong>Программы</strong> | <Link href="/bookings">Заявки</Link> | <Link href="/incidents">Инциденты</Link> | <Link href="/reviews">Отзывы</Link> | <Link href="/commissions">Комиссии</Link></p>
      <h1>Программы</h1>
      <p style={{ fontSize: 14, color: "#555" }}>
        Текущий операционный фокус каталога — <strong>{PILOT_SCOPE_LABEL}</strong>. Новые публикации вне этого фокуса держим в подготовке до отдельного решения Owner. Канон источников intake программы: <code>docs/INGESTION_POLICY.md</code>.
      </p>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {message && <p style={{ color: "#1d6f42" }}>{message}</p>}

      <section style={{ margin: "20px 0", padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
        <h2 style={{ marginTop: 0 }}>Создать программу</h2>
        <form onSubmit={handleCreateProgram} style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <select value={createForm.organizerId} onChange={(e) => setCreateForm((current) => ({ ...current, organizerId: e.target.value }))} style={{ padding: 10 }}>
            <option value="">Выберите организатора</option>
            {organizers.map((organizer) => (
              <option key={organizer.id} value={organizer.id}>
                {organizer.displayName} ({getOrganizerVerificationStatusLabel(organizer.verificationStatus)})
              </option>
            ))}
          </select>
          <select
            value={createForm.intakeSource}
            onChange={(e) => setCreateForm((current) => ({ ...current, intakeSource: e.target.value }))}
            style={{ padding: 10 }}
            title="Источник появления программы в каталоге (canonical intake)"
          >
            {PROGRAM_INTAKE_SOURCES.map((code) => (
              <option key={code} value={code}>{getProgramIntakeSourceLabel(code)}</option>
            ))}
          </select>
          <input value={createForm.title} onChange={(e) => setCreateForm((current) => ({ ...current, title: e.target.value }))} placeholder="Название программы" style={{ padding: 10 }} />
          <input value={createForm.discipline} onChange={(e) => setCreateForm((current) => ({ ...current, discipline: e.target.value }))} placeholder="Дисциплина" style={{ padding: 10 }} />
          <input value={createForm.region} onChange={(e) => setCreateForm((current) => ({ ...current, region: e.target.value }))} placeholder="Регион" style={{ padding: 10 }} />
          <input value={createForm.exactLocation} onChange={(e) => setCreateForm((current) => ({ ...current, exactLocation: e.target.value }))} placeholder="Точная локация" style={{ padding: 10 }} />
          <input type="date" value={createForm.startDate} onChange={(e) => setCreateForm((current) => ({ ...current, startDate: e.target.value }))} style={{ padding: 10 }} />
          <input type="date" value={createForm.endDate} onChange={(e) => setCreateForm((current) => ({ ...current, endDate: e.target.value }))} style={{ padding: 10 }} />
          <div style={{ padding: "10px 4px", fontSize: 13, color: "#444", gridColumn: "span 1" }}>
            {(() => {
              const prev =
                createForm.startDate.trim() && createForm.endDate.trim()
                  ? previewInclusiveDays(createForm.startDate.trim(), createForm.endDate.trim())
                  : null;
              if (!createForm.startDate.trim() && !createForm.endDate.trim()) {
                return <span>Длительность рассчитывается автоматически по датам (включительно).</span>;
              }
              if (prev == null) {
                return <span style={{ color: "#b42318" }}>Исправьте даты: окончание не может быть раньше старта.</span>;
              }
              return (
                <span>
                  Предпросмотр: <strong>{prev}</strong> дн. — в БД запишет API (вручную durationDays не задаётся).
                </span>
              );
            })()}
          </div>
          <select value={createForm.levelRequired} onChange={(e) => setCreateForm((current) => ({ ...current, levelRequired: e.target.value }))} style={{ padding: 10 }}>
            {LEVEL_OPTIONS.map((level) => (
              <option key={level} value={level}>{getProgramLevelLabel(level)}</option>
            ))}
          </select>
          <select value={createForm.riskLevel} onChange={(e) => setCreateForm((current) => ({ ...current, riskLevel: e.target.value }))} style={{ padding: 10 }}>
            {RISK_LEVEL_OPTIONS.map((level) => (
              <option key={level} value={level}>{getSeverityLabel(level)}</option>
            ))}
          </select>
          <input type="number" min="0" value={createForm.capacityTotal} onChange={(e) => setCreateForm((current) => ({ ...current, capacityTotal: e.target.value }))} placeholder="Лимит мест" style={{ padding: 10 }} />
          <input type="number" min="0" value={createForm.spotsAvailable} onChange={(e) => setCreateForm((current) => ({ ...current, spotsAvailable: e.target.value }))} placeholder="Мест осталось" style={{ padding: 10 }} />
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 4px" }}>
            <input
              type="checkbox"
              checked={createForm.isStarred}
              onChange={(e) => setCreateForm((current) => ({ ...current, isStarred: e.target.checked }))}
            />
            ⭐ Горячее предложение
          </label>
          <input value={createForm.priceFromRub} onChange={(e) => setCreateForm((current) => ({ ...current, priceFromRub: e.target.value }))} placeholder="Цена от, ₽" style={{ padding: 10 }} />
          <textarea value={createForm.gearRequirements} onChange={(e) => setCreateForm((current) => ({ ...current, gearRequirements: e.target.value }))} placeholder="Требования к снаряжению" rows={3} style={{ padding: 10 }} />
          <textarea value={createForm.medicalLimitations} onChange={(e) => setCreateForm((current) => ({ ...current, medicalLimitations: e.target.value }))} placeholder="Медицинские ограничения (можно оставить пустым)" rows={3} style={{ padding: 10 }} />
          <textarea value={createForm.cancellationRules} onChange={(e) => setCreateForm((current) => ({ ...current, cancellationRules: e.target.value }))} placeholder="Правила отмены" rows={3} style={{ padding: 10 }} />
          <textarea value={createForm.itineraryDayByDay} onChange={(e) => setCreateForm((current) => ({ ...current, itineraryDayByDay: e.target.value }))} placeholder="Программа по дням" rows={3} style={{ padding: 10 }} />
          <textarea value={createForm.inclusions} onChange={(e) => setCreateForm((current) => ({ ...current, inclusions: e.target.value }))} placeholder="Что включено" rows={3} style={{ padding: 10 }} />
          <div style={{ gridColumn: "1 / -1", marginTop: 8 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Карточка тура: логистика (опционально)</h3>
            <p style={{ margin: "0 0 10px", fontSize: 13, color: "#555" }}>
              Поля ниже попадают в публичную карточку, если заполнены. Редактирование существующих программ — через PATCH API или будущий экран карточки.
            </p>
          </div>
          <textarea
            value={createForm.packingListNotes}
            onChange={(e) => setCreateForm((current) => ({ ...current, packingListNotes: e.target.value }))}
            placeholder="Что взять с собой (текст организатора)"
            rows={2}
            style={{ padding: 10, gridColumn: "1 / -1" }}
          />
          <textarea
            value={createForm.accommodationNotes}
            onChange={(e) => setCreateForm((current) => ({ ...current, accommodationNotes: e.target.value }))}
            placeholder="Где жить"
            rows={2}
            style={{ padding: 10, gridColumn: "1 / -1" }}
          />
          <textarea
            value={createForm.transportNotes}
            onChange={(e) => setCreateForm((current) => ({ ...current, transportNotes: e.target.value }))}
            placeholder="Как добраться"
            rows={2}
            style={{ padding: 10, gridColumn: "1 / -1" }}
          />
          <textarea
            value={createForm.sightsNotes}
            onChange={(e) => setCreateForm((current) => ({ ...current, sightsNotes: e.target.value }))}
            placeholder="Что посмотреть рядом"
            rows={2}
            style={{ padding: 10, gridColumn: "1 / -1" }}
          />
          <textarea
            value={createForm.planBWeatherNotes}
            onChange={(e) => setCreateForm((current) => ({ ...current, planBWeatherNotes: e.target.value }))}
            placeholder="План Б (погода / форс-мажор)"
            rows={2}
            style={{ padding: 10, gridColumn: "1 / -1" }}
          />
          <textarea
            value={createForm.platformTravelTips}
            onChange={(e) => setCreateForm((current) => ({ ...current, platformTravelTips: e.target.value }))}
            placeholder="Мягкие подсказки платформы (необязательно)"
            rows={2}
            style={{ padding: 10, gridColumn: "1 / -1" }}
          />
          <button
            type="submit"
            disabled={creating || !createForm.organizerId || !createForm.title.trim() || !createForm.startDate || !createForm.endDate}
            style={{ padding: 10 }}
          >
            {creating ? "Создание..." : "Создать черновик"}
          </button>
        </form>
      </section>

      <p>Фильтр по статусу публикации:{" "}
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: 6 }}>
          <option value="">Все</option>
          {PROGRAM_PUBLISH_STATUSES.map((status) => (
            <option key={status} value={status}>{getProgramPublishStatusLabel(status)}</option>
          ))}
        </select>
      </p>
      {loading && <p>Загрузка...</p>}
      {!loading && (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #333" }}>
              <th style={{ textAlign: "left", padding: 8 }}>Название</th>
              <th style={{ textAlign: "left", padding: 8 }}>Score (internal)</th>
              <th style={{ textAlign: "left", padding: 8 }}>Фокус</th>
              <th style={{ textAlign: "left", padding: 8 }}>Горячее предложение</th>
              <th style={{ textAlign: "left", padding: 8 }}>Наличие</th>
              <th style={{ textAlign: "left", padding: 8 }}>Источник (intake)</th>
              <th style={{ textAlign: "left", padding: 8 }}>Статус публикации</th>
              <th style={{ textAlign: "left", padding: 8 }}>Даты</th>
              <th style={{ textAlign: "left", padding: 8 }}>Медиа</th>
              <th style={{ textAlign: "left", padding: 8 }}>Moderation priority</th>
              <th style={{ textAlign: "left", padding: 8 }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {programs.map((program) => {
              const mediaDraft = mediaDrafts[program.id] ?? EMPTY_MEDIA_DRAFT;
              const isPilot = isPilotProgramScope(program.discipline, program.region);
              const availabilityDraft = availabilityDrafts[program.id] ?? {
                capacityTotal: program.capacityTotal != null ? String(program.capacityTotal) : "",
                spotsAvailable: program.spotsAvailable != null ? String(program.spotsAvailable) : "",
              };
              const spotlightDraft = spotlightDrafts[program.id] ?? {
                isStarred: program.isStarred,
              };
              const availabilityDirty =
                availabilityDraft.capacityTotal !== (program.capacityTotal != null ? String(program.capacityTotal) : "")
                || availabilityDraft.spotsAvailable !== (program.spotsAvailable != null ? String(program.spotsAvailable) : "");
              const spotlightDirty = spotlightDraft.isStarred !== program.isStarred;
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const isPast = new Date(program.endDate) < today;
              const isFull = program.spotsAvailable != null && program.spotsAvailable <= 0;
              const isPubliclyVisible = program.publishStatus === "published" && !isPast && !isFull;
              const score = programScores[program.id];
              const scoreMeta = programBandMeta(score?.scoreBand ?? "unknown");
              const hints = programHints(program, score);
              const priority = moderationPriorityForProgram(score);
              const travelDraft = travelCardDrafts[program.id] ?? travelDraftFromProgram(program);
              const travelDirty =
                strNorm(program.packingListNotes) !== travelDraft.packingListNotes.trim()
                || strNorm(program.accommodationNotes) !== travelDraft.accommodationNotes.trim()
                || strNorm(program.transportNotes) !== travelDraft.transportNotes.trim()
                || strNorm(program.sightsNotes) !== travelDraft.sightsNotes.trim()
                || strNorm(program.planBWeatherNotes) !== travelDraft.planBWeatherNotes.trim()
                || strNorm(program.platformTravelTips) !== travelDraft.platformTravelTips.trim();
              const contentDraft = programContentDrafts[program.id] ?? contentDraftFromProgram(program);
              const contentDirty = programContentDirty(program, contentDraft);
              const dateDraft = programDateDrafts[program.id] ?? dateDraftFromProgram(program);
              const datesDirty = programDateDirty(program, dateDraft);
              const datesPreview = previewInclusiveDays(dateDraft.startDate.trim(), dateDraft.endDate.trim());
              const datesRangeInvalid =
                Boolean(dateDraft.startDate.trim()) &&
                Boolean(dateDraft.endDate.trim()) &&
                datesPreview == null;
              const dateFieldErrorStyle = datesRangeInvalid
                ? { outline: "2px solid #b42318", outlineOffset: 2 } as const
                : {};
              return (
                <Fragment key={program.id}>
                <tr id={`admin-program-${program.id}`} style={{ borderBottom: "1px solid #ccc" }}>
                  <td style={{ padding: 8 }}>
                    <strong>{program.isStarred ? "⭐ " : ""}{program.title}</strong>
                    <div style={{ color: "#666", fontSize: 12 }}>
                      {program.organizer?.displayName ?? "—"} · {program.discipline}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12 }}>
                      <Link href={`/admin/economics/programs/${program.id}`}>Economics / guardrails</Link>
                      {" · "}
                      <Link href={`/admin/conversion-drafts?programId=${encodeURIComponent(program.id)}`}>Conversion drafts</Link>
                    </div>
                  </td>
                  <td style={{ padding: 8, fontSize: 13, color: "#444", whiteSpace: "nowrap" }}>
                    {score
                      ? `${score.totalProgramScore.toFixed(1)} (${score.scoreBand})`
                      : "—"}
                    <div style={{ marginTop: 4 }}>
                      <span style={{ background: scoreMeta.bg, color: scoreMeta.color, borderRadius: 999, padding: "2px 8px", fontSize: 12 }}>
                        {scoreMeta.label}
                      </span>
                    </div>
                    <div style={{ marginTop: 6, color: "#666", fontSize: 12, whiteSpace: "normal", maxWidth: 420 }}>
                      {programBreakdown(score)}
                    </div>
                    {hints.length > 0 && (
                      <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "#555", fontSize: 12, whiteSpace: "normal", maxWidth: 420 }}>
                        {hints.map((h) => (
                          <li key={h}>{h}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td style={{ padding: 8 }}>
                    <span style={{ color: isPilot ? "#1d6f42" : "#a45c00" }}>
                      {program.region} {isPilot ? "· основной фокус" : "· подготовка"}
                    </span>
                  </td>
                  <td style={{ padding: 8, minWidth: 220 }}>
                    <div style={{ fontSize: 12, color: spotlightDraft.isStarred ? "#9a6700" : "#666", marginBottom: 6 }}>
                      {program.isStarred ? "Витрина активна: программа участвует в блоке горячих предложений." : "Обычный показ без выделения."}
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <input
                        type="checkbox"
                        checked={spotlightDraft.isStarred}
                        onChange={(e) =>
                          setSpotlightDrafts((current) => ({
                            ...current,
                            [program.id]: { isStarred: e.target.checked },
                          }))
                        }
                      />
                      ⭐ Выделить звёздочкой
                    </label>
                    <button
                      type="button"
                      onClick={() => handleSaveSpotlight(program.id)}
                      disabled={savingSpotlightId === program.id || !spotlightDirty}
                      style={{ padding: "6px 10px" }}
                    >
                      {savingSpotlightId === program.id ? "Сохраняем..." : "Сохранить витрину"}
                    </button>
                  </td>
                  <td style={{ padding: 8, minWidth: 220 }}>
                    <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
                      {isPast
                        ? "Скрыта на сайте: даты завершились"
                        : isFull
                          ? "Скрыта на сайте: мест не осталось"
                          : isPubliclyVisible
                            ? "Видна на сайте"
                            : "Не видна на сайте"}
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      <input
                        type="number"
                        min="0"
                        value={availabilityDraft.capacityTotal}
                        onChange={(e) =>
                          setAvailabilityDrafts((current) => ({
                            ...current,
                            [program.id]: { ...availabilityDraft, capacityTotal: e.target.value },
                          }))
                        }
                        placeholder="Лимит мест"
                        style={{ padding: 6 }}
                      />
                      <input
                        type="number"
                        min="0"
                        value={availabilityDraft.spotsAvailable}
                        onChange={(e) =>
                          setAvailabilityDrafts((current) => ({
                            ...current,
                            [program.id]: { ...availabilityDraft, spotsAvailable: e.target.value },
                          }))
                        }
                        placeholder="Мест осталось"
                        style={{ padding: 6 }}
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveAvailability(program.id)}
                        disabled={savingAvailabilityId === program.id || !availabilityDirty}
                        style={{ padding: "6px 10px" }}
                      >
                        {savingAvailabilityId === program.id ? "Сохраняем..." : "Сохранить наличие"}
                      </button>
                    </div>
                  </td>
                  <td style={{ padding: 8, minWidth: 220 }}>
                    <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>{getProgramIntakeSourceLabel(program.intakeSource)}</div>
                    <select
                      value={intakeDrafts[program.id] ?? program.intakeSource ?? ""}
                      onChange={(e) => setIntakeDrafts((current) => ({ ...current, [program.id]: e.target.value }))}
                      style={{ padding: 6, width: "100%", maxWidth: 280 }}
                    >
                      <option value="">Не задан</option>
                      {PROGRAM_INTAKE_SOURCES.map((code) => (
                        <option key={code} value={code}>{getProgramIntakeSourceLabel(code)}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleSaveIntake(program.id)}
                      disabled={
                        savingIntakeId === program.id
                        || (intakeDrafts[program.id] ?? program.intakeSource ?? "") === (program.intakeSource ?? "")
                      }
                      style={{ marginTop: 6, padding: "6px 10px" }}
                    >
                      {savingIntakeId === program.id ? "Сохраняем..." : "Сохранить источник"}
                    </button>
                  </td>
                  <td style={{ padding: 8 }}>
                    <select
                      value={statusDrafts[program.id] ?? program.publishStatus}
                      onChange={(e) => setStatusDrafts((current) => ({ ...current, [program.id]: e.target.value }))}
                      style={{ padding: 6, minWidth: 180 }}
                    >
                      {publishStatusSelectOptions(program).map((status) => (
                        <option key={status} value={status}>{getProgramPublishStatusLabel(status)}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: 8 }}>{new Date(program.startDate).toLocaleDateString("ru-RU")} – {new Date(program.endDate).toLocaleDateString("ru-RU")}</td>
                  <td style={{ padding: 8 }}>{Array.isArray(program.media) ? program.media.length : 0}</td>
                  <td style={{ padding: 8 }}>
                    <span style={{ color: priority.color, fontWeight: 600 }}>{priority.label}</span>
                  </td>
                  <td style={{ padding: 8, minWidth: 320 }}>
                    <button
                      type="button"
                      onClick={() => handleSaveStatus(program.id)}
                      disabled={savingStatusId === program.id || (statusDrafts[program.id] ?? program.publishStatus) === program.publishStatus}
                      style={{ marginBottom: 8, padding: "6px 10px" }}
                    >
                      {savingStatusId === program.id ? "Сохраняем..." : "Сохранить статус"}
                    </button>
                    <ProgramStatusTimelineBlock programId={program.id} />
                    <div style={{ display: "grid", gap: 8 }}>
                      <input
                        value={mediaDraft.url}
                        onChange={(e) => setMediaDrafts((current) => ({ ...current, [program.id]: { ...mediaDraft, url: e.target.value } }))}
                        placeholder="Ссылка на медиа"
                        style={{ padding: 8 }}
                      />
                      <input
                        value={mediaDraft.caption}
                        onChange={(e) => setMediaDrafts((current) => ({ ...current, [program.id]: { ...mediaDraft, caption: e.target.value } }))}
                        placeholder="Подпись"
                        style={{ padding: 8 }}
                      />
                      <div>
                        <select
                          value={mediaDraft.mediaType}
                          onChange={(e) => setMediaDrafts((current) => ({ ...current, [program.id]: { ...mediaDraft, mediaType: e.target.value } }))}
                          style={{ padding: 8, marginRight: 8 }}
                        >
                          <option value="image">{getMediaTypeLabel("image")}</option>
                          <option value="video">{getMediaTypeLabel("video")}</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleAddMedia(program.id)}
                          disabled={savingMediaId === program.id || !mediaDraft.url.trim()}
                          style={{ padding: "8px 10px" }}
                        >
                          {savingMediaId === program.id ? "Добавляем..." : "Добавить медиа"}
                        </button>
                      </div>
                      {isPubliclyVisible && (
                        <Link href={`http://localhost:3000/program/${program.id}`} target="_blank">
                          Открыть карточку на сайте
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #ccc" }}>
                  <td colSpan={11} style={{ padding: "10px 14px", background: "#f8f9fa", verticalAlign: "top" }}>
                    <details>
                      <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
                        Карточка тура: логистика и подсказки платформы
                      </summary>
                      <p style={{ margin: "10px 0 8px", fontSize: 13, color: "#555", maxWidth: "80ch" }}>
                        Тексты уходят в публичную страницу программы (если заполнены). Пустые поля снимают блок на сайте.
                      </p>
                      <div style={{ display: "grid", gap: 8, maxWidth: 900 }}>
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Что взять с собой</label>
                        <textarea
                          value={travelDraft.packingListNotes}
                          onChange={(e) =>
                            setTravelCardDrafts((current) => ({
                              ...current,
                              [program.id]: { ...travelDraft, packingListNotes: e.target.value },
                            }))
                          }
                          rows={2}
                          style={{ padding: 8, width: "100%" }}
                        />
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Где жить</label>
                        <textarea
                          value={travelDraft.accommodationNotes}
                          onChange={(e) =>
                            setTravelCardDrafts((current) => ({
                              ...current,
                              [program.id]: { ...travelDraft, accommodationNotes: e.target.value },
                            }))
                          }
                          rows={2}
                          style={{ padding: 8, width: "100%" }}
                        />
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Как добраться</label>
                        <textarea
                          value={travelDraft.transportNotes}
                          onChange={(e) =>
                            setTravelCardDrafts((current) => ({
                              ...current,
                              [program.id]: { ...travelDraft, transportNotes: e.target.value },
                            }))
                          }
                          rows={2}
                          style={{ padding: 8, width: "100%" }}
                        />
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Что посмотреть рядом</label>
                        <textarea
                          value={travelDraft.sightsNotes}
                          onChange={(e) =>
                            setTravelCardDrafts((current) => ({
                              ...current,
                              [program.id]: { ...travelDraft, sightsNotes: e.target.value },
                            }))
                          }
                          rows={2}
                          style={{ padding: 8, width: "100%" }}
                        />
                        <label style={{ fontSize: 12, fontWeight: 600 }}>План Б (погода / форс-мажор)</label>
                        <textarea
                          value={travelDraft.planBWeatherNotes}
                          onChange={(e) =>
                            setTravelCardDrafts((current) => ({
                              ...current,
                              [program.id]: { ...travelDraft, planBWeatherNotes: e.target.value },
                            }))
                          }
                          rows={2}
                          style={{ padding: 8, width: "100%" }}
                        />
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Подсказки платформы (мягкие)</label>
                        <textarea
                          value={travelDraft.platformTravelTips}
                          onChange={(e) =>
                            setTravelCardDrafts((current) => ({
                              ...current,
                              [program.id]: { ...travelDraft, platformTravelTips: e.target.value },
                            }))
                          }
                          rows={2}
                          style={{ padding: 8, width: "100%" }}
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveTravelCard(program.id)}
                          disabled={savingTravelId === program.id || !travelDirty}
                          style={{ padding: "8px 12px", justifySelf: "start" }}
                        >
                          {savingTravelId === program.id ? "Сохраняем…" : "Сохранить блок карточки"}
                        </button>
                      </div>
                    </details>
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #ccc" }}>
                  <td colSpan={11} style={{ padding: "10px 14px", background: "#fffefb", verticalAlign: "top" }}>
                    <details>
                      <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
                        Контент карточки и ключевые поля (без дат)
                      </summary>
                      <p style={{ margin: "10px 0 8px", fontSize: 13, color: "#555", maxWidth: "90ch" }}>
                        Даты здесь не меняются — правьте их в блоке «Даты поездки». <code>durationDays</code> всегда считает API по датам (включительно). Остальное уходит в публичную карточку через PATCH.
                      </p>
                      <div style={{ display: "grid", gap: 10, maxWidth: 960 }}>
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Название</label>
                        <input
                          value={contentDraft.title}
                          onChange={(e) =>
                            setProgramContentDrafts((current) => ({
                              ...current,
                              [program.id]: { ...contentDraft, title: e.target.value },
                            }))
                          }
                          style={{ padding: 8, width: "100%" }}
                        />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600 }}>Дисциплина</label>
                            <input
                              value={contentDraft.discipline}
                              onChange={(e) =>
                                setProgramContentDrafts((current) => ({
                                  ...current,
                                  [program.id]: { ...contentDraft, discipline: e.target.value },
                                }))
                              }
                              style={{ padding: 8, width: "100%", marginTop: 4 }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600 }}>Регион</label>
                            <input
                              value={contentDraft.region}
                              onChange={(e) =>
                                setProgramContentDrafts((current) => ({
                                  ...current,
                                  [program.id]: { ...contentDraft, region: e.target.value },
                                }))
                              }
                              style={{ padding: 8, width: "100%", marginTop: 4 }}
                            />
                          </div>
                        </div>
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Точная локация</label>
                        <input
                          value={contentDraft.exactLocation}
                          onChange={(e) =>
                            setProgramContentDrafts((current) => ({
                              ...current,
                              [program.id]: { ...contentDraft, exactLocation: e.target.value },
                            }))
                          }
                          style={{ padding: 8, width: "100%" }}
                        />
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Формат (camp / tour / …)</label>
                        <input
                          value={contentDraft.formatType}
                          onChange={(e) =>
                            setProgramContentDrafts((current) => ({
                              ...current,
                              [program.id]: { ...contentDraft, formatType: e.target.value },
                            }))
                          }
                          style={{ padding: 8, width: "100%" }}
                        />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600 }}>Уровень</label>
                            <select
                              value={contentDraft.levelRequired}
                              onChange={(e) =>
                                setProgramContentDrafts((current) => ({
                                  ...current,
                                  [program.id]: { ...contentDraft, levelRequired: e.target.value },
                                }))
                              }
                              style={{ padding: 8, width: "100%", marginTop: 4 }}
                            >
                              <option value="">—</option>
                              {LEVEL_OPTIONS.map((level) => (
                                <option key={level} value={level}>{getProgramLevelLabel(level)}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600 }}>Риск</label>
                            <select
                              value={contentDraft.riskLevel}
                              onChange={(e) =>
                                setProgramContentDrafts((current) => ({
                                  ...current,
                                  [program.id]: { ...contentDraft, riskLevel: e.target.value },
                                }))
                              }
                              style={{ padding: 8, width: "100%", marginTop: 4 }}
                            >
                              <option value="">—</option>
                              {RISK_LEVEL_OPTIONS.map((level) => (
                                <option key={level} value={level}>{getSeverityLabel(level)}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, alignItems: "end" }}>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600 }}>Валюта</label>
                            <input
                              value={contentDraft.currency}
                              onChange={(e) =>
                                setProgramContentDrafts((current) => ({
                                  ...current,
                                  [program.id]: { ...contentDraft, currency: e.target.value },
                                }))
                              }
                              style={{ padding: 8, width: "100%", marginTop: 4 }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600 }}>Цена от (число, пусто = нет)</label>
                            <input
                              value={contentDraft.priceFromRub}
                              onChange={(e) =>
                                setProgramContentDrafts((current) => ({
                                  ...current,
                                  [program.id]: { ...contentDraft, priceFromRub: e.target.value },
                                }))
                              }
                              style={{ padding: 8, width: "100%", marginTop: 4 }}
                            />
                          </div>
                        </div>
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Для кого (audience)</label>
                        <textarea
                          value={contentDraft.audienceFit}
                          onChange={(e) =>
                            setProgramContentDrafts((current) => ({
                              ...current,
                              [program.id]: { ...contentDraft, audienceFit: e.target.value },
                            }))
                          }
                          rows={3}
                          style={{ padding: 8, width: "100%" }}
                        />
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Что включено</label>
                        <textarea
                          value={contentDraft.inclusions}
                          onChange={(e) =>
                            setProgramContentDrafts((current) => ({
                              ...current,
                              [program.id]: { ...contentDraft, inclusions: e.target.value },
                            }))
                          }
                          rows={3}
                          style={{ padding: 8, width: "100%" }}
                        />
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Что не включено</label>
                        <textarea
                          value={contentDraft.exclusions}
                          onChange={(e) =>
                            setProgramContentDrafts((current) => ({
                              ...current,
                              [program.id]: { ...contentDraft, exclusions: e.target.value },
                            }))
                          }
                          rows={2}
                          style={{ padding: 8, width: "100%" }}
                        />
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Программа по дням</label>
                        <textarea
                          value={contentDraft.itineraryDayByDay}
                          onChange={(e) =>
                            setProgramContentDrafts((current) => ({
                              ...current,
                              [program.id]: { ...contentDraft, itineraryDayByDay: e.target.value },
                            }))
                          }
                          rows={4}
                          style={{ padding: 8, width: "100%" }}
                        />
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Экипировка / снаряжение</label>
                        <textarea
                          value={contentDraft.gearRequirements}
                          onChange={(e) =>
                            setProgramContentDrafts((current) => ({
                              ...current,
                              [program.id]: { ...contentDraft, gearRequirements: e.target.value },
                            }))
                          }
                          rows={3}
                          style={{ padding: 8, width: "100%" }}
                        />
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Мед. ограничения (можно пусто)</label>
                        <textarea
                          value={contentDraft.medicalLimitations}
                          onChange={(e) =>
                            setProgramContentDrafts((current) => ({
                              ...current,
                              [program.id]: { ...contentDraft, medicalLimitations: e.target.value },
                            }))
                          }
                          rows={2}
                          style={{ padding: 8, width: "100%" }}
                        />
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Отмена / условия</label>
                        <textarea
                          value={contentDraft.cancellationRules}
                          onChange={(e) =>
                            setProgramContentDrafts((current) => ({
                              ...current,
                              [program.id]: { ...contentDraft, cancellationRules: e.target.value },
                            }))
                          }
                          rows={3}
                          style={{ padding: 8, width: "100%" }}
                        />
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Имя организатора на карточке</label>
                        <input
                          value={contentDraft.organizerName}
                          onChange={(e) =>
                            setProgramContentDrafts((current) => ({
                              ...current,
                              [program.id]: { ...contentDraft, organizerName: e.target.value },
                            }))
                          }
                          style={{ padding: 8, width: "100%" }}
                        />
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Почему можно доверять</label>
                        <textarea
                          value={contentDraft.trustReason}
                          onChange={(e) =>
                            setProgramContentDrafts((current) => ({
                              ...current,
                              [program.id]: { ...contentDraft, trustReason: e.target.value },
                            }))
                          }
                          rows={2}
                          style={{ padding: 8, width: "100%" }}
                        />
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Сводка отзывов (текст)</label>
                        <textarea
                          value={contentDraft.reviewsSummary}
                          onChange={(e) =>
                            setProgramContentDrafts((current) => ({
                              ...current,
                              [program.id]: { ...contentDraft, reviewsSummary: e.target.value },
                            }))
                          }
                          rows={2}
                          style={{ padding: 8, width: "100%" }}
                        />
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Что после заявки</label>
                        <textarea
                          value={contentDraft.whatHappensAfterBooking}
                          onChange={(e) =>
                            setProgramContentDrafts((current) => ({
                              ...current,
                              [program.id]: { ...contentDraft, whatHappensAfterBooking: e.target.value },
                            }))
                          }
                          rows={3}
                          style={{ padding: 8, width: "100%" }}
                        />
                        <label style={{ fontSize: 12, fontWeight: 600 }}>CTA / следующий шаг</label>
                        <textarea
                          value={contentDraft.cta}
                          onChange={(e) =>
                            setProgramContentDrafts((current) => ({
                              ...current,
                              [program.id]: { ...contentDraft, cta: e.target.value },
                            }))
                          }
                          rows={2}
                          style={{ padding: 8, width: "100%" }}
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveProgramContent(program.id)}
                          disabled={savingContentId === program.id || !contentDirty}
                          style={{ padding: "8px 12px", justifySelf: "start" }}
                        >
                          {savingContentId === program.id ? "Сохраняем…" : "Сохранить контент карточки"}
                        </button>
                      </div>
                    </details>
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #ccc" }}>
                  <td colSpan={11} style={{ padding: "10px 14px", background: "#f0f7ff", verticalAlign: "top" }}>
                    <details>
                      <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
                        Даты поездки и длительность
                      </summary>
                      <p style={{ margin: "10px 0 8px", fontSize: 13, color: "#555", maxWidth: "80ch" }}>
                        Длительность рассчитывается автоматически по датам (включительно, UTC, как на API). Поле{" "}
                        <code>durationDays</code> с клиента не принимается — только <code>startDate</code> и{" "}
                        <code>endDate</code>.
                      </p>
                      <p style={{ margin: "0 0 10px", fontSize: 13, color: "#8a5800", maxWidth: "80ch", background: "#fff8e6", padding: "8px 10px", borderRadius: 6 }}>
                        Смена дат влияет на <strong>каталог</strong> (сезон, «ближайшие старты», видимость после окончания) и на ожидания по <strong>заявкам</strong>. Проверьте опубликованные программы и активные брони перед сохранением.
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", maxWidth: 640 }}>
                        <div style={{ minWidth: 160 }}>
                          <label htmlFor={`dt-start-${program.id}`} style={{ fontSize: 12, fontWeight: 600 }}>
                            Старт
                          </label>
                          <input
                            id={`dt-start-${program.id}`}
                            type="date"
                            value={dateDraft.startDate}
                            onChange={(e) =>
                              setProgramDateDrafts((current) => ({
                                ...current,
                                [program.id]: { ...dateDraft, startDate: e.target.value },
                              }))
                            }
                            style={{ padding: 8, marginTop: 4, ...dateFieldErrorStyle }}
                          />
                        </div>
                        <div style={{ minWidth: 160 }}>
                          <label htmlFor={`dt-end-${program.id}`} style={{ fontSize: 12, fontWeight: 600 }}>
                            Окончание
                          </label>
                          <input
                            id={`dt-end-${program.id}`}
                            type="date"
                            value={dateDraft.endDate}
                            onChange={(e) =>
                              setProgramDateDrafts((current) => ({
                                ...current,
                                [program.id]: { ...dateDraft, endDate: e.target.value },
                              }))
                            }
                            style={{ padding: 8, marginTop: 4, ...dateFieldErrorStyle }}
                          />
                        </div>
                        <div style={{ fontSize: 13, color: "#444", paddingBottom: 4, maxWidth: 360 }}>
                          {datesRangeInvalid ? (
                            <span style={{ color: "#b42318" }}>
                              Окончание раньше старта — исправьте даты. Сохранение заблокировано.
                            </span>
                          ) : datesPreview != null ? (
                            <>
                              Предпросмотр: <strong>{datesPreview}</strong> дн.; в БД сейчас <strong>{program.durationDays}</strong> дн. После сохранения совпадёт с календарём.
                            </>
                          ) : (
                            <span style={{ color: "#a45c00" }}>Укажите обе даты.</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSaveProgramDates(program.id)}
                          disabled={savingDatesId === program.id || !datesDirty || datesPreview == null}
                          style={{ padding: "8px 12px" }}
                        >
                          {savingDatesId === program.id ? "Сохраняем…" : "Сохранить даты"}
                        </button>
                      </div>
                    </details>
                  </td>
                </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
      {!loading && programs.length === 0 && <p>Нет программ.</p>}
    </main>
  );
}

export default function AdminProgramsPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>Загрузка…</main>}>
      <AdminProgramsPageInner />
    </Suspense>
  );
}
