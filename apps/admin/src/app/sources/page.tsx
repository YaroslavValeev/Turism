"use client";

import { useEffect, useMemo, useState } from "react";
import { adminJson, getAdminToken } from "../../lib/admin";
import { AdminFilterField, AdminFiltersBar } from "../../components/admin/AdminFiltersBar";
import { AdminLoadingState } from "../../components/admin/AdminLoadingState";
import { AdminMessage } from "../../components/admin/AdminMessage";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminSectionCard } from "../../components/admin/AdminSectionCard";
import { AdminStatCard, AdminStatGrid } from "../../components/admin/AdminStatCard";
import { SourceCreateFormCard } from "../../components/admin/sources/SourceCreateFormCard";
import { SourceInstagramQuickAddCard } from "../../components/admin/sources/SourceInstagramQuickAddCard";
import { SourceLinkageBackfillCard } from "../../components/admin/sources/SourceLinkageBackfillCard";
import { SourceProposalFormCard } from "../../components/admin/sources/SourceProposalFormCard";
import { SourceProposalQueueCard } from "../../components/admin/sources/SourceProposalQueueCard";
import { SourcesActiveTable } from "../../components/admin/sources/SourcesActiveTable";
import {
  EMPTY_DRAFT,
  type LinkageBackfillReport,
  type SourceActiveFilter,
  type SourceDraft,
  type SourceRecord,
  type SourceProposal,
  toDraft,
} from "../../components/admin/sources/sourceTypes";

export default function SourcesPage() {
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [proposals, setProposals] = useState<SourceProposal[]>([]);
  const [organizers, setOrganizers] = useState<{ id: string; displayName: string }[]>([]);
  const [drafts, setDrafts] = useState<Record<string, SourceDraft>>({});
  const [createDraft, setCreateDraft] = useState<SourceDraft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string>("");
  const [runningId, setRunningId] = useState<string>("");
  const [proposalSaving, setProposalSaving] = useState(false);
  const [rejectingProposalId, setRejectingProposalId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [linkageOrgScope, setLinkageOrgScope] = useState("");
  const [linkageReport, setLinkageReport] = useState<LinkageBackfillReport | null>(null);
  const [linkageLoading, setLinkageLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<SourceActiveFilter>("all");
  const [search, setSearch] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [sourcesData, organizersData, proposalsData] = await Promise.all([
        adminJson<SourceRecord[]>("/sources"),
        adminJson<typeof organizers>("/organizers"),
        adminJson<SourceProposal[]>("/sources/proposals"),
      ]);
      setSources(sourcesData);
      setOrganizers(organizersData);
      setProposals(proposalsData);
      setDrafts(Object.fromEntries(sourcesData.map((source) => [source.id, toDraft(source)])));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getAdminToken()) {
      window.location.href = "/login";
      return;
    }
    void loadData();
  }, []);

  const filteredSources = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sources.filter((s) => {
      if (activeFilter === "active" && !s.isActive) return false;
      if (activeFilter === "inactive" && s.isActive) return false;
      if (!q) return true;
      const hay = [s.name, s.urlOrHandle, s.type, s.discipline, s.region, s.country, s.language || ""]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [sources, activeFilter, search]);

  const sourceStats = useMemo(() => {
    const total = sources.length;
    const active = sources.filter((s) => s.isActive).length;
    const rawTotal = sources.reduce((n, s) => n + (s._count?.rawItems ?? 0), 0);
    return { total, active, inactive: total - active, rawTotal };
  }, [sources]);

  async function handleCreateBatch(items: { url: string; name: string }[]) {
    if (items.length === 0) return;
    setMessage("");
    setError("");
    setSavingId("batch");
    try {
      for (const { url, name } of items) {
        await adminJson<SourceRecord>("/sources", {
          method: "POST",
          body: JSON.stringify({
            type: "instagram",
            name: name.slice(0, 200),
            urlOrHandle: url,
            priority: 100,
            trustScore: 0.5,
            fetchIntervalMinutes: 1440,
            isActive: true,
            language: "ru",
            metaJson: {
              autoPublish: false,
              fallbackImageUrl: null,
            },
          }),
        });
      }
      setMessage(`Добавлено источников: ${items.length}`);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingId("");
    }
  }

  async function handleProposalSubmit(input: { url: string; displayName: string; organizerName: string; notes: string }) {
    setMessage("");
    setError("");
    setProposalSaving(true);
    try {
      const result = await adminJson<{ kind: "created" | "duplicate"; proposal?: SourceProposal }>("/sources/proposals", { method: "POST", body: JSON.stringify(input) });
      setMessage(result.kind === "created" ? "Заявка принята в очередь проверки." : "Такая заявка уже ожидает проверки.");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProposalSaving(false);
    }
  }

  async function handleProposalReject(id: string) {
    if (!window.confirm("Отклонить заявку? Активный источник создан не будет.")) return;
    setMessage("");
    setError("");
    setRejectingProposalId(id);
    try {
      await adminJson<SourceProposal>(`/sources/proposals/${id}/reject`, { method: "PATCH", body: JSON.stringify({}) });
      setMessage("Заявка отклонена.");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRejectingProposalId("");
    }
  }

  async function handleCreate() {
    setMessage("");
    setError("");
    setSavingId("create");
    try {
      await adminJson<SourceRecord>("/sources", {
        method: "POST",
        body: JSON.stringify({
          ...createDraft,
          priority: Number(createDraft.priority),
          trustScore: Number(createDraft.trustScore),
          fetchIntervalMinutes: Number(createDraft.fetchIntervalMinutes),
          organizerId: createDraft.organizerId || null,
          metaJson: {
            autoPublish: createDraft.autoPublish,
            fallbackImageUrl: createDraft.fallbackImageUrl || null,
          },
        }),
      });
      setCreateDraft(EMPTY_DRAFT);
      setMessage("Источник создан");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingId("");
    }
  }

  async function handleSave(sourceId: string) {
    const draft = drafts[sourceId];
    if (!draft) return;
    setMessage("");
    setError("");
    setSavingId(sourceId);
    try {
      await adminJson<SourceRecord>(`/sources/${sourceId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...draft,
          priority: Number(draft.priority),
          trustScore: Number(draft.trustScore),
          fetchIntervalMinutes: Number(draft.fetchIntervalMinutes),
          organizerId: draft.organizerId || null,
          metaJson: {
            autoPublish: draft.autoPublish,
            fallbackImageUrl: draft.fallbackImageUrl || null,
          },
        }),
      });
      setMessage("Источник обновлён");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingId("");
    }
  }

  async function handleRun(sourceId: string) {
    setMessage("");
    setError("");
    setRunningId(sourceId);
    try {
      await adminJson(`/sources/${sourceId}/run`, { method: "POST" });
      setMessage("Источник прогнан: collect → normalize → dedup");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunningId("");
    }
  }

  function updateDraft(sourceId: string, patch: Partial<SourceDraft>) {
    setDrafts((current) => ({
      ...current,
      [sourceId]: { ...current[sourceId], ...patch },
    }));
  }

  function linkageBody(mode: "dry_run" | "apply") {
    const organizerId = linkageOrgScope.trim();
    return JSON.stringify({
      mode,
      ...(organizerId ? { organizerId } : {}),
    });
  }

  async function handleLinkageDryRun() {
    setMessage("");
    setError("");
    setLinkageLoading(true);
    try {
      const report = await adminJson<LinkageBackfillReport>("/sources/linkage-backfill", {
        method: "POST",
        body: linkageBody("dry_run"),
      });
      setLinkageReport(report);
      setMessage("PR2: dry-run linkage выполнен (см. блок ниже).");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLinkageLoading(false);
    }
  }

  async function handleLinkageApply() {
    setMessage("");
    setError("");
    if (!window.confirm("Применение выставит externalChannelId только для строк в статусе would_link (после согласования). Продолжить?")) {
      return;
    }
    setLinkageLoading(true);
    try {
      const report = await adminJson<LinkageBackfillReport>("/sources/linkage-backfill", {
        method: "POST",
        body: linkageBody("apply"),
      });
      setLinkageReport(report);
      setMessage(
        typeof report.appliedCount === "number" ? `PR2: apply linkage — обновлено записей: ${report.appliedCount}.` : "PR2: apply linkage завершён.",
      );
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLinkageLoading(false);
    }
  }

  return (
    <main className="mw-admin-page">
      <AdminPageHeader
        title="Источники для парсинга"
        description="Добавляйте Instagram-ссылки (быстрый блок или полная форма). Ниже — полный список и кнопка «Собрать сейчас». Найденный анонс идёт в модерацию, в каталог — после approve."
      />
      {error ? <AdminMessage type="error">{error}</AdminMessage> : null}
      {message ? <AdminMessage type="success">{message}</AdminMessage> : null}

      {loading ? (
        <AdminLoadingState label="Загружаем источники…" />
      ) : (
        <>
          <AdminStatGrid>
            <AdminStatCard
              label="Источников"
              value={sourceStats.total}
              hint={filteredSources.length !== sourceStats.total ? `В списке: ${filteredSources.length} по фильтру` : undefined}
            />
            <AdminStatCard label="Активных" value={sourceStats.active} hint="Флаг «Активен» в карточке" />
            <AdminStatCard label="Выключено" value={sourceStats.inactive} />
            <AdminStatCard label="Сырые записи (сумма)" value={sourceStats.rawTotal} />
          </AdminStatGrid>

          <SourceInstagramQuickAddCard saving={savingId === "batch"} onAddUrls={handleCreateBatch} />

          <SourceProposalFormCard saving={proposalSaving} onSubmit={handleProposalSubmit} />

          <SourceProposalQueueCard proposals={proposals} rejectingId={rejectingProposalId} onReject={handleProposalReject} />

          <SourceLinkageBackfillCard
            organizers={organizers}
            linkageOrgScope={linkageOrgScope}
            onLinkageOrgScope={setLinkageOrgScope}
            linkageReport={linkageReport}
            linkageLoading={linkageLoading}
            onDryRun={handleLinkageDryRun}
            onApply={handleLinkageApply}
          />

          <SourceCreateFormCard
            createDraft={createDraft}
            onChange={(patch) => setCreateDraft((v) => ({ ...v, ...patch }))}
            organizers={organizers}
            saving={savingId === "create"}
            onCreate={handleCreate}
          />

          <AdminFiltersBar title="Список">
            <AdminFilterField label="Состояние">
              <select
                className="mw-admin-input"
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value as SourceActiveFilter)}
              >
                <option value="all">Все</option>
                <option value="active">Только активные</option>
                <option value="inactive">Только выключенные</option>
              </select>
            </AdminFilterField>
            <AdminFilterField label="Поиск (название, URL, дисциплина, регион)">
              <input
                className="mw-admin-input mw-admin-minw-260"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Например, wakesurf или t.me/…"
              />
            </AdminFilterField>
          </AdminFiltersBar>

          <AdminSectionCard title="Активные источники">
            <SourcesActiveTable
              sources={filteredSources}
              drafts={drafts}
              organizers={organizers}
              savingId={savingId}
              runningId={runningId}
              onUpdateDraft={updateDraft}
              onSave={handleSave}
              onRun={handleRun}
            />
          </AdminSectionCard>
        </>
      )}
    </main>
  );
}
