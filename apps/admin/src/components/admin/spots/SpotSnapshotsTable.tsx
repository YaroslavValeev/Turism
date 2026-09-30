"use client";

import { useState } from "react";
import { adminJson } from "../../../lib/admin";
import { AdminStatusBadge } from "../AdminStatusBadge";
import { BAND_LABEL, blockerLabel } from "./spotModel";
import type { SpotSnapshot } from "./spotTypes";

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("ru-RU") : "—";
}

function snapshotState(s: SpotSnapshot): { label: string; tone: "ok" | "warn" | "muted" | "danger" } {
  if (s.revokedAt) return { label: "Отозван", tone: "danger" };
  if (s.publishedAt) return { label: "Опубликован", tone: "ok" };
  if (!s.publishable) return { label: "Есть блокеры", tone: "warn" };
  return { label: "Готов к публикации", tone: "muted" };
}

export function SpotSnapshotsTable({
  snapshots,
  onChanged,
  onError,
}: {
  snapshots: SpotSnapshot[];
  onChanged: (message: string) => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  if (snapshots.length === 0) return <p className="mw-admin-caption">Снимков рейтинга пока нет.</p>;

  const act = async (snapshot: SpotSnapshot, action: "publish" | "revoke") => {
    let body: string | undefined;
    if (action === "publish") {
      if (!window.confirm(`Опубликовать оценку ${snapshot.officialScore}? Изменить её после публикации будет нельзя, только отозвать.`)) return;
    } else {
      const reason = window.prompt("Причина отзыва (сохранится навсегда):");
      if (!reason?.trim()) return;
      body = JSON.stringify({ reason: reason.trim() });
    }
    setBusyId(snapshot.id);
    try {
      await adminJson(`/spots/snapshots/${snapshot.id}/${action}`, { method: "POST", body: body ?? "{}" });
      await onChanged(action === "publish" ? "Снимок опубликован." : "Снимок отозван.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Действие не выполнено");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mw-admin-table-outer">
      <table className="mw-admin-table">
        <thead>
          <tr>
            <th align="left">Расчёт</th>
            <th align="left">Оценка</th>
            <th align="left">Статус</th>
            <th align="left">Действует до</th>
            <th align="left">Блокеры / причина</th>
            <th align="left" />
          </tr>
        </thead>
        <tbody>
          {snapshots.map((s) => {
            const state = snapshotState(s);
            return (
              <tr key={s.id}>
                <td>
                  {formatDate(s.computedAt)}
                  <div className="mw-admin-caption">{s.ratingVersion}</div>
                </td>
                <td>{s.officialScore != null ? `${Number(s.officialScore).toFixed(1)} · ${BAND_LABEL[s.band ?? ""] ?? s.band}` : "—"}</td>
                <td>
                  <AdminStatusBadge tone={state.tone}>{state.label}</AdminStatusBadge>
                </td>
                <td>{formatDate(s.expiresAt)}</td>
                <td style={{ maxWidth: 360 }}>
                  {s.revokeReason ? s.revokeReason : s.blockers.length ? (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {s.blockers.map((b) => <li key={b}>{blockerLabel(b)}</li>)}
                    </ul>
                  ) : "—"}
                </td>
                <td>
                  <div className="mw-admin-inline-form">
                    {s.publishable && !s.publishedAt && !s.revokedAt ? (
                      <button type="button" className="mw-admin-btn" disabled={busyId === s.id} onClick={() => void act(s, "publish")}>
                        Опубликовать
                      </button>
                    ) : null}
                    {!s.revokedAt ? (
                      <button type="button" className="mw-admin-btn mw-admin-btn--ghost" disabled={busyId === s.id} onClick={() => void act(s, "revoke")}>
                        Отозвать
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
