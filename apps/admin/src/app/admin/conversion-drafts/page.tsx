"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminNav } from "../../../components/AdminNav";
import type { ConversionDraftsStats } from "../../../components/conversionDraftsStatsTypes";
import { adminJson, getAdminToken } from "../../../lib/admin";

type DraftRow = {
  id: string;
  programId: string;
  organizerId: string;
  stage: number;
  channel: string;
  status: string;
  createdAt: string;
  deferredUntil: string | null;
  expiresAt: string | null;
  ownerNotifiedAt: string | null;
  ownerNotifyLastAttemptAt: string | null;
  ownerNotifyLastError: string | null;
  ownerNotifyStatus: "sent" | "pending" | "failed";
  ownerNotifyErrorSnippet: string | null;
  program: { id: string; title: string; publishStatus: string };
  organizer: { id: string; displayName: string | null; contactEmail: string };
};

const DEFAULT_LIMIT = 50;

function ConversionDraftsListInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stats, setStats] = useState<ConversionDraftsStats | null>(null);
  const [items, setItems] = useState<DraftRow[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [filterStatus, setFilterStatus] = useState(searchParams.get("status") ?? "");
  const [filterStage, setFilterStage] = useState(searchParams.get("stage") ?? "");
  const [filterProgramId, setFilterProgramId] = useState(searchParams.get("programId") ?? "");
  const [filterOrganizerId, setFilterOrganizerId] = useState(searchParams.get("organizerId") ?? "");

  const buildListQuery = useCallback(
    (off: number, lim: number) => {
      const p = new URLSearchParams();
      if (filterStatus.trim()) p.set("status", filterStatus.trim());
      if (filterStage.trim()) p.set("stage", filterStage.trim());
      if (filterProgramId.trim()) p.set("programId", filterProgramId.trim());
      if (filterOrganizerId.trim()) p.set("organizerId", filterOrganizerId.trim());
      p.set("limit", String(lim));
      p.set("offset", String(off));
      return `?${p.toString()}`;
    },
    [filterStatus, filterStage, filterProgramId, filterOrganizerId],
  );

  const load = useCallback(
    async (off: number, lim: number) => {
      setError("");
      setLoading(true);
      try {
        const [s, list] = await Promise.all([
          adminJson<ConversionDraftsStats>("/admin/conversion-drafts/stats/summary"),
          adminJson<{ items: DraftRow[]; total: number; limit: number; offset: number }>(
            `/admin/conversion-drafts${buildListQuery(off, lim)}`,
          ),
        ]);
        setStats(s);
        setItems(list.items);
        setTotal(list.total);
        if (Number.isFinite(list.limit)) setLimit(list.limit);
        if (Number.isFinite(list.offset)) setOffset(list.offset);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [buildListQuery],
  );

  useEffect(() => {
    if (!getAdminToken()) {
      window.location.href = "/login";
      return;
    }
    const o = Number(searchParams.get("offset"));
    const l = Number(searchParams.get("limit"));
    const off = Number.isFinite(o) && o >= 0 ? Math.floor(o) : 0;
    const lim = Number.isFinite(l) && l >= 1 ? Math.min(100, Math.floor(l)) : DEFAULT_LIMIT;
    setOffset(off);
    setLimit(lim);
    load(off, lim).catch(() => {});
  }, [searchParams, load]);

  function applyFilters(e: FormEvent) {
    e.preventDefault();
    const qs = buildListQuery(0, limit).replace(/^\?/, "");
    router.replace(qs ? `/admin/conversion-drafts?${qs}` : "/admin/conversion-drafts");
    load(0, limit).catch(() => {});
  }

  function clearFilters() {
    setFilterStatus("");
    setFilterStage("");
    setFilterProgramId("");
    setFilterOrganizerId("");
    router.replace(`/admin/conversion-drafts?limit=${DEFAULT_LIMIT}&offset=0`);
    load(0, DEFAULT_LIMIT).catch(() => {});
  }

  const pageEnd = offset + items.length;
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  function goPrev() {
    const nextOff = Math.max(0, offset - limit);
    const qs = buildListQuery(nextOff, limit).replace(/^\?/, "");
    router.replace(`/admin/conversion-drafts?${qs}`);
    load(nextOff, limit).catch(() => {});
  }

  function goNext() {
    const nextOff = offset + limit;
    const qs = buildListQuery(nextOff, limit).replace(/^\?/, "");
    router.replace(`/admin/conversion-drafts?${qs}`);
    load(nextOff, limit).catch(() => {});
  }

  return (
    <main style={{ padding: 24, maxWidth: 1600 }}>
      <AdminNav current="/admin/conversion-drafts" />
      <h1 style={{ marginTop: 0 }} data-testid="conversion-drafts-heading">
        Conversion drafts (owner approval)
      </h1>
      <p style={{ marginBottom: 16 }}>
        <Link href="/">← Главная</Link>
        {" · "}
        <Link href="/programs">Программы</Link>
      </p>

      {stats && (
        <section
          data-testid="conversion-drafts-stats-banner"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            marginBottom: 24,
            padding: 16,
            background: "rgba(0,0,0,0.04)",
            borderRadius: 8,
          }}
        >
          <div>
            <strong>Ждут решения</strong> (awaiting_owner): {stats.awaitingOwner}
          </div>
          <div>
            <strong>Отложено</strong>: {stats.deferred}
          </div>
          <div>
            <strong>Отклонено</strong>: {stats.rejected}
          </div>
          <div>
            <strong>Отправлено сегодня (UTC)</strong>: {stats.sentToday}
            <span style={{ fontSize: 12, color: "#666", marginLeft: 8 }}>
              с {new Date(stats.sentTodayStartsAt).toLocaleString("ru-RU")}
            </span>
          </div>
          {stats.ownerNotifyFailed > 0 && (
            <div style={{ color: "#b42318" }}>
              <strong>Ошибка TG owner</strong>: {stats.ownerNotifyFailed}
            </div>
          )}
        </section>
      )}

      <form
        onSubmit={applyFilters}
        style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end", marginBottom: 20 }}
      >
        <label>
          status
          <input
            data-testid="conversion-drafts-filter-status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            placeholder="awaiting_owner"
            style={{ display: "block", minWidth: 140, padding: 6 }}
          />
        </label>
        <label>
          stage
          <input
            value={filterStage}
            onChange={(e) => setFilterStage(e.target.value)}
            placeholder="3"
            style={{ display: "block", width: 72, padding: 6 }}
          />
        </label>
        <label>
          programId
          <input
            value={filterProgramId}
            onChange={(e) => setFilterProgramId(e.target.value)}
            style={{ display: "block", minWidth: 220, padding: 6, fontFamily: "monospace", fontSize: 12 }}
          />
        </label>
        <label>
          organizerId
          <input
            value={filterOrganizerId}
            onChange={(e) => setFilterOrganizerId(e.target.value)}
            style={{ display: "block", minWidth: 220, padding: 6, fontFamily: "monospace", fontSize: 12 }}
          />
        </label>
        <label>
          limit
          <input
            type="number"
            min={1}
            max={100}
            value={limit}
            onChange={(e) => setLimit(Math.min(100, Math.max(1, Number(e.target.value) || DEFAULT_LIMIT)))}
            style={{ display: "block", width: 72, padding: 6 }}
          />
        </label>
        <button type="submit" data-testid="conversion-drafts-apply-filters" style={{ padding: "8px 16px" }}>
          Применить
        </button>
        <button type="button" onClick={clearFilters} style={{ padding: "8px 16px" }}>
          Сбросить
        </button>
        <button type="button" onClick={() => load(offset, limit).catch(() => {})} style={{ padding: "8px 16px" }} disabled={loading}>
          Обновить
        </button>
      </form>

      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {loading && <p>Загрузка…</p>}

      {!loading && !error && (
        <>
          <p style={{ fontSize: 14, color: "#555", marginBottom: 8 }}>
            Записей: <strong>{total}</strong>, показано {items.length ? offset + 1 : 0}–{pageEnd} (limit {limit}, offset {offset})
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
            <button type="button" onClick={goPrev} disabled={!hasPrev || loading} style={{ padding: "6px 14px" }}>
              ← Назад
            </button>
            <button type="button" onClick={goNext} disabled={!hasNext || loading} style={{ padding: "6px 14px" }}>
              Вперёд →
            </button>
          </div>
          <div style={{ overflowX: "auto" }} data-testid="conversion-drafts-table">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid #ccc" }}>
                  <th style={{ padding: 8 }}>Программа</th>
                  <th style={{ padding: 8 }}>Организатор</th>
                  <th style={{ padding: 8 }}>stage</th>
                  <th style={{ padding: 8 }}>channel</th>
                  <th style={{ padding: 8 }}>status</th>
                  <th style={{ padding: 8 }}>owner TG</th>
                  <th style={{ padding: 8 }}>посл. попытка</th>
                  <th style={{ padding: 8 }}>ошибка</th>
                  <th style={{ padding: 8 }}>created</th>
                  <th style={{ padding: 8 }}>deferredUntil</th>
                  <th style={{ padding: 8 }}>expires</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 8, maxWidth: 200 }}>
                      <Link href={`/admin/conversion-drafts/${row.id}`}>{row.program.title}</Link>
                      <div style={{ fontSize: 11, color: "#666", fontFamily: "monospace" }}>{row.programId}</div>
                    </td>
                    <td style={{ padding: 8 }}>
                      {row.organizer.displayName || "—"}
                      <div style={{ fontSize: 11, color: "#666", fontFamily: "monospace" }}>{row.organizerId}</div>
                    </td>
                    <td style={{ padding: 8 }}>{row.stage}</td>
                    <td style={{ padding: 8 }}>{row.channel}</td>
                    <td style={{ padding: 8 }}>{row.status}</td>
                    <td style={{ padding: 8 }}>{row.ownerNotifyStatus}</td>
                    <td style={{ padding: 8, whiteSpace: "nowrap", fontSize: 12 }}>
                      {row.ownerNotifyLastAttemptAt ? new Date(row.ownerNotifyLastAttemptAt).toLocaleString("ru-RU") : "—"}
                    </td>
                    <td style={{ padding: 8, maxWidth: 140, fontSize: 11, color: row.ownerNotifyErrorSnippet ? "#b42318" : "#666" }}>
                      {row.ownerNotifyErrorSnippet ?? "—"}
                    </td>
                    <td style={{ padding: 8, whiteSpace: "nowrap", fontSize: 12 }}>
                      {new Date(row.createdAt).toLocaleString("ru-RU")}
                    </td>
                    <td style={{ padding: 8, whiteSpace: "nowrap", fontSize: 12 }}>
                      {row.deferredUntil ? new Date(row.deferredUntil).toLocaleString("ru-RU") : "—"}
                    </td>
                    <td style={{ padding: 8, whiteSpace: "nowrap", fontSize: 12 }}>
                      {row.expiresAt ? new Date(row.expiresAt).toLocaleString("ru-RU") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && <p style={{ marginTop: 16 }}>Нет записей по фильтру.</p>}
          </div>
        </>
      )}
    </main>
  );
}

export default function ConversionDraftsPage() {
  return (
    <Suspense fallback={<p style={{ padding: 24 }}>Загрузка…</p>}>
      <ConversionDraftsListInner />
    </Suspense>
  );
}
