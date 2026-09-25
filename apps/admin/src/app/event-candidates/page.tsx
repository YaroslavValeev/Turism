"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import { adminJson, getAdminToken } from "../../lib/admin";
import { AdminEmptyState } from "../../components/admin/AdminEmptyState";
import { AdminFilterField, AdminFiltersBar } from "../../components/admin/AdminFiltersBar";
import { AdminLoadingState } from "../../components/admin/AdminLoadingState";
import { AdminMessage } from "../../components/admin/AdminMessage";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminStatCard, AdminStatGrid } from "../../components/admin/AdminStatCard";
import { AdminStatusBadge } from "../../components/admin/AdminStatusBadge";

type SourceOption = { id: string; name: string };

type SourceRef = {
  id: string;
  name: string;
  type: string;
  trustScore: number;
  urlOrHandle?: string | null;
};

type EventCandidateListItem = {
  id: string;
  status: string;
  reviewPriority: number;
  trustScore: number;
  fitScore: number;
  futureEventScore: number;
  duplicateScore: number;
  finalScore: number;
  normalizedItem: {
    id: string;
    title: string | null;
    discipline: string | null;
    country: string | null;
    region: string | null;
    city: string | null;
    startDate: string | null;
    endDate: string | null;
    organizerName: string | null;
    bookingUrl?: string | null;
    imageUrl?: string | null;
    rawItem: {
      id?: string;
      sourceUrl?: string | null;
      source: SourceRef;
    };
  };
  publishedProgram: {
    id: string;
    publishStatus: string;
    program: { id: string; title: string; publishStatus: string };
  } | null;
};

type CandidateDetail = EventCandidateListItem & {
  decisionNotes: string | null;
  reviewedAt: string | null;
  normalizedItem: EventCandidateListItem["normalizedItem"] & {
    eventType: string | null;
    descriptionShort: string | null;
    descriptionFull: string | null;
    venue: string | null;
    durationDays: number | null;
    level: string | null;
    priceFrom: number | null;
    currency: string | null;
    bookingUrl: string | null;
    imageUrl: string | null;
    confidenceScore: number;
    rawItem: EventCandidateListItem["normalizedItem"]["rawItem"] & {
      rawMediaJson?: unknown;
    };
  };
};

function collectPreviewMediaUrls(detail: CandidateDetail): string[] {
  const urls: string[] = [];
  const push = (value: string | null | undefined) => {
    const url = String(value ?? "").trim();
    if (!url || /telegram\.org\/img\/emoji\//i.test(url)) return;
    const normalized = url.startsWith("//") ? `https:${url}` : url;
    if (!/^https?:\/\//i.test(normalized) && !normalized.startsWith("/")) return;
    if (urls.includes(normalized)) return;
    urls.push(normalized);
  };
  push(detail.normalizedItem.imageUrl);
  const raw = detail.normalizedItem.rawItem.rawMediaJson;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string") push(item);
      else if (item && typeof item === "object") push((item as { url?: string }).url);
    }
  }
  return urls.slice(0, 12);
}

/** Браузер не тянет telesco.pe — через API SOCKS-прокси. */
function presentAdminMediaUrl(url: string): string {
  if (url.startsWith("/ingestion-media/")) {
    const siteBase = (process.env.NEXT_PUBLIC_WEB_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://mywavetour.ru").replace(
      /\/+$/,
      "",
    );
    return `${siteBase}${url}`;
  }
  if (url.startsWith("/")) return url;
  try {
    const host = new URL(url).hostname.toLowerCase();
    const needsProxy =
      host.includes("telesco.pe") ||
      host.includes("telegram.org") ||
      host.includes("cdn-telegram.org") ||
      host === "t.me" ||
      host.endsWith(".t.me");
    if (!needsProxy) return url;
  } catch {
    return url;
  }
  const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? "https://api.mywavetour.ru").replace(/\/+$/, "");
  return `${apiBase}/public/media?url=${encodeURIComponent(url)}`;
}

const DEFAULT_STATUS = "needs_review";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

function statusLabelRu(status: string): string {
  if (status === "new") return "новый";
  if (status === "needs_review") return "требует проверки";
  if (status === "approved") return "одобрен";
  if (status === "rejected") return "отклонён";
  if (status === "merged") return "объединён";
  if (status === "published") return "опубликован";
  if (status === "archived") return "в архиве";
  return status;
}

function candidateStatusTone(s: string): "ok" | "warn" | "danger" | "muted" {
  if (s === "approved" || s === "published") return "ok";
  if (s === "rejected" || s === "archived") return "danger";
  if (s === "needs_review" || s === "new") return "warn";
  return "muted";
}

/** Ссылка для перепроверки источника (пост / профиль / сайт). */
function resolveSourceHref(item: {
  normalizedItem: {
    bookingUrl?: string | null;
    rawItem: { sourceUrl?: string | null; source: SourceRef };
  };
}): string | null {
  const raw = String(item.normalizedItem.rawItem.sourceUrl ?? "").trim();
  const booking = String(item.normalizedItem.bookingUrl ?? "").trim();
  const handle = String(item.normalizedItem.rawItem.source.urlOrHandle ?? "").trim();
  const type = item.normalizedItem.rawItem.source.type;

  const asHttp = (v: string) => (/^https?:\/\//i.test(v) ? v : null);
  if (asHttp(raw)) return raw;
  if (asHttp(booking)) return booking;
  if (asHttp(handle)) return handle;

  if (type === "instagram" && handle) {
    const user = handle.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/$/, "");
    if (user) return `https://www.instagram.com/${user}/`;
  }
  if (type === "telegram" && handle) {
    const user = handle.replace(/^@/, "").replace(/^https?:\/\/t\.me\//i, "").replace(/\/$/, "");
    if (user) return `https://t.me/${user}`;
  }
  if (handle.startsWith("www.")) return `https://${handle}`;
  return null;
}

export default function EventCandidatesPage() {
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [items, setItems] = useState<EventCandidateListItem[]>([]);
  const [selected, setSelected] = useState<CandidateDetail | null>(null);
  const [status, setStatus] = useState(DEFAULT_STATUS);
  const [sourceId, setSourceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (sourceId) params.set("sourceId", sourceId);
    const suffix = params.toString();
    return suffix ? `?${suffix}` : "";
  }, [sourceId, status]);

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const it of items) counts[it.status] = (counts[it.status] ?? 0) + 1;
    return {
      total: items.length,
      needsReview: counts.needs_review ?? 0,
      approved: counts.approved ?? 0,
      published: counts.published ?? 0,
    };
  }, [items]);

  async function loadList() {
    setLoading(true);
    setError("");
    try {
      const [sourcesData, candidatesData] = await Promise.all([
        adminJson<SourceOption[]>("/sources"),
        adminJson<EventCandidateListItem[]>(`/event-candidates${query}`),
      ]);
      setSources(sourcesData);
      setItems(candidatesData);
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
    void loadList();
  }, [query]);

  async function selectCandidate(id: string) {
    setError("");
    try {
      const detail = await adminJson<CandidateDetail>(`/event-candidates/${id}`);
      setSelected(detail);
      window.requestAnimationFrame(() => {
        document.getElementById("candidate-detail-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function runAction(label: string, path: string, body?: Record<string, unknown>) {
    setBusyAction(label);
    setMessage("");
    setError("");
    try {
      const result = await adminJson<Record<string, unknown>>(path, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      });
      if (label === "approve-and-publish") {
        const programId = typeof result.programId === "string" ? result.programId : "";
        setMessage(
          programId
            ? `Готово: программа на сайте (published). ID ${programId}. Проверьте витрину и Telegram-канал.`
            : "Готово: одобрено и опубликовано.",
        );
      } else if (label === "archive-past") {
        const c = typeof result.candidatesArchived === "number" ? result.candidatesArchived : 0;
        const p = typeof result.programsArchived === "number" ? result.programsArchived : 0;
        setMessage(`В архив: кандидатов ${c}, программ ${p}. Прошедшие даты убраны из очереди.`);
        setSelected(null);
      } else {
        setMessage(`Действие выполнено: ${label}`);
      }
      if (selected) await selectCandidate(selected.id);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyAction("");
    }
  }

  async function handleApproveAndPublish() {
    if (!selected) return;
    const ok = window.confirm(
      `Одобрить и сразу опубликовать на сайте + в Telegram?\n\n${selected.normalizedItem.title || "Без названия"}`,
    );
    if (!ok) return;
    await runAction("approve-and-publish", `/event-candidates/${selected.id}/approve-and-publish`);
  }

  async function handleReject() {
    if (!selected) return;
    const notes = window.prompt("Причина отклонения (можно пусто)", "") ?? "";
    await runAction("reject", `/event-candidates/${selected.id}/reject`, { notes });
  }

  function onCardClick(item: EventCandidateListItem, e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("a,button")) return;
    void selectCandidate(item.id);
  }

  return (
    <main className="mw-admin-page mw-admin-page--wide">
      <AdminPageHeader
        title="Кандидаты на публикацию"
        description="Первичную проверку уже сделал скоринг: в «Требуют проверки» попадают только прошедшие пороги (итог ≥ 0.42, будущее ≥ 0.2, likelihood ≥ 0.3). Вам — финальная сверка источника и публикация одной кнопкой."
      />
      {error ? <AdminMessage type="error">{error}</AdminMessage> : null}
      {message ? <AdminMessage type="success">{message}</AdminMessage> : null}

      {loading ? (
        <AdminLoadingState label="Загружаем кандидатов…" />
      ) : (
        <>
          <AdminStatGrid>
            <AdminStatCard label="В выборке" value={stats.total} />
            <AdminStatCard label="Требуют проверки" value={stats.needsReview} />
            <AdminStatCard label="Одобрены" value={stats.approved} />
            <AdminStatCard label="Опубликованы" value={stats.published} />
          </AdminStatGrid>

          <AdminFiltersBar title="Фильтры">
            <AdminFilterField label="Быстрый фильтр">
              <div className="mw-admin-inline-form" style={{ flexWrap: "wrap", gap: 8 }}>
                <button type="button" className="mw-admin-btn mw-admin-btn--ghost" disabled={status === "needs_review"} onClick={() => setStatus("needs_review")}>
                  Требуют проверки
                </button>
                <button type="button" className="mw-admin-btn mw-admin-btn--ghost" disabled={status === "new"} onClick={() => setStatus("new")}>
                  Новые
                </button>
                <button type="button" className="mw-admin-btn mw-admin-btn--ghost" disabled={status === ""} onClick={() => setStatus("")}>
                  Все
                </button>
                <button type="button" className="mw-admin-btn mw-admin-btn--ghost" disabled={status === "published"} onClick={() => setStatus("published")}>
                  Уже опубликованы
                </button>
              </div>
            </AdminFilterField>
            <AdminFilterField label="Статус">
              <select className="mw-admin-input" value={status} onChange={(e) => setStatus(e.target.value)} style={{ minWidth: 200 }}>
                <option value="">Все статусы</option>
                <option value="new">новый</option>
                <option value="needs_review">требует проверки</option>
                <option value="approved">одобрен</option>
                <option value="rejected">отклонён</option>
                <option value="merged">объединён</option>
                <option value="published">опубликован</option>
                <option value="archived">в архиве</option>
              </select>
            </AdminFilterField>
            <AdminFilterField label="Источник">
              <select className="mw-admin-input" value={sourceId} onChange={(e) => setSourceId(e.target.value)} style={{ minWidth: 220 }}>
                <option value="">Все источники</option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </AdminFilterField>
            <button type="button" className="mw-admin-btn mw-admin-btn--ghost" onClick={() => void loadList()}>
              Обновить
            </button>
            <button
              type="button"
              className="mw-admin-btn"
              disabled={busyAction !== ""}
              onClick={() => void runAction("archive-past", "/event-candidates/archive-past")}
              title="Кандидаты и программы с датой окончания (или старта) в прошлом → статус archived"
            >
              {busyAction === "archive-past" ? "Архивируем…" : "Убрать прошедшие в архив"}
            </button>
          </AdminFiltersBar>

          <div className="mw-admin-candidates-layout">
            <section>
              {items.length === 0 ? (
                <AdminEmptyState
                  title="Нет кандидатов в этом фильтре"
                  description="Выберите «Требуют проверки» или «Все». Если пусто — прогоните загрузку на странице Задач."
                />
              ) : (
                <div className="mw-admin-candidates-list">
                  {items.map((item) => {
                    const active = selected?.id === item.id;
                    const href = resolveSourceHref(item);
                    return (
                      <article
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        className={"mw-admin-candidate-card" + (active ? " mw-admin-candidate-card--active" : "")}
                        onClick={(e) => onCardClick(item, e)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            void selectCandidate(item.id);
                          }
                        }}
                      >
                        <div className="mw-admin-candidate-card__body">
                          <div style={{ marginBottom: 8 }}>
                            <AdminStatusBadge tone={candidateStatusTone(item.status)}>
                              {statusLabelRu(item.status)}
                            </AdminStatusBadge>
                            {active ? (
                              <span className="mw-admin-caption" style={{ marginLeft: 8, color: "#0f766e" }}>
                                выбрано
                              </span>
                            ) : null}
                          </div>
                          <strong>{item.normalizedItem.title || "Без названия"}</strong>
                          <div className="mw-admin-caption" style={{ marginTop: 6 }}>
                            {item.normalizedItem.discipline || "—"} ·{" "}
                            {item.normalizedItem.region || item.normalizedItem.country || "—"} ·{" "}
                            {formatDate(item.normalizedItem.startDate)}
                          </div>
                          <div className="mw-admin-caption">
                            {item.normalizedItem.organizerName || "—"} · {item.normalizedItem.rawItem.source.name} (
                            {item.normalizedItem.rawItem.source.type})
                          </div>
                          <div className="mw-admin-candidate-scores" aria-label="Автооценка">
                            <span title="Итоговый score (порог в очередь ≥ 0.42)">
                              итог {item.finalScore.toFixed(2)}
                            </span>
                            <span title="Будущее событие (порог ≥ 0.20)">
                              будущее {item.futureEventScore.toFixed(2)}
                            </span>
                            <span title="Релевантность / fit">
                              fit {item.fitScore.toFixed(2)}
                            </span>
                            <span title="Доверие источника">
                              доверие {item.trustScore.toFixed(2)}
                            </span>
                          </div>
                          <div style={{ marginTop: 8 }}>
                            {href ? (
                              <a
                                className="mw-admin-external-link"
                                href={href}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Открыть источник для перепроверки ↗
                              </a>
                            ) : (
                              <span className="mw-admin-caption">Ссылка источника недоступна</span>
                            )}
                          </div>
                        </div>
                        <div className="mw-admin-candidate-card__actions">
                          <button type="button" className="mw-admin-btn mw-admin-btn--ghost" onClick={() => void selectCandidate(item.id)}>
                            {active ? "Выбрано" : "Выбрать"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <aside id="candidate-detail-panel" className="mw-admin-aside-panel mw-admin-aside-panel--sticky">
              <h2 style={{ marginTop: 0, marginBottom: 8 }}>Публикация</h2>
              {!selected ? (
                <p className="mw-admin-caption" style={{ margin: 0 }}>
                  Кликните карточку слева — она выделится. Здесь появится кнопка одной публикации.
                </p>
              ) : (
                <>
                  <div className="mw-admin-candidate-actions-bar">
                    <button
                      type="button"
                      className="mw-admin-btn"
                      onClick={() => void handleApproveAndPublish()}
                      disabled={busyAction !== "" || selected.status === "published"}
                    >
                      {busyAction === "approve-and-publish"
                        ? "Публикуем…"
                        : selected.status === "published"
                          ? "Уже опубликовано"
                          : "Одобрить и опубликовать на сайте"}
                    </button>
                    <button type="button" className="mw-admin-btn mw-admin-btn--ghost" onClick={() => void handleReject()} disabled={busyAction !== ""}>
                      {busyAction === "reject" ? "Отклоняем…" : "Отклонить"}
                    </button>
                  </div>
                  <p className="mw-admin-caption">
                    Одна кнопка = одобрение кандидата + программа + статус <strong>published</strong> (сайт и Telegram при
                    первом переходе). Перед этим откройте ссылку источника.
                  </p>

                  {(() => {
                    const href = resolveSourceHref(selected);
                    return href ? (
                      <p>
                        <a className="mw-admin-external-link" href={href} target="_blank" rel="noreferrer">
                          Источник для перепроверки ↗
                        </a>
                      </p>
                    ) : null;
                  })()}

                  <p>
                    <strong>{selected.normalizedItem.title || "Без названия"}</strong>
                  </p>
                  <p className="mw-admin-caption">
                    {selected.normalizedItem.discipline || "—"} ·{" "}
                    {selected.normalizedItem.region || selected.normalizedItem.country || "—"}
                  </p>
                  <p>
                    <strong>Даты:</strong> {formatDate(selected.normalizedItem.startDate)} →{" "}
                    {formatDate(selected.normalizedItem.endDate)}
                  </p>
                  <p>
                    <strong>Организатор:</strong> {selected.normalizedItem.organizerName || "—"}
                  </p>
                  {(() => {
                    const mediaUrls = collectPreviewMediaUrls(selected);
                    if (mediaUrls.length === 0) {
                      return <p className="mw-admin-caption">Медиа в источнике не найдено (или ещё не загружено).</p>;
                    }
                    return (
                      <div style={{ marginBottom: 12 }}>
                        <strong>Медиа источника ({mediaUrls.length})</strong>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
                            gap: 8,
                            marginTop: 8,
                          }}
                        >
                          {mediaUrls.map((url) => {
                            const isVideo = /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
                            const displayUrl = presentAdminMediaUrl(url);
                            return isVideo ? (
                              <a key={url} href={displayUrl} target="_blank" rel="noreferrer" className="mw-admin-caption">
                                Видео ↗
                              </a>
                            ) : (
                              <a key={url} href={displayUrl} target="_blank" rel="noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={displayUrl}
                                  alt=""
                                  style={{ width: "100%", height: 88, objectFit: "cover", borderRadius: 8 }}
                                />
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                  <p style={{ whiteSpace: "pre-wrap" }}>
                    {selected.normalizedItem.descriptionShort || selected.normalizedItem.descriptionFull || "—"}
                  </p>
                  {selected.publishedProgram ? (
                    <p>
                      Программа:{" "}
                      <Link href="/programs">{selected.publishedProgram.program.title}</Link> ·{" "}
                      {selected.publishedProgram.program.publishStatus}
                    </p>
                  ) : null}
                </>
              )}
            </aside>
          </div>
        </>
      )}
    </main>
  );
}
