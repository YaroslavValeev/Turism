"use client";

import { useState } from "react";
import { getMediaTypeLabel } from "@mywave/shared-types";
import { adminJson } from "../../../lib/admin";
import {
  PROGRAM_CARD_TEXT_FIELDS,
  cardDraftFromProgram,
  cardPatchFromDraft,
  type Program,
  type ProgramCardDraft,
} from "./programModel";

const WEB_BASE = (process.env.NEXT_PUBLIC_WEB_URL ?? "").replace(/\/+$/, "");

function previewUrl(url: string): string {
  return url.startsWith("/") ? `${WEB_BASE}${url}` : url;
}

type Props = {
  program: Program;
  onChanged: (message: string) => Promise<void> | void;
  onError: (message: string) => void;
};

export function ProgramCardEditor({ program, onChanged, onError }: Props) {
  const [draft, setDraft] = useState<ProgramCardDraft>(() => cardDraftFromProgram(program));
  const [saving, setSaving] = useState(false);
  const [deletingMediaId, setDeletingMediaId] = useState<string | null>(null);
  const patch = cardPatchFromDraft(program, draft);
  const dirty = Object.keys(patch).length > 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminJson(`/programs/${program.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      await onChanged(`Карточка «${draft.title.trim() || program.title}» сохранена.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Не удалось сохранить карточку");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMedia = async (mediaId: string) => {
    if (!window.confirm("Удалить это медиа из карточки?")) return;
    setDeletingMediaId(mediaId);
    try {
      await adminJson(`/programs/${program.id}/media/${mediaId}`, { method: "DELETE" });
      await onChanged("Медиа удалено из карточки.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Не удалось удалить медиа");
    } finally {
      setDeletingMediaId(null);
    }
  };

  return (
    <div className="mw-admin-stack-8" style={{ padding: "12px 4px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {PROGRAM_CARD_TEXT_FIELDS.map(({ key, label, multiline }) => (
          <label key={key} className="mw-admin-stack-6">
            <span className="mw-admin-caption">{label}</span>
            {multiline ? (
              <textarea
                className="mw-admin-input"
                rows={4}
                value={draft[key]}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              />
            ) : (
              <input
                className="mw-admin-input"
                value={draft[key]}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              />
            )}
          </label>
        ))}
        <div className="mw-admin-stack-6">
          <span className="mw-admin-caption">Даты и длительность (дней)</span>
          <div className="mw-admin-inline-form">
            <input
              className="mw-admin-input"
              type="date"
              value={draft.startDate}
              onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
              aria-label="Дата начала"
            />
            <input
              className="mw-admin-input"
              type="date"
              value={draft.endDate}
              onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
              aria-label="Дата окончания"
            />
            <input
              className="mw-admin-input"
              type="number"
              min="1"
              style={{ width: 80 }}
              value={draft.durationDays}
              onChange={(e) => setDraft((d) => ({ ...d, durationDays: e.target.value }))}
              aria-label="Длительность в днях"
            />
          </div>
        </div>
      </div>

      <div className="mw-admin-inline-form">
        <button type="button" className="mw-admin-btn" onClick={handleSave} disabled={saving || !dirty}>
          {saving ? "Сохраняем..." : "Сохранить карточку"}
        </button>
        <button
          type="button"
          className="mw-admin-btn mw-admin-btn--ghost"
          onClick={() => setDraft(cardDraftFromProgram(program))}
          disabled={saving || !dirty}
        >
          Отменить правки
        </button>
      </div>

      <div className="mw-admin-caption">Медиа карточки ({program.media.length}). Новое медиа — полем «Ссылка на медиа» в строке таблицы.</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {program.media.map((media) => (
          <div key={media.id} className="mw-admin-stack-6" style={{ width: 160 }}>
            {media.mediaType === "video" ? (
              <video src={previewUrl(media.url)} style={{ width: 160, height: 110, objectFit: "cover" }} muted preload="metadata" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl(media.url)}
                alt={media.caption ?? ""}
                referrerPolicy="no-referrer"
                style={{ width: 160, height: 110, objectFit: "cover", background: "#eee" }}
              />
            )}
            <span className="mw-admin-caption">
              {getMediaTypeLabel(media.mediaType)}
              {media.url.startsWith("/ingestion-media/") ? " · на нашем сервере" : " · внешняя ссылка"}
            </span>
            <button
              type="button"
              className="mw-admin-btn mw-admin-btn--ghost"
              onClick={() => handleDeleteMedia(media.id)}
              disabled={deletingMediaId === media.id}
            >
              {deletingMediaId === media.id ? "Удаляем..." : "Удалить"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
