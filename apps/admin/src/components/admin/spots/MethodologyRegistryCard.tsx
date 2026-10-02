"use client";

import { useCallback, useEffect, useState } from "react";
import { adminJson } from "../../../lib/admin";
import { AdminMessage } from "../AdminMessage";
import { AdminSectionCard } from "../AdminSectionCard";
import { AdminStatusBadge } from "../AdminStatusBadge";
import { METHODOLOGY_STATUS_LABEL, methodologyApproveConfirmText, shortSha } from "./spotModel";
import type { SpotMethodologyRow } from "./spotTypes";

const STATUS_TONE: Record<string, "ok" | "warn" | "muted"> = { approved: "ok", draft: "warn", retired: "muted" };

export function MethodologyRegistryCard() {
  const [rows, setRows] = useState<SpotMethodologyRow[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await adminJson<{ items: SpotMethodologyRow[] }>("/spots/methodologies");
      setRows(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async (m: SpotMethodologyRow) => {
    setError("");
    setSuccess("");
    const text = methodologyApproveConfirmText({ ...m, pinnedAudits: m._count.assessments });
    if (!window.confirm(text)) return;
    setBusyId(m.id);
    try {
      await adminJson(`/spots/methodologies/${encodeURIComponent(m.id)}/approve`, {
        method: "POST",
        body: JSON.stringify({ expectedSha256: m.definitionSha256 }),
      });
      setSuccess(`Методика ${m.id} утверждена.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminSectionCard title="Методики оценки">
      <div className="mw-admin-stack-8">
        <p className="mw-admin-caption">
          Снимок рейтинга публикуется только по утверждённой методике. Черновик можно использовать для пилотных
          аудитов; после первой закреплённой оценки его определение заблокировано — изменения только новой версией.
        </p>
        <AdminMessage type="error">{error}</AdminMessage>
        <AdminMessage type="success">{success}</AdminMessage>
        {rows.length === 0 ? (
          <p className="mw-admin-caption">Методик в реестре нет. Загрузите: pnpm --filter api db:seed:spot-methodology</p>
        ) : (
          <div className="mw-admin-table-outer">
            <table className="mw-admin-table">
              <thead>
                <tr>
                  <th align="left">Методика</th>
                  <th align="left">Дисциплина</th>
                  <th align="left">Версии</th>
                  <th align="left">Статус</th>
                  <th align="left">SHA-256</th>
                  <th align="left">Оценок</th>
                  <th align="left">Утверждена</th>
                  <th align="left" />
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td>{m.id}</td>
                    <td>{m.discipline}</td>
                    <td>
                      {m.methodologyVersion}
                      <div className="mw-admin-caption">
                        протокол {m.protocolVersion}, критерии {m.criteriaVersion}, рейтинг {m.ratingVersion}
                      </div>
                    </td>
                    <td>
                      <AdminStatusBadge tone={STATUS_TONE[m.status] ?? "muted"}>
                        {METHODOLOGY_STATUS_LABEL[m.status] ?? m.status}
                      </AdminStatusBadge>
                    </td>
                    <td title={m.definitionSha256}><code>{shortSha(m.definitionSha256)}</code></td>
                    <td>{m._count.assessments}</td>
                    <td>{m.approvedAt ? new Date(m.approvedAt).toLocaleString("ru-RU") : "—"}</td>
                    <td>
                      {m.status === "draft" ? (
                        <button
                          type="button"
                          className="mw-admin-btn"
                          disabled={busyId !== null}
                          onClick={() => void approve(m)}
                        >
                          {busyId === m.id ? "Утверждаем..." : "Утвердить"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminSectionCard>
  );
}
