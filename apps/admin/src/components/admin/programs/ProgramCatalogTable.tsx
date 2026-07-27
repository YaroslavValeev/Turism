"use client";

import type { Dispatch, SetStateAction } from "react";
import Link from "next/link";
import {
  PROGRAM_INTAKE_SOURCES,
  PROGRAM_PUBLISH_STATUSES,
  getMediaTypeLabel,
  getProgramIntakeSourceLabel,
  getProgramPublishStatusLabel,
  isPilotProgramScope,
} from "@mywave/shared-types";
import { AdminStatusBadge } from "../AdminStatusBadge";
import {
  EMPTY_MEDIA_DRAFT,
  type AvailabilityDraft,
  type MediaDraft,
  type Program,
  type ProgramScoreSnap,
  type SpotlightDraft,
  programBandLabel,
  programBandPillClass,
  programBreakdown,
  moderationPriorityLabel,
  programHints,
} from "./programModel";

const WEB_BASE = (process.env.NEXT_PUBLIC_WEB_URL ?? "").replace(/\/+$/, "");

type Props = {
  programs: Program[];
  programScores: Record<string, ProgramScoreSnap>;
  mediaDrafts: Record<string, MediaDraft>;
  setMediaDrafts: Dispatch<SetStateAction<Record<string, MediaDraft>>>;
  statusDrafts: Record<string, string>;
  setStatusDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  intakeDrafts: Record<string, string>;
  setIntakeDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  availabilityDrafts: Record<string, AvailabilityDraft>;
  setAvailabilityDrafts: Dispatch<SetStateAction<Record<string, AvailabilityDraft>>>;
  spotlightDrafts: Record<string, SpotlightDraft>;
  setSpotlightDrafts: Dispatch<SetStateAction<Record<string, SpotlightDraft>>>;
  savingStatusId: string | null;
  savingMediaId: string | null;
  savingIntakeId: string | null;
  savingAvailabilityId: string | null;
  savingSpotlightId: string | null;
  onSaveStatus: (programId: string) => void;
  onSaveIntake: (programId: string) => void;
  onAddMedia: (programId: string) => void;
  onSaveAvailability: (programId: string) => void;
  onSaveSpotlight: (programId: string) => void;
};

function publishStatusTone(s: string): "ok" | "warn" | "danger" | "muted" {
  if (s === "published") return "ok";
  if (s === "draft" || s === "ready_for_review") return "warn";
  if (s === "archived" || s === "rejected") return "danger";
  return "muted";
}

export function ProgramCatalogTable({
  programs,
  programScores,
  mediaDrafts,
  setMediaDrafts,
  statusDrafts,
  setStatusDrafts,
  intakeDrafts,
  setIntakeDrafts,
  availabilityDrafts,
  setAvailabilityDrafts,
  spotlightDrafts,
  setSpotlightDrafts,
  savingStatusId,
  savingMediaId,
  savingIntakeId,
  savingAvailabilityId,
  savingSpotlightId,
  onSaveStatus,
  onSaveIntake,
  onAddMedia,
  onSaveAvailability,
  onSaveSpotlight,
}: Props) {
  return (
    <table className="mw-admin-table mw-admin-table--programs">
      <colgroup>
        <col style={{ width: "280px" }} />
        <col style={{ width: "200px" }} />
        <col style={{ width: "260px" }} />
        <col style={{ width: "180px" }} />
        <col style={{ width: "260px" }} />
        <col style={{ width: "240px" }} />
        <col style={{ width: "220px" }} />
        <col style={{ width: "170px" }} />
        <col style={{ width: "90px" }} />
        <col style={{ width: "170px" }} />
        <col style={{ width: "320px" }} />
      </colgroup>
      <thead>
        <tr>
          <th>Название</th>
          <th>Статус публикации</th>
          <th>Оценка (внутр.)</th>
          <th>Фокус</th>
          <th>Горячее предложение</th>
          <th>Наличие</th>
          <th>Источник (intake)</th>
          <th>Даты</th>
          <th>Медиа</th>
          <th>Приоритет модерации</th>
          <th>Действия</th>
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
          const bandClass = programBandPillClass(score?.scoreBand);
          const hints = programHints(program, score);
          const priorityLabel = moderationPriorityLabel(score);
          return (
            <tr key={program.id}>
              <td className="mw-admin-program-td">
                <strong>
                  {program.isStarred ? "⭐ " : ""}
                  {program.title}
                </strong>
                <div className="mw-admin-caption">{program.organizer?.displayName ?? "—"} · {program.discipline}</div>
              </td>
              <td className="mw-admin-program-td">
                <div className="mw-admin-mb-8">
                  <AdminStatusBadge tone={publishStatusTone(program.publishStatus)}>
                    {getProgramPublishStatusLabel(program.publishStatus)}
                  </AdminStatusBadge>
                </div>
                <select
                  className="mw-admin-input mw-admin-input--fill"
                  value={statusDrafts[program.id] ?? program.publishStatus}
                  onChange={(e) => setStatusDrafts((c) => ({ ...c, [program.id]: e.target.value }))}
                >
                  {PROGRAM_PUBLISH_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {getProgramPublishStatusLabel(status)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="mw-admin-btn mw-admin-btn--ghost mw-admin-mt-8"
                  onClick={() => onSaveStatus(program.id)}
                  disabled={savingStatusId === program.id || (statusDrafts[program.id] ?? program.publishStatus) === program.publishStatus}
                >
                  {savingStatusId === program.id ? "Сохраняем..." : "Сохранить статус"}
                </button>
              </td>
              <td className="mw-admin-program-td mw-admin-program-td--score">
                {score ? `${score.totalProgramScore.toFixed(1)} (${score.scoreBand})` : "—"}
                <div className="mw-admin-mt-4">
                  <span className={`mw-admin-pill ${bandClass}`}>{programBandLabel(score?.scoreBand)}</span>
                </div>
                <div className="mw-admin-hint-block">{programBreakdown(score)}</div>
                {hints.length > 0 ? (
                  <ul className="mw-admin-hint-list">
                    {hints.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                ) : null}
              </td>
              <td className="mw-admin-program-td">
                <span className={isPilot ? "mw-admin-focal-ok" : "mw-admin-focal-warn"}>
                  {program.region} {isPilot ? "· основной фокус" : "· подготовка"}
                </span>
              </td>
              <td className="mw-admin-program-td mw-admin-program-td--tight">
                <div
                  className={`mw-admin-mb-6 ${
                    program.isStarred || spotlightDraft.isStarred ? "mw-admin-caption mw-admin-caption--spotlight" : "mw-admin-caption"
                  }`}
                >
                  {program.isStarred
                    ? "Витрина активна: программа участвует в блоке горячих предложений."
                    : "Обычный показ без выделения."}
                </div>
                <label className="mw-admin-inline-form mw-admin-mb-8">
                  <input
                    type="checkbox"
                    checked={spotlightDraft.isStarred}
                    onChange={(e) =>
                      setSpotlightDrafts((c) => ({
                        ...c,
                        [program.id]: { isStarred: e.target.checked },
                      }))
                    }
                  />
                  ⭐ Выделить звёздочкой
                </label>
                <button
                  type="button"
                  className="mw-admin-btn mw-admin-btn--ghost"
                  onClick={() => onSaveSpotlight(program.id)}
                  disabled={savingSpotlightId === program.id || !spotlightDirty}
                >
                  {savingSpotlightId === program.id ? "Сохраняем..." : "Сохранить витрину"}
                </button>
              </td>
              <td className="mw-admin-program-td mw-admin-program-td--tight">
                <div className="mw-admin-caption mw-admin-mb-6">
                  {isPast
                    ? "Скрыта на сайте: даты завершились"
                    : isFull
                      ? "Скрыта на сайте: мест не осталось"
                      : isPubliclyVisible
                        ? "Видна на сайте"
                        : "Не видна на сайте"}
                </div>
                <div className="mw-admin-stack-6">
                  <input
                    className="mw-admin-input"
                    type="number"
                    min="0"
                    value={availabilityDraft.capacityTotal}
                    onChange={(e) =>
                      setAvailabilityDrafts((c) => ({
                        ...c,
                        [program.id]: { ...availabilityDraft, capacityTotal: e.target.value },
                      }))
                    }
                    placeholder="Лимит мест"
                  />
                  <input
                    className="mw-admin-input"
                    type="number"
                    min="0"
                    value={availabilityDraft.spotsAvailable}
                    onChange={(e) =>
                      setAvailabilityDrafts((c) => ({
                        ...c,
                        [program.id]: { ...availabilityDraft, spotsAvailable: e.target.value },
                      }))
                    }
                    placeholder="Мест осталось"
                  />
                  <button
                    type="button"
                    className="mw-admin-btn mw-admin-btn--ghost"
                    onClick={() => onSaveAvailability(program.id)}
                    disabled={savingAvailabilityId === program.id || !availabilityDirty}
                  >
                    {savingAvailabilityId === program.id ? "Сохраняем..." : "Сохранить наличие"}
                  </button>
                </div>
              </td>
              <td className="mw-admin-program-td mw-admin-program-td--tight">
                <div className="mw-admin-caption mw-admin-mb-4">
                  {getProgramIntakeSourceLabel(program.intakeSource)}
                </div>
                <select
                  className="mw-admin-input mw-admin-input--fill"
                  value={intakeDrafts[program.id] ?? program.intakeSource ?? ""}
                  onChange={(e) => setIntakeDrafts((c) => ({ ...c, [program.id]: e.target.value }))}
                >
                  <option value="">Не задан</option>
                  {PROGRAM_INTAKE_SOURCES.map((code) => (
                    <option key={code} value={code}>
                      {getProgramIntakeSourceLabel(code)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="mw-admin-btn mw-admin-btn--ghost mw-admin-mt-8"
                  onClick={() => onSaveIntake(program.id)}
                  disabled={
                    savingIntakeId === program.id
                    || (intakeDrafts[program.id] ?? program.intakeSource ?? "") === (program.intakeSource ?? "")
                  }
                >
                  {savingIntakeId === program.id ? "Сохраняем..." : "Сохранить источник"}
                </button>
              </td>
              <td className="mw-admin-program-td">
                {new Date(program.startDate).toLocaleDateString("ru-RU")} – {new Date(program.endDate).toLocaleDateString("ru-RU")}
              </td>
              <td className="mw-admin-program-td">{Array.isArray(program.media) ? program.media.length : 0}</td>
              <td className="mw-admin-program-td">
                <AdminStatusBadge
                  tone={
                    priorityLabel.startsWith("P1")
                      ? "danger"
                      : priorityLabel.startsWith("P2")
                        ? "warn"
                        : "muted"
                  }
                >
                  {priorityLabel}
                </AdminStatusBadge>
              </td>
              <td className="mw-admin-program-td mw-admin-program-td--actions">
                <div className="mw-admin-stack-8">
                  <input
                    className="mw-admin-input"
                    value={mediaDraft.url}
                    onChange={(e) => setMediaDrafts((c) => ({ ...c, [program.id]: { ...mediaDraft, url: e.target.value } }))}
                    placeholder="Ссылка на медиа"
                  />
                  <input
                    className="mw-admin-input"
                    value={mediaDraft.caption}
                    onChange={(e) => setMediaDrafts((c) => ({ ...c, [program.id]: { ...mediaDraft, caption: e.target.value } }))}
                    placeholder="Подпись"
                  />
                  <div className="mw-admin-inline-form">
                    <select
                      className="mw-admin-input"
                      value={mediaDraft.mediaType}
                      onChange={(e) => setMediaDrafts((c) => ({ ...c, [program.id]: { ...mediaDraft, mediaType: e.target.value } }))}
                    >
                      <option value="image">{getMediaTypeLabel("image")}</option>
                      <option value="video">{getMediaTypeLabel("video")}</option>
                    </select>
                    <button
                      type="button"
                      className="mw-admin-btn mw-admin-btn--ghost"
                      onClick={() => onAddMedia(program.id)}
                      disabled={savingMediaId === program.id || !mediaDraft.url.trim()}
                    >
                      {savingMediaId === program.id ? "Добавляем..." : "Добавить медиа"}
                    </button>
                  </div>
                  {isPubliclyVisible && WEB_BASE ? (
                    <Link className="mw-admin-external-link" href={`${WEB_BASE}/program/${program.id}`} target="_blank" rel="noreferrer">
                      Открыть карточку на сайте
                    </Link>
                  ) : null}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
