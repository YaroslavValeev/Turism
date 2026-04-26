"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminJson, getAdminToken } from "../../lib/admin";
import { AdminEmptyState } from "../../components/admin/AdminEmptyState";
import { AdminFilterField, AdminFiltersBar } from "../../components/admin/AdminFiltersBar";
import { AdminLoadingState } from "../../components/admin/AdminLoadingState";
import { AdminMessage } from "../../components/admin/AdminMessage";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminSectionCard } from "../../components/admin/AdminSectionCard";
import { AdminStatusBadge } from "../../components/admin/AdminStatusBadge";

const STATUSES = [
  "",
  "draft",
  "pending_owner_review",
  "approved",
  "sent",
  "failed",
  "skipped",
] as const;

type CampaignRow = {
  id: string;
  organizerId: string;
  periodStart: string;
  periodEnd: string;
  templateType: string;
  viewsCount: number;
  clicksCount: number;
  leadsCount: number;
  dealsCount: number;
  dealAmountTotal: number;
  status: string;
  emailSubject: string;
  emailBody: string;
  ownerApprovedAt: string | null;
  sentAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  organizer?: { displayName: string | null; contactEmail: string | null } | null;
};

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function templateLabel(t: string): string {
  if (t === "A_soft") return "A — мягкое";
  if (t === "B_leads") return "B — с заявками";
  if (t === "C_deals") return "C — сделки";
  return t;
}

function statusTone(
  s: string,
): "ok" | "warn" | "danger" | "muted" {
  if (s === "sent") return "ok";
  if (s === "failed") return "danger";
  if (s === "skipped" || s === "draft") return "muted";
  if (s === "pending_owner_review" || s === "approved") return "warn";
  return "muted";
}

export default function OrganizerOutreachPage() {
  const [filter, setFilter] = useState<string>("");
  const [list, setList] = useState<CampaignRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CampaignRow | null>(null);
  const [subj, setSubj] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadList = useCallback(async () => {
    if (!getAdminToken()) return;
    setLoading(true);
    setError("");
    const q = filter
      ? `?status=${encodeURIComponent(filter)}`
      : "";
    try {
      const res = await adminJson<{ campaigns: CampaignRow[] }>(`/api/organizer-outreach/campaigns${q}`);
      setList(Array.isArray(res.campaigns) ? res.campaigns : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setError("");
    try {
      const row = await adminJson<CampaignRow>(`/api/organizer-outreach/campaigns/${id}`);
      setDetail(row);
      setSubj(row.emailSubject);
      setBody(row.emailBody);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getAdminToken()) {
      window.location.href = "/login";
      return;
    }
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) {
      void loadDetail(selectedId);
    } else {
      setDetail(null);
      setSubj("");
      setBody("");
    }
  }, [selectedId, loadDetail]);

  const stats = useMemo(() => {
    const by = (s: string) => list.filter((c) => c.status === s).length;
    return {
      total: list.length,
      pending: by("pending_owner_review"),
      sent: by("sent"),
      failed: by("failed"),
    };
  }, [list]);

  async function runWith(fn: () => Promise<void>, label: string) {
    setBusy(label);
    setMessage("");
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function post(path: string) {
    await adminJson(path, { method: "POST", body: JSON.stringify({}) });
  }

  async function handleGenerate() {
    await runWith(async () => {
      const r = await adminJson<{ created: number; errors?: string[]; campaigns: unknown }>(
        "/api/organizer-outreach/run-generate",
        { method: "POST", body: JSON.stringify({}) },
      );
      const errs = (r.errors ?? []).filter(Boolean);
      setMessage(
        `Создано черновиков: ${r.created}.${errs.length ? ` Предупреждения: ${errs.join("; ")}` : ""}`,
      );
      await loadList();
    }, "generate");
  }

  async function saveDraft() {
    if (!selectedId) return;
    await runWith(async () => {
      await adminJson(`/api/organizer-outreach/campaigns/${selectedId}`, {
        method: "PATCH",
        body: JSON.stringify({ emailSubject: subj, emailBody: body }),
      });
      setMessage("Текст сохранён как черновик.");
      await loadList();
      await loadDetail(selectedId);
    }, "save");
  }

  async function submitReview() {
    if (!selectedId) return;
    await runWith(async () => {
      await post(`/api/organizer-outreach/campaigns/${selectedId}/submit-for-review`);
      setMessage("Статус: ожидает согласования owner.");
      await loadList();
      await loadDetail(selectedId);
    }, "submit");
  }

  async function aiSuggest() {
    if (!selectedId) return;
    await runWith(async () => {
      const r = await adminJson<{ body: string }>(
        `/api/organizer-outreach/campaigns/${selectedId}/ai-suggest-body`,
        { method: "POST", body: JSON.stringify({ tone: "короткие фразы, дружелюбно" }) },
      );
      setBody(r.body);
      setMessage("Подсказка AI вставлена в поле (проверь цифры).");
    }, "ai");
  }

  if (loading && !list.length) {
    return (
      <main className="mw-admin-page">
        <AdminLoadingState label="Загружаем рассылку…" />
      </main>
    );
  }

  return (
    <main className="mw-admin-page">
      <AdminPageHeader
        title="Outreach организаторам (после 60 дн.)"
        description="Черновики с метриками из БД → согласование в Telegram/здесь → только после approve отправка на contact email. Без auto-send. Комиссия 3% в тексте писем — договорённость продукта."
      />

      {error ? <AdminMessage type="error">{error}</AdminMessage> : null}
      {message ? <AdminMessage type="success">{message}</AdminMessage> : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <button
          type="button"
          className="mw-btn mw-btn--primary"
          disabled={busy !== ""}
          onClick={() => void handleGenerate()}
        >
          {busy === "generate" ? "Генерация…" : "Сгенерировать (job)"}
        </button>
        <span style={{ fontSize: 13, color: "var(--mw-text-muted, #666)" }}>
          ORGANIZER_OUTREACH_MIN_FREE_DAYS, ORGANIZER_OUTREACH_METRICS_DAYS — в API .env
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 10,
          marginBottom: 20,
        }}
      >
        <AdminSectionCard title="Всего в списке">
          <strong style={{ fontSize: 22 }}>{stats.total}</strong>
        </AdminSectionCard>
        <AdminSectionCard title="На согласовании">
          <strong style={{ fontSize: 22 }}>{stats.pending}</strong>
        </AdminSectionCard>
        <AdminSectionCard title="Отправлено">
          <strong style={{ fontSize: 22 }}>{stats.sent}</strong>
        </AdminSectionCard>
        <AdminSectionCard title="Ошибки">
          <strong style={{ fontSize: 22 }}>{stats.failed}</strong>
        </AdminSectionCard>
      </div>

      <AdminFiltersBar>
        <AdminFilterField label="Статус">
          <select
            className="mw-admin-input"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ minWidth: 220 }}
          >
            <option value="">Все</option>
            {STATUSES.filter(Boolean).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </AdminFilterField>
        <button
          type="button"
          className="mw-btn"
          onClick={() => void loadList()}
          disabled={loading}
        >
          Обновить
        </button>
      </AdminFiltersBar>

      {list.length === 0 ? (
        <AdminEmptyState title="Пока нет кампаний" description="Нажмите «Сгенерировать» или смените фильтр." />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(240px, 0.4fr) minmax(0, 1fr)",
            gap: 20,
            alignItems: "start",
          }}
        >
          <AdminSectionCard title="Список">
            <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: "70vh", overflow: "auto" }}>
              {list.map((c) => (
                <li key={c.id} style={{ marginBottom: 8 }}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                    className="mw-link-button"
                    style={{
                      textAlign: "left",
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border:
                        c.id === selectedId
                          ? "1px solid var(--mw-border-strong, #333)"
                          : "1px solid var(--mw-border, #e0e0e0)",
                      background: c.id === selectedId ? "var(--mw-surface-2, #f3f3f3)" : "transparent",
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {c.organizer?.displayName ?? c.organizerId}
                    </div>
                    <div style={{ fontSize: 11, color: "#666" }}>
                      {c.periodStart?.slice(0, 10)} — {c.periodEnd?.slice(0, 10)} · {templateLabel(c.templateType)}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <AdminStatusBadge tone={statusTone(c.status)}>{c.status}</AdminStatusBadge>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </AdminSectionCard>

          <AdminSectionCard title={selectedId ? "Предпросмотр и действия" : "Выберите письмо слева"}>
            {detailLoading ? <AdminLoadingState label="Деталь…" /> : null}
            {detail && !detailLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <p style={{ margin: 0, fontSize: 14 }}>
                  <strong>Организатор:</strong> {detail.organizer?.displayName ?? "—"}{" "}
                  <span style={{ color: "#666" }}>({detail.organizer?.contactEmail ?? "нет email"})</span>
                </p>
                <p style={{ margin: 0, fontSize: 14 }}>
                  <strong>Период</strong> {formatDt(detail.periodStart)} — {formatDt(detail.periodEnd)} ·{" "}
                  <strong>Тип</strong> {templateLabel(detail.templateType)}
                </p>
                <p style={{ margin: 0, fontSize: 14 }}>
                  <strong>Метрики:</strong> просмотры {detail.viewsCount}, клики {detail.clicksCount}, заявки{" "}
                  {detail.leadsCount}, сделки {detail.dealsCount}, сумма ₽ {detail.dealAmountTotal}
                </p>
                <p style={{ margin: 0, fontSize: 13, color: "#666" }}>
                  Approve: {detail.ownerApprovedAt ? formatDt(detail.ownerApprovedAt) : "—"} · Sent:{" "}
                  {detail.sentAt ? formatDt(detail.sentAt) : "—"}
                </p>
                {detail.errorMessage ? (
                  <AdminMessage type="error">
                    {detail.errorMessage}
                  </AdminMessage>
                ) : null}

                <label className="mw-label" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  Тема
                  <input
                    className="mw-input"
                    value={subj}
                    onChange={(e) => setSubj(e.target.value)}
                    disabled={detail.status === "sent"}
                  />
                </label>
                <label className="mw-label" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  Текст
                  <textarea
                    className="mw-input"
                    style={{ minHeight: 220, fontFamily: "inherit" }}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    disabled={detail.status === "sent"}
                  />
                </label>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <button
                    type="button"
                    className="mw-btn"
                    disabled={busy !== "" || detail.status === "sent"}
                    onClick={() => void saveDraft()}
                  >
                    {busy === "save" ? "…" : "Сохранить как черновик"}
                  </button>
                  <button
                    type="button"
                    className="mw-btn"
                    disabled={busy !== "" || detail.status === "sent" || detail.status !== "draft"}
                    onClick={() => void submitReview()}
                  >
                    {busy === "submit" ? "…" : "В очередь на согласование"}
                  </button>
                  <button
                    type="button"
                    className="mw-btn"
                    disabled={busy !== "" || detail.status === "sent"}
                    onClick={() => void aiSuggest()}
                  >
                    {busy === "ai" ? "…" : "AI: переписать (цифры из БД)"}
                  </button>
                </div>

                <div
                  style={{
                    borderTop: "1px solid #e0e0e0",
                    marginTop: 8,
                    paddingTop: 12,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <button
                    type="button"
                    className="mw-btn mw-btn--primary"
                    disabled={busy !== "" || detail.status === "sent" || detail.status === "approved"}
                    onClick={() =>
                      void runWith(async () => {
                        await post(
                          `/api/organizer-outreach/campaigns/${detail.id}/approve-and-send`,
                        );
                        setMessage("Одобрено и поставлено в отправку (SMTP).");
                        await loadList();
                        setSelectedId(detail.id);
                        await loadDetail(detail.id);
                      }, "approveSend")
                    }
                  >
                    {busy === "approveSend" ? "…" : "Согласовать и отправить"}
                  </button>
                  <button
                    type="button"
                    className="mw-btn"
                    disabled={busy !== "" || detail.status === "sent" || detail.status === "approved"}
                    onClick={() =>
                      void runWith(async () => {
                        await post(`/api/organizer-outreach/campaigns/${detail.id}/approve`);
                        setMessage("Статус: approved (отправьте вручную).");
                        await loadList();
                        await loadDetail(detail.id);
                      }, "approve")
                    }
                  >
                    {busy === "approve" ? "…" : "Только согласовать"}
                  </button>
                  <button
                    type="button"
                    className="mw-btn"
                    disabled={busy !== "" || detail.status === "sent" || detail.status !== "approved"}
                    onClick={() =>
                      void runWith(async () => {
                        await post(`/api/organizer-outreach/campaigns/${detail.id}/send`);
                        setMessage("Письмо отправлено.");
                        await loadList();
                        await loadDetail(detail.id);
                      }, "send")
                    }
                  >
                    {busy === "send" ? "…" : "Отправить (уже approved)"}
                  </button>
                  <button
                    type="button"
                    className="mw-btn"
                    disabled={busy !== "" || detail.status === "sent"}
                    onClick={() =>
                      void runWith(async () => {
                        await post(`/api/organizer-outreach/campaigns/${detail.id}/skip`);
                        setMessage("Пропущено.");
                        await loadList();
                        await loadDetail(detail.id);
                      }, "skip")
                    }
                  >
                    {busy === "skip" ? "…" : "Пропустить"}
                  </button>
                  <button
                    type="button"
                    className="mw-btn"
                    disabled={busy !== "" || detail.status === "sent"}
                    onClick={() =>
                      void runWith(async () => {
                        await post(`/api/organizer-outreach/campaigns/${detail.id}/decline`);
                        setMessage("Отклонено (статус failed).");
                        await loadList();
                        await loadDetail(detail.id);
                      }, "decline")
                    }
                  >
                    {busy === "decline" ? "…" : "Не отправлять"}
                  </button>
                </div>
              </div>
            ) : null}
            {!selectedId && !detailLoading ? (
              <p style={{ color: "#666", fontSize: 14 }}>Выберите запись, чтобы увидеть текст и кнопки согласования.</p>
            ) : null}
          </AdminSectionCard>
        </div>
      )}
    </main>
  );
}
