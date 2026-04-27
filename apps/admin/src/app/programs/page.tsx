"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getProgramPublishStatusLabel, PILOT_SCOPE_LABEL, PROGRAM_PUBLISH_STATUSES } from "@mywave/shared-types";
import { adminJson, getAdminToken } from "../../lib/admin";
import { AdminEmptyState } from "../../components/admin/AdminEmptyState";
import { AdminFilterField, AdminFiltersBar } from "../../components/admin/AdminFiltersBar";
import { AdminLoadingState } from "../../components/admin/AdminLoadingState";
import { AdminMessage } from "../../components/admin/AdminMessage";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminStatCard, AdminStatGrid } from "../../components/admin/AdminStatCard";
import { ProgramCatalogTable } from "../../components/admin/programs/ProgramCatalogTable";
import { ProgramCreateFormCard } from "../../components/admin/programs/ProgramCreateFormCard";
import {
  EMPTY_MEDIA_DRAFT,
  INITIAL_PROGRAM_FORM,
  type AvailabilityDraft,
  type MediaDraft,
  type OrganizerOption,
  type Program,
  type ProgramForm,
  type ProgramScoreSnap,
  type SpotlightDraft,
} from "../../components/admin/programs/programModel";

export default function AdminProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [organizers, setOrganizers] = useState<OrganizerOption[]>([]);
  const [programScores, setProgramScores] = useState<Record<string, ProgramScoreSnap>>({});
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
  const [createForm, setCreateForm] = useState<ProgramForm>(INITIAL_PROGRAM_FORM);

  const loadOrganizers = async () => {
    if (!getAdminToken()) return;
    try {
      const list = await adminJson<OrganizerOption[]>("/organizers");
      setOrganizers(list);
      setCreateForm((c) => ({ ...c, organizerId: c.organizerId || list[0]?.id || "" }));
    } catch {
      setOrganizers([]);
    }
  };

  const loadPrograms = async () => {
    if (!getAdminToken()) {
      window.location.href = "/login";
      return;
    }
    setLoading(true);
    setError("");
    const q = "?all=1" + (filter ? `&publish_status=${encodeURIComponent(filter)}` : "");
    try {
      const list = await adminJson<Program[]>(`/programs${q}`);
      setPrograms(list);
      setStatusDrafts(Object.fromEntries(list.map((p) => [p.id, p.publishStatus])));
      setIntakeDrafts(Object.fromEntries(list.map((p) => [p.id, p.intakeSource ?? ""])));
      setAvailabilityDrafts(
        Object.fromEntries(
          list.map((p) => [
            p.id,
            {
              capacityTotal: p.capacityTotal != null ? String(p.capacityTotal) : "",
              spotsAvailable: p.spotsAvailable != null ? String(p.spotsAvailable) : "",
            },
          ]),
        ),
      );
      setSpotlightDrafts(
        Object.fromEntries(
          list.map((p) => [p.id, { isStarred: p.isStarred }]),
        ),
      );
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!getAdminToken()) {
      window.location.href = "/login";
      return;
    }
    void loadOrganizers();
  }, []);

  useEffect(() => {
    void loadPrograms();
  }, [filter]);

  useEffect(() => {
    if (loading || programs.length === 0) return;
    let cancelled = false;
    adminJson<{
      rows: Array<{
        programId: string;
        totalProgramScore: number;
        scoreBand: string;
        sampleViews?: number;
        componentsJson?: Record<string, number | null>;
      }>;
    }>("/metrics/programs/scores/latest")
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
    if (!getAdminToken()) return;
    setCreating(true);
    setError("");
    setMessage("");
    try {
      const organizer = organizers.find((item) => item.id === createForm.organizerId);
      await adminJson("/programs", {
        method: "POST",
        body: JSON.stringify({
          organizerId: createForm.organizerId,
          title: createForm.title.trim(),
          discipline: createForm.discipline.trim(),
          region: createForm.region.trim(),
          exactLocation: createForm.exactLocation.trim() || undefined,
          startDate: createForm.startDate,
          endDate: createForm.endDate,
          durationDays: Number(createForm.durationDays),
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
        }),
      });
      setMessage(`Программа создана в статусе «${getProgramPublishStatusLabel("draft")}».`);
      setCreateForm((current) => ({
        ...INITIAL_PROGRAM_FORM,
        organizerId: current.organizerId,
        intakeSource: current.intakeSource,
        discipline: current.discipline,
        region: current.region,
      }));
      await loadPrograms();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Не удалось создать программу");
    } finally {
      setCreating(false);
    }
  };

  const handleSaveStatus = async (programId: string) => {
    if (!getAdminToken()) return;
    setSavingStatusId(programId);
    setError("");
    setMessage("");
    try {
      await adminJson(`/programs/${programId}/publish-status`, {
        method: "PATCH",
        body: JSON.stringify({ publishStatus: statusDrafts[programId] }),
      });
      setMessage("Статус публикации обновлён.");
      await loadPrograms();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сменить статус публикации");
    } finally {
      setSavingStatusId(null);
    }
  };

  const handleSaveIntake = async (programId: string) => {
    if (!getAdminToken()) return;
    setSavingIntakeId(programId);
    setError("");
    setMessage("");
    const raw = intakeDrafts[programId] ?? "";
    try {
      await adminJson(`/programs/${programId}`, {
        method: "PATCH",
        body: JSON.stringify({ intakeSource: raw === "" ? null : raw }),
      });
      setMessage("Источник intake обновлён.");
      await loadPrograms();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить источник");
    } finally {
      setSavingIntakeId(null);
    }
  };

  const handleAddMedia = async (programId: string) => {
    if (!getAdminToken()) return;
    const draft = mediaDrafts[programId] ?? EMPTY_MEDIA_DRAFT;
    setSavingMediaId(programId);
    setError("");
    setMessage("");
    try {
      await adminJson(`/programs/${programId}/media`, {
        method: "POST",
        body: JSON.stringify({
          mediaType: draft.mediaType,
          url: draft.url.trim(),
          caption: draft.caption.trim() || undefined,
        }),
      });
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
    if (!getAdminToken()) return;
    setSavingAvailabilityId(programId);
    setError("");
    setMessage("");
    const draft = availabilityDrafts[programId] ?? { capacityTotal: "", spotsAvailable: "" };
    try {
      await adminJson(`/programs/${programId}`, {
        method: "PATCH",
        body: JSON.stringify({
          capacityTotal: draft.capacityTotal === "" ? null : Number(draft.capacityTotal),
          spotsAvailable: draft.spotsAvailable === "" ? null : Number(draft.spotsAvailable),
        }),
      });
      setMessage("Наличие и лимит мест обновлены.");
      await loadPrograms();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить наличие");
    } finally {
      setSavingAvailabilityId(null);
    }
  };

  const handleSaveSpotlight = async (programId: string) => {
    if (!getAdminToken()) return;
    setSavingSpotlightId(programId);
    setError("");
    setMessage("");
    const draft = spotlightDrafts[programId] ?? { isStarred: false };
    try {
      await adminJson(`/programs/${programId}`, {
        method: "PATCH",
        body: JSON.stringify({ isStarred: draft.isStarred }),
      });
      setMessage(
        draft.isStarred
          ? "Программа отмечена звёздочкой для витрины."
          : "Звёздочка для витрины снята.",
      );
      await loadPrograms();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить витрину");
    } finally {
      setSavingSpotlightId(null);
    }
  };

  const programStats = useMemo(() => {
    const total = programs.length;
    const published = programs.filter((p) => p.publishStatus === "published").length;
    const draft = programs.filter((p) => p.publishStatus === "draft").length;
    const starred = programs.filter((p) => p.isStarred).length;
    return { total, published, draft, starred };
  }, [programs]);

  return (
    <main className="mw-admin-page mw-admin-page--wide">
      <AdminPageHeader
        title="Программы"
        description={
          <>
            Текущий операционный фокус каталога — <strong>{PILOT_SCOPE_LABEL}</strong>. Новые публикации вне этого фокуса
            оставляем в подготовке до отдельного решения владельца. Политика источников intake:{" "}
            <span className="mw-admin-code">docs/INGESTION_POLICY.md</span>.
          </>
        }
      />
      {error ? <AdminMessage type="error">{error}</AdminMessage> : null}
      {message ? <AdminMessage type="success">{message}</AdminMessage> : null}

      {!loading && (
        <AdminStatGrid>
          <AdminStatCard
            label="В списке"
            value={programStats.total}
            hint={filter ? `Фильтр: ${getProgramPublishStatusLabel(filter)}` : "Все статусы публикации"}
          />
          <AdminStatCard label="Опубликовано" value={programStats.published} />
          <AdminStatCard label="Черновики" value={programStats.draft} />
          <AdminStatCard label="Витрина (⭐)" value={programStats.starred} />
        </AdminStatGrid>
      )}

      <ProgramCreateFormCard
        createForm={createForm}
        setCreateForm={setCreateForm}
        organizers={organizers}
        creating={creating}
        onSubmit={handleCreateProgram}
      />

      <AdminFiltersBar title="Каталог">
        <AdminFilterField label="Статус публикации">
          <select className="mw-admin-input mw-admin-minw-260" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Все</option>
            {PROGRAM_PUBLISH_STATUSES.map((status) => (
              <option key={status} value={status}>
                {getProgramPublishStatusLabel(status)}
              </option>
            ))}
          </select>
        </AdminFilterField>
      </AdminFiltersBar>

      {loading ? (
        <AdminLoadingState label="Загружаем программы…" />
      ) : programs.length === 0 ? (
        <AdminEmptyState
          title="Нет программ"
          description="По выбранному фильтру или в целом в каталоге пока нет записей. Создайте черновик выше или смените фильтр."
        />
      ) : (
        <div className="mw-admin-table-outer">
          <ProgramCatalogTable
            programs={programs}
            programScores={programScores}
            mediaDrafts={mediaDrafts}
            setMediaDrafts={setMediaDrafts}
            statusDrafts={statusDrafts}
            setStatusDrafts={setStatusDrafts}
            intakeDrafts={intakeDrafts}
            setIntakeDrafts={setIntakeDrafts}
            availabilityDrafts={availabilityDrafts}
            setAvailabilityDrafts={setAvailabilityDrafts}
            spotlightDrafts={spotlightDrafts}
            setSpotlightDrafts={setSpotlightDrafts}
            savingStatusId={savingStatusId}
            savingMediaId={savingMediaId}
            savingIntakeId={savingIntakeId}
            savingAvailabilityId={savingAvailabilityId}
            savingSpotlightId={savingSpotlightId}
            onSaveStatus={handleSaveStatus}
            onSaveIntake={handleSaveIntake}
            onAddMedia={handleAddMedia}
            onSaveAvailability={handleSaveAvailability}
            onSaveSpotlight={handleSaveSpotlight}
          />
        </div>
      )}
    </main>
  );
}
