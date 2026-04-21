"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { adminFetch, adminJson } from "../../../lib/admin";
import { AdminNav } from "../../../components/AdminNav";
import { DomainStatusTimeline, type DomainStatusEventRow } from "../../../components/DomainStatusTimeline";

type IntakeDetail = {
  id: string;
  intakeType: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  organization: string | null;
  programTitle: string | null;
  discipline: string | null;
  region: string | null;
  plannedDates: string | null;
  message: string | null;
  links: string | null;
  meta: unknown;
  processingStatus: string;
  linkedProgramId: string | null;
  processedAt: string | null;
  processedBy: string | null;
  createdAt: string;
  linkedProgram: { id: string; title: string; publishStatus: string; organizerId: string } | null;
  nextProcessingStatuses?: string[];
};

type OrganizerOption = { id: string; displayName: string; verificationStatus: string };

export default function OrganizerIntakeDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [row, setRow] = useState<IntakeDetail | null>(null);
  const [organizers, setOrganizers] = useState<OrganizerOption[]>([]);
  const [organizerId, setOrganizerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [domainEvents, setDomainEvents] = useState<DomainStatusEventRow[]>([]);
  const [domainEventsLoading, setDomainEventsLoading] = useState(false);
  const [domainEventsError, setDomainEventsError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [intake, orgs] = await Promise.all([
          adminJson<IntakeDetail>(`/admin/organizer-intakes/${encodeURIComponent(id)}`),
          fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/organizers`)
            .then((r) => r.json())
            .then((d) => (Array.isArray(d) ? d : [])) as Promise<OrganizerOption[]>,
        ]);
        if (!cancelled) {
          setRow(intake);
          setOrganizers(orgs);
          if (intake.linkedProgram?.organizerId) setOrganizerId(intake.linkedProgram.organizerId);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ошибка загрузки");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id || !row) return;
    let cancelled = false;
    setDomainEventsLoading(true);
    setDomainEventsError(null);
    adminJson<{ items: DomainStatusEventRow[] }>(
      `/admin/domain-status-events?entity_type=public_organizer_intake&entity_id=${encodeURIComponent(id)}&limit=80`,
    )
      .then((data) => {
        if (!cancelled) setDomainEvents(Array.isArray(data.items) ? data.items : []);
      })
      .catch((e) => {
        if (!cancelled) setDomainEventsError(e instanceof Error ? e.message : "Ошибка загрузки событий");
      })
      .finally(() => {
        if (!cancelled) setDomainEventsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, row?.id, row?.processingStatus]);

  const nextStatuses =
    row?.nextProcessingStatuses != null && row.nextProcessingStatuses.length > 0
      ? row.nextProcessingStatuses
      : row
        ? ["new", "in_review", "dismissed"]
        : [];

  async function patchStatus(status: string, note?: string) {
    if (!id) return;
    setBusy(true);
    setActionMsg("");
    try {
      const updated = await adminJson<IntakeDetail>(`/admin/organizer-intakes/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ processingStatus: status, note }),
      });
      setRow(updated);
      setActionMsg("Статус обновлён.");
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function createDraft() {
    if (!id || !organizerId.trim()) {
      setActionMsg("Выберите организатора.");
      return;
    }
    setBusy(true);
    setActionMsg("");
    try {
      const res = await adminFetch(`/admin/organizer-intakes/${encodeURIComponent(id)}/draft-program`, {
        method: "POST",
        body: JSON.stringify({ organizerId: organizerId.trim() }),
      });
      const data = (await res.json()) as { program?: { id: string }; idempotentReplay?: boolean; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setActionMsg(data.idempotentReplay ? "Черновик уже был создан ранее (идемпотентный ответ)." : "Черновик программы создан.");
      const again = await adminJson<IntakeDetail>(`/admin/organizer-intakes/${encodeURIComponent(id)}`);
      setRow(again);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Ошибка создания черновика");
    } finally {
      setBusy(false);
    }
  }

  const metaJson = row?.meta != null ? JSON.stringify(row.meta, null, 2) : "";

  return (
    <main style={{ padding: 24 }}>
      <AdminNav current="/organizer-intakes" />
      <p>
        <Link href="/organizer-intakes">← К списку intake</Link>
      </p>
      <h1>Заявка организатора</h1>
      {loading && <p>Загрузка…</p>}
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
      {row && (
        <>
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: "1.1rem" }}>Реквизиты</h2>
            <table style={{ borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td style={{ padding: 4, fontWeight: 600 }}>ID</td>
                  <td style={{ padding: 4 }}>
                    <code>{row.id}</code>
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: 4, fontWeight: 600 }}>Тип</td>
                  <td style={{ padding: 4 }}>{row.intakeType}</td>
                </tr>
                <tr>
                  <td style={{ padding: 4, fontWeight: 600 }}>Статус</td>
                  <td style={{ padding: 4 }}>{row.processingStatus}</td>
                </tr>
                <tr>
                  <td style={{ padding: 4, fontWeight: 600 }}>Контакт</td>
                  <td style={{ padding: 4 }}>
                    {row.contactName} · {row.contactEmail}
                    {row.contactPhone ? ` · ${row.contactPhone}` : ""}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: 4, fontWeight: 600 }}>Организация</td>
                  <td style={{ padding: 4 }}>{row.organization ?? "—"}</td>
                </tr>
                <tr>
                  <td style={{ padding: 4, fontWeight: 600 }}>Программа (заголовок)</td>
                  <td style={{ padding: 4 }}>{row.programTitle ?? "—"}</td>
                </tr>
                <tr>
                  <td style={{ padding: 4, fontWeight: 600 }}>Дисциплина / регион</td>
                  <td style={{ padding: 4 }}>
                    {row.discipline ?? "—"} · {row.region ?? "—"}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: 4, fontWeight: 600 }}>Даты (текст)</td>
                  <td style={{ padding: 4 }}>{row.plannedDates ?? "—"}</td>
                </tr>
                <tr>
                  <td style={{ padding: 4, fontWeight: 600, verticalAlign: "top" }}>Связанная программа</td>
                  <td style={{ padding: 4 }}>
                    {row.linkedProgram ? (
                      <div
                        style={{
                          border: "1px solid #cfe8e4",
                          background: "#f0fdf9",
                          borderRadius: 8,
                          padding: 12,
                          maxWidth: 520,
                        }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>{row.linkedProgram.title}</div>
                        <div style={{ fontSize: 13, color: "#444", marginBottom: 4 }}>
                          Статус: <strong>{row.linkedProgram.publishStatus}</strong>
                        </div>
                        <div style={{ fontSize: 12, color: "#666", marginBottom: 12, wordBreak: "break-all" }}>
                          <code>{row.linkedProgram.id}</code>
                        </div>
                        <Link
                          href={`/programs?program=${encodeURIComponent(row.linkedProgram.id)}`}
                          style={{
                            display: "inline-block",
                            padding: "8px 14px",
                            textDecoration: "none",
                            borderRadius: 6,
                            background: "#0d9488",
                            color: "#fff",
                            fontWeight: 600,
                          }}
                        >
                          Открыть программу в админке
                        </Link>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: "1.1rem" }}>Действия оператора</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              <button type="button" disabled={busy || !nextStatuses.includes("in_review")} onClick={() => patchStatus("in_review")}>
                В работу
              </button>
              <button
                type="button"
                disabled={busy || !nextStatuses.includes("dismissed")}
                onClick={() => patchStatus("dismissed", "dismissed_from_admin_ui")}
              >
                Отклонить
              </button>
              <button type="button" disabled={busy || !nextStatuses.includes("new")} onClick={() => patchStatus("new")}>
                Сбросить в «новая»
              </button>
            </div>
            {row.intakeType === "program_submission" && (
              <div style={{ border: "1px solid #ccc", padding: 12, borderRadius: 8, maxWidth: 560 }}>
                <h3 style={{ marginTop: 0 }}>Создать черновик программы</h3>
                <p style={{ color: "#555", fontSize: 14 }}>
                  Доступно только при <code>meta.wizardVersion === 2</code>. Повторный запрос не создаёт дубликат — вернётся существующая
                  программа.
                </p>
                <label>
                  Организатор:{" "}
                  <select value={organizerId} onChange={(e) => setOrganizerId(e.target.value)} style={{ minWidth: 240, padding: 6 }}>
                    <option value="">— выберите —</option>
                    {organizers.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.displayName} ({o.verificationStatus})
                      </option>
                    ))}
                  </select>
                </label>
                <div style={{ marginTop: 12 }}>
                  <button type="button" disabled={busy || !organizerId} onClick={() => void createDraft()}>
                    Создать черновик (draft)
                  </button>
                </div>
              </div>
            )}
            {actionMsg && <p style={{ marginTop: 12, color: actionMsg.startsWith("Ошибка") ? "#b00020" : "#047857" }}>{actionMsg}</p>}
            <DomainStatusTimeline
              title="Доменные статус-события (intake)"
              events={domainEvents}
              loading={domainEventsLoading}
              error={domainEventsError}
            />
          </section>

          {row.links && (
            <section style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: "1.1rem" }}>Ссылки</h2>
              <pre style={{ whiteSpace: "pre-wrap", background: "#f6f6f6", padding: 12 }}>{row.links}</pre>
            </section>
          )}

          {row.message && (
            <section style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: "1.1rem" }}>Сводка / сообщение</h2>
              <pre style={{ whiteSpace: "pre-wrap", background: "#f6f6f6", padding: 12 }}>{row.message}</pre>
            </section>
          )}

          <section>
            <h2 style={{ fontSize: "1.1rem" }}>meta (JSON)</h2>
            <pre style={{ whiteSpace: "pre-wrap", background: "#f6f6f6", padding: 12, maxHeight: 480, overflow: "auto" }}>{metaJson || "—"}</pre>
          </section>
        </>
      )}
    </main>
  );
}
