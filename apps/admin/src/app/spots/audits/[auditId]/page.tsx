"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { adminFetch, adminJson, getAdminToken } from "../../../../lib/admin";
import { AdminMessage, AdminPageHeader, AdminSectionCard, AdminStatusBadge } from "../../../../components/admin";
import { SpotSnapshotsTable } from "../../../../components/admin/spots/SpotSnapshotsTable";
import {
  AUDIT_STATUS_LABEL,
  GATE_STATUS_LABEL,
  SPOT_CATEGORIES,
  SPOT_GATES,
  auditReadiness,
  criterionLabel,
  reviewerLabel,
  type GateStatus,
} from "../../../../components/admin/spots/spotModel";
import type { ReviewersResponse, SpotAuditDetail } from "../../../../components/admin/spots/spotTypes";

const EVIDENCE_MAX_BYTES = 25 * 1024 * 1024;

type MetaForm = {
  testedAt: string;
  notes: string;
  externalExpertConfirmed: boolean;
  externalExpertName: string;
  independentEditorUserId: string;
};

function toMeta(a: SpotAuditDetail): MetaForm {
  return {
    testedAt: a.testedAt.slice(0, 10),
    notes: a.notes ?? "",
    externalExpertConfirmed: a.externalExpertConfirmed,
    externalExpertName: a.externalExpertName ?? "",
    independentEditorUserId: a.independentEditorUserId ?? "",
  };
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

export default function SpotAuditPage() {
  const params = useParams();
  const auditId = typeof params?.auditId === "string" ? params.auditId : "";
  const [audit, setAudit] = useState<SpotAuditDetail | null>(null);
  const [meta, setMeta] = useState<MetaForm | null>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [gates, setGates] = useState<Record<string, GateStatus>>({});
  const [evidenceCriterion, setEvidenceCriterion] = useState("");
  const [evidenceCapturedAt, setEvidenceCapturedAt] = useState("");
  const [evidenceGenerated, setEvidenceGenerated] = useState(false);
  const [remediation, setRemediation] = useState({ evidenceId: "", rationale: "", verified: false });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewers, setReviewers] = useState<ReviewersResponse>({ items: [], currentUserId: null });

  useEffect(() => {
    if (!getAdminToken()) return;
    adminJson<ReviewersResponse>("/spots/reviewers").then(setReviewers).catch(() => undefined);
  }, []);

  const reviewerName = (id: string) => {
    const user = reviewers.items.find((u) => u.id === id);
    return user ? reviewerLabel(user) : id;
  };

  const load = useCallback(async () => {
    try {
      const data = await adminJson<SpotAuditDetail>(`/spots/audits/${auditId}`);
      setAudit(data);
      setMeta(toMeta(data));
      setScores(Object.fromEntries(data.categoryScores.map((s) => [s.category, String(Number(s.score))])));
      setGates(Object.fromEntries(SPOT_GATES.map((g) => [
        g.id,
        (data.gateResults.find((r) => r.gateId === g.id)?.status ?? "unknown") as GateStatus,
      ])));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [auditId]);

  useEffect(() => {
    if (!getAdminToken()) {
      window.location.href = "/login";
      return;
    }
    if (auditId) void load();
  }, [auditId, load]);

  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setSuccess("");
    try {
      await action();
      setSuccess(message);
      setError("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!audit || !meta) {
    return (
      <main className="mw-admin-page">
        <AdminMessage type="error">{error}</AdminMessage>
        {!error ? <p className="mw-admin-caption">Загрузка...</p> : null}
      </main>
    );
  }

  const isDraft = audit.status === "draft";
  const canAddEvidence = audit.status === "draft" || audit.status === "submitted";
  const isSigned = audit.status === "signed";
  const readiness = auditReadiness(audit, audit.unit.spot.relatedToMyWave);

  const post = (path: string, body: unknown = {}) =>
    adminJson(`/spots/audits/${audit.id}/${path}`, { method: "POST", body: JSON.stringify(body) });

  const saveMeta = () =>
    run(
      () => adminJson(`/spots/audits/${audit.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          testedAt: new Date(`${meta.testedAt}T12:00:00Z`).toISOString(),
          notes: meta.notes || null,
          externalExpertConfirmed: meta.externalExpertConfirmed,
          externalExpertName: meta.externalExpertName || null,
          independentEditorUserId: meta.independentEditorUserId.trim() || null,
        }),
      }),
      "Данные аудита сохранены.",
    );

  const saveScores = () => {
    const payload: Record<string, number> = {};
    for (const c of SPOT_CATEGORIES) {
      const raw = (scores[c.id] ?? "").replace(",", ".").trim();
      if (raw) payload[c.id] = Number(raw);
    }
    if (Object.keys(payload).length === 0) {
      setError("Заполните хотя бы одну оценку.");
      return;
    }
    void run(
      () => adminJson(`/spots/audits/${audit.id}/scores`, { method: "PUT", body: JSON.stringify({ scores: payload }) }),
      "Оценки сохранены.",
    );
  };

  const saveGates = () =>
    run(
      () => adminJson(`/spots/audits/${audit.id}/gates`, { method: "PUT", body: JSON.stringify({ gates }) }),
      "Гейты сохранены.",
    );

  const changeStatus = (path: "submit" | "reopen" | "sign" | "void") => {
    let body: Record<string, unknown> = {};
    if (path === "sign" && !window.confirm("Подписать аудит как эксперт? После подписи оценки и доказательства менять нельзя.")) return;
    if (path === "void") {
      const reason = window.prompt("Причина аннулирования:");
      if (!reason?.trim()) return;
      body = { reason: reason.trim() };
    }
    const labels = { submit: "Аудит отправлен на подпись.", reopen: "Аудит возвращён в черновик.", sign: "Аудит подписан.", void: "Аудит аннулирован." };
    void run(() => post(path, body), labels[path]);
  };

  const uploadEvidence = async (files: FileList | null) => {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    const tooBig = list.find((f) => f.size > EVIDENCE_MAX_BYTES);
    if (tooBig) {
      setError(`Файл «${tooBig.name}» больше 25 МБ.`);
      return;
    }
    const query = new URLSearchParams();
    if (evidenceCriterion) query.set("criterion", evidenceCriterion);
    if (evidenceCapturedAt) query.set("capturedAt", new Date(`${evidenceCapturedAt}T12:00:00Z`).toISOString());
    if (evidenceGenerated) query.set("generated", "1");
    await run(async () => {
      for (const file of list) {
        await adminJson(`/spots/audits/${audit.id}/evidence?${query.toString()}`, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
      }
    }, `Загружено файлов: ${list.length}.`);
  };

  const openEvidence = async (evidenceId: string) => {
    try {
      const res = await adminFetch(`/spots/evidence/${evidenceId}/file`);
      if (!res.ok) throw new Error(`Файл не открылся: ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const authenticEvidence = audit.evidence.filter((e) => !e.isGenerated);

  return (
    <main className="mw-admin-page">
      <AdminPageHeader
        title={`Аудит: ${audit.unit.spot.name} — ${audit.unit.serviceName}`}
        description={
          <>
            <Link href={`/spots/${audit.unit.spot.id}`}>← К споту</Link> · тест {new Date(audit.testedAt).toLocaleDateString("ru-RU")} ·
            методика {audit.methodologyVersion}, протокол {audit.protocolVersion}
          </>
        }
        actions={
          <AdminStatusBadge tone={isSigned ? "ok" : audit.status === "void" ? "danger" : "muted"}>
            {AUDIT_STATUS_LABEL[audit.status] ?? audit.status}
          </AdminStatusBadge>
        }
      />
      <AdminMessage type="error">{error}</AdminMessage>
      <AdminMessage type="success">{success}</AdminMessage>

      <AdminSectionCard title="Готовность к публикации">
        <ul style={{ margin: "0 0 12px", paddingLeft: 0, listStyle: "none" }}>
          {readiness.map((item) => (
            <li key={item.label} style={{ color: item.ok ? "#166534" : "#92400e" }}>
              {item.ok ? "✓" : "•"} {item.label}
            </li>
          ))}
        </ul>
        <div className="mw-admin-inline-form">
          {isDraft ? <button type="button" className="mw-admin-btn" disabled={busy} onClick={() => changeStatus("submit")}>Отправить на подпись</button> : null}
          {audit.status === "submitted" ? (
            <>
              <button type="button" className="mw-admin-btn" disabled={busy} onClick={() => changeStatus("sign")}>Подписать как эксперт</button>
              <button type="button" className="mw-admin-btn mw-admin-btn--ghost" disabled={busy} onClick={() => changeStatus("reopen")}>Вернуть в черновик</button>
            </>
          ) : null}
          {audit.status !== "void" ? (
            <button type="button" className="mw-admin-btn mw-admin-btn--ghost" disabled={busy} onClick={() => changeStatus("void")}>Аннулировать</button>
          ) : null}
        </div>
      </AdminSectionCard>

      <AdminSectionCard title="Оценки по категориям (0–10, шаг 0.1)">
        <div className="mw-admin-inline-form" style={{ alignItems: "flex-end" }}>
          {SPOT_CATEGORIES.map((c) => (
            <label key={c.id} className="mw-admin-stack-6">
              <span className="mw-admin-caption">{c.label} · {c.weight}%</span>
              <input
                className="mw-admin-input"
                inputMode="decimal"
                style={{ width: 120 }}
                disabled={!isDraft}
                value={scores[c.id] ?? ""}
                onChange={(e) => setScores({ ...scores, [c.id]: e.target.value })}
              />
            </label>
          ))}
          {isDraft ? <button type="button" className="mw-admin-btn" disabled={busy} onClick={saveScores}>Сохранить оценки</button> : null}
        </div>
      </AdminSectionCard>

      <AdminSectionCard title="Обязательные гейты">
        <div className="mw-admin-inline-form" style={{ alignItems: "flex-end" }}>
          {SPOT_GATES.map((g) => (
            <label key={g.id} className="mw-admin-stack-6">
              <span className="mw-admin-caption">{g.id} {g.label}</span>
              <select
                className="mw-admin-input"
                disabled={!isDraft}
                value={gates[g.id] ?? "unknown"}
                onChange={(e) => setGates({ ...gates, [g.id]: e.target.value as GateStatus })}
              >
                {(Object.keys(GATE_STATUS_LABEL) as GateStatus[]).map((s) => <option key={s} value={s}>{GATE_STATUS_LABEL[s]}</option>)}
              </select>
            </label>
          ))}
          {isDraft ? <button type="button" className="mw-admin-btn" disabled={busy} onClick={() => void saveGates()}>Сохранить гейты</button> : null}
        </div>
      </AdminSectionCard>

      <AdminSectionCard title="Эксперт и редактор">
        <div className="mw-admin-stack-8">
          <p className="mw-admin-caption" style={{ margin: 0 }}>
            Эксперт: {audit.expertUserId ? `${reviewerName(audit.expertUserId)}, подпись ${audit.expertSignedAt ? new Date(audit.expertSignedAt).toLocaleString("ru-RU") : "—"}` : "ещё не подписан"}
          </p>
          <div className="mw-admin-inline-form">
            <label className="mw-admin-stack-6">
              <span className="mw-admin-caption">Дата теста</span>
              <input type="date" className="mw-admin-input" disabled={!isDraft} value={meta.testedAt} onChange={(e) => setMeta({ ...meta, testedAt: e.target.value })} />
            </label>
            <label className="mw-admin-stack-6">
              <span className="mw-admin-caption">Внешний эксперт (имя)</span>
              <input className="mw-admin-input" disabled={!isDraft} value={meta.externalExpertName} onChange={(e) => setMeta({ ...meta, externalExpertName: e.target.value })} />
            </label>
            <label className="mw-admin-inline-form">
              <input type="checkbox" disabled={!isDraft} checked={meta.externalExpertConfirmed} onChange={(e) => setMeta({ ...meta, externalExpertConfirmed: e.target.checked })} />
              <span className="mw-admin-caption">Внешний эксперт подтвердил результаты</span>
            </label>
            <label className="mw-admin-stack-6">
              <span className="mw-admin-caption">Независимый редактор (админ, не эксперт)</span>
              <select
                className="mw-admin-input"
                disabled={!isDraft}
                value={meta.independentEditorUserId}
                onChange={(e) => setMeta({ ...meta, independentEditorUserId: e.target.value })}
              >
                <option value="">Не назначен</option>
                {meta.independentEditorUserId && !reviewers.items.some((u) => u.id === meta.independentEditorUserId) ? (
                  <option value={meta.independentEditorUserId}>{meta.independentEditorUserId}</option>
                ) : null}
                {reviewers.items.map((u) => (
                  <option key={u.id} value={u.id}>
                    {reviewerLabel(u)}{u.id === reviewers.currentUserId ? " — это вы" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {meta.independentEditorUserId && meta.independentEditorUserId === (audit.expertUserId ?? reviewers.currentUserId) ? (
            <AdminMessage type="error">
              Редактор совпадает с экспертом{audit.expertUserId ? "" : " (подписывать аудит будете вы)"}: независимой проверки не будет, а для спотов, связанных с MyWave, публикация заблокирована.
            </AdminMessage>
          ) : null}
          <label className="mw-admin-stack-6">
            <span className="mw-admin-caption">Заметки</span>
            <textarea className="mw-admin-input" rows={3} disabled={!isDraft} value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} />
          </label>
          {isDraft ? <div><button type="button" className="mw-admin-btn" disabled={busy} onClick={() => void saveMeta()}>Сохранить</button></div> : null}
        </div>
      </AdminSectionCard>

      <AdminSectionCard title="Доказательства (закрытое хранилище)">
        {canAddEvidence ? (
          <div className="mw-admin-inline-form" style={{ marginBottom: 12 }}>
            <select className="mw-admin-input" value={evidenceCriterion} onChange={(e) => setEvidenceCriterion(e.target.value)}>
              <option value="">Критерий: общее</option>
              {SPOT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              {SPOT_GATES.map((g) => <option key={g.id} value={g.id}>{g.id} {g.label}</option>)}
            </select>
            <label className="mw-admin-inline-form">
              <span className="mw-admin-caption">Снято:</span>
              <input type="date" className="mw-admin-input" value={evidenceCapturedAt} onChange={(e) => setEvidenceCapturedAt(e.target.value)} />
            </label>
            <label className="mw-admin-inline-form">
              <input type="checkbox" checked={evidenceGenerated} onChange={(e) => setEvidenceGenerated(e.target.checked)} />
              <span className="mw-admin-caption">Сгенерировано ИИ (не засчитывается)</span>
            </label>
            <label className="mw-admin-inline-form">
              <span className="mw-admin-caption">{busy ? "Загружаем..." : "Файлы (JPEG, PNG, WebP, MP4, WebM, PDF, до 25 МБ):"}</span>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,application/pdf"
                disabled={busy}
                onChange={(e) => { void uploadEvidence(e.target.files); e.target.value = ""; }}
              />
            </label>
          </div>
        ) : (
          <p className="mw-admin-caption">Аудит подписан или аннулирован: новые доказательства не принимаются.</p>
        )}
        {audit.evidence.length === 0 ? <p className="mw-admin-caption">Доказательств пока нет.</p> : (
          <div className="mw-admin-table-outer">
            <table className="mw-admin-table">
              <thead>
                <tr>
                  <th align="left">Критерий</th>
                  <th align="left">Файл</th>
                  <th align="left">Снято</th>
                  <th align="left">Целостность</th>
                  <th align="left" />
                </tr>
              </thead>
              <tbody>
                {audit.evidence.map((e) => (
                  <tr key={e.id}>
                    <td>{criterionLabel(e.criterion)}</td>
                    <td>
                      {e.kind} · {formatSize(e.sizeBytes)}
                      {e.isGenerated ? <div><AdminStatusBadge tone="danger">ИИ</AdminStatusBadge></div> : null}
                      <div className="mw-admin-caption" title={e.sha256}>sha256 {e.sha256.slice(0, 12)}…</div>
                    </td>
                    <td>{e.capturedAt ? new Date(e.capturedAt).toLocaleDateString("ru-RU") : "—"}</td>
                    <td>
                      {e.integrityConfirmedAt
                        ? <AdminStatusBadge tone="ok">Подтверждена</AdminStatusBadge>
                        : <AdminStatusBadge tone="warn">Не подтверждена</AdminStatusBadge>}
                    </td>
                    <td>
                      <div className="mw-admin-inline-form">
                        <button type="button" className="mw-admin-btn mw-admin-btn--ghost" onClick={() => void openEvidence(e.id)}>Открыть</button>
                        {!e.integrityConfirmedAt && !e.isGenerated && audit.status !== "void" ? (
                          <button
                            type="button"
                            className="mw-admin-btn mw-admin-btn--ghost"
                            disabled={busy}
                            onClick={() => void run(
                              () => adminJson(`/spots/evidence/${e.id}/confirm-integrity`, { method: "POST", body: "{}" }),
                              "Целостность подтверждена.",
                            )}
                          >
                            Подтвердить целостность
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSectionCard>

      {isSigned ? (
        <AdminSectionCard title="Удалённое исправление G05 «Горячий душ»">
          <p className="mw-admin-caption" style={{ marginTop: 0 }}>
            По методике v1.1 после теста удалённо можно закрыть только G05 — по доказательству работающей горячей воды.
          </p>
          <div className="mw-admin-stack-8">
            <div className="mw-admin-inline-form">
              <select className="mw-admin-input" value={remediation.evidenceId} onChange={(e) => setRemediation({ ...remediation, evidenceId: e.target.value })}>
                <option value="">Доказательство…</option>
                {authenticEvidence.map((e) => (
                  <option key={e.id} value={e.id}>{criterionLabel(e.criterion)} · {e.kind} · {e.sha256.slice(0, 8)}</option>
                ))}
              </select>
              <label className="mw-admin-inline-form">
                <input type="checkbox" checked={remediation.verified} onChange={(e) => setRemediation({ ...remediation, verified: e.target.checked })} />
                <span className="mw-admin-caption">Я проверил: горячая вода работает</span>
              </label>
            </div>
            <textarea
              className="mw-admin-input"
              rows={2}
              placeholder="Обоснование решения"
              value={remediation.rationale}
              onChange={(e) => setRemediation({ ...remediation, rationale: e.target.value })}
            />
            <div>
              <button
                type="button"
                className="mw-admin-btn"
                disabled={busy || !remediation.evidenceId}
                onClick={() => void run(
                  () => post("remediations/g05", {
                    evidenceId: remediation.evidenceId,
                    rationale: remediation.rationale,
                    verifiedWorkingHotWater: remediation.verified,
                  }),
                  "Решение по G05 записано.",
                )}
              >
                Записать решение
              </button>
            </div>
            {audit.remediations.length ? (
              <ul>
                {audit.remediations.map((r) => (
                  <li key={r.id}>
                    {new Date(r.decidedAt).toLocaleDateString("ru-RU")}: {r.accepted ? "принято" : `отклонено (${r.reasons.join(", ")})`} — {r.rationale || "без обоснования"}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </AdminSectionCard>
      ) : null}

      <AdminSectionCard title="Снимки рейтинга">
        {isSigned && audit.methodology ? (
          <div className="mw-admin-inline-form" style={{ marginBottom: 12 }}>
            <span className="mw-admin-caption">
              Методика {audit.methodology.id}, версия рейтинга {audit.methodology.ratingVersion}:{" "}
              {audit.methodology.status === "approved" ? "утверждена" : "не утверждена — снимок будет без балла"}
            </span>
            <button
              type="button"
              className="mw-admin-btn"
              disabled={busy}
              onClick={() => void run(() => post("snapshots"), "Снимок рассчитан.")}
            >
              Рассчитать снимок
            </button>
          </div>
        ) : isSigned ? (
          <p className="mw-admin-caption">Аудит создан до закрепления методики — для снимка нужен новый аудит.</p>
        ) : (
          <p className="mw-admin-caption">Снимок рассчитывается только из подписанного аудита.</p>
        )}
        <SpotSnapshotsTable
          snapshots={audit.snapshots}
          onChanged={async (message) => { setSuccess(message); await load(); }}
          onError={setError}
        />
      </AdminSectionCard>
    </main>
  );
}
