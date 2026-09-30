"use client";

import { useState } from "react";
import { getMediaTypeLabel } from "@mywave/shared-types";
import { adminJson } from "../../../lib/admin";
import {
  PROGRAM_CARD_TEXT_FIELDS,
  cardDraftFromProgram,
  cardFieldOrigin,
  cardPatchFromDraft,
  reorderMediaIds,
  type Program,
  type ProgramCardDraft,
} from "./programModel";
import { ProgramOrganizerRow } from "./ProgramOrganizerRow";

const WEB_BASE = (process.env.NEXT_PUBLIC_WEB_URL ?? "").replace(/\/+$/, "");
/** Совпадает с MEDIA_UPLOAD_MAX_BYTES в API и client_max_body_size в nginx. */
const UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
const UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/webm";

function previewUrl(url: string): string {
  return url.startsWith("/") ? `${WEB_BASE}${url}` : url;
}

function pickText(draft: ProgramCardDraft, key: string): Partial<ProgramCardDraft> {
  return key in draft ? { [key]: draft[key as keyof ProgramCardDraft] } : {};
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
  const [reordering, setReordering] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [enriching, setEnriching] = useState(false);
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

  const handleEnrich = async () => {
    if (dirty && !window.confirm("Несохранённые правки будут потеряны. Продолжить автозаполнение?")) return;
    setEnriching(true);
    try {
      const res = await adminJson<{ outcome: { status: string; fields?: string[]; reason?: string }; program: Program | null }>(
        `/programs/${program.id}/enrich`,
        { method: "POST" },
      );
      if (res.program) setDraft(cardDraftFromProgram(res.program));
      const { outcome } = res;
      if (outcome.status === "failed") {
        onError(`ИИ не ответил (${outcome.reason}). Проверьте ключ OpenAI и прокси на сервере.`);
        return;
      }
      await onChanged(
        outcome.status === "enriched"
          ? `ИИ заполнил поля: ${outcome.fields?.length ? outcome.fields.join(", ") : "нет новых данных в посте"}. Поля с ручными правками не тронуты.`
          : `Автозаполнение пропущено: ${outcome.reason === "no_source_text" ? "нет текста исходного поста" : outcome.reason}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось выполнить автозаполнение";
      onError(
        message.includes("card_enrichment_disabled")
          ? "ИИ-автозаполнение выключено на сервере (нужны AI_ENABLED, AI_CARD_ENRICH_ENABLED и OPENAI_API_KEY)."
          : message,
      );
    } finally {
      setEnriching(false);
    }
  };

  const handleRelease = async (key: string) => {
    try {
      const updated = await adminJson<Program>(`/programs/${program.id}`, {
        method: "PATCH",
        body: JSON.stringify({ releaseManualFields: [key] }),
      });
      setDraft((d) => ({ ...d, ...pickText(cardDraftFromProgram(updated), key) }));
      await onChanged("Поле снова обновляется из источника и ИИ-автозаполнением.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Не удалось снять ручную правку");
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

  const handleUpload = async (files: FileList | null) => {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    const tooBig = list.find((file) => file.size > UPLOAD_MAX_BYTES);
    if (tooBig) {
      onError(`Файл «${tooBig.name}» больше 25 МБ — сожмите его перед загрузкой.`);
      return;
    }
    setUploading(true);
    let uploaded = 0;
    try {
      for (const file of list) {
        await adminJson(`/programs/${program.id}/media/upload`, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        uploaded += 1;
      }
      await onChanged(`Загружено файлов: ${uploaded}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось загрузить файл";
      onError(uploaded ? `Загружено ${uploaded} из ${list.length}. ${message}` : message);
      if (uploaded) await onChanged(`Загружено файлов: ${uploaded}.`);
    } finally {
      setUploading(false);
    }
  };

  const handleMoveMedia = async (from: number, to: number, message: string) => {
    setReordering(true);
    try {
      await adminJson(`/programs/${program.id}/media/order`, {
        method: "PUT",
        body: JSON.stringify({ mediaIds: reorderMediaIds(program.media, from, to) }),
      });
      await onChanged(message);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Не удалось изменить порядок медиа");
    } finally {
      setReordering(false);
    }
  };

  return (
    <div className="mw-admin-stack-8" style={{ padding: "12px 4px" }}>
      <ProgramOrganizerRow program={program} onChanged={onChanged} onError={onError} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {PROGRAM_CARD_TEXT_FIELDS.map(({ key, label, multiline }) => (
          <label key={key} className="mw-admin-stack-6">
            <span className="mw-admin-caption">
              {label}
              {cardFieldOrigin(program, key) === "manual" ? (
                <>
                  {" · ручная правка "}
                  <button
                    type="button"
                    className="mw-admin-btn mw-admin-btn--ghost"
                    style={{ padding: "0 6px", fontSize: 12 }}
                    title="Разрешить сбору из источника и ИИ снова обновлять это поле"
                    onClick={(e) => {
                      e.preventDefault();
                      void handleRelease(key);
                    }}
                  >
                    снять
                  </button>
                </>
              ) : cardFieldOrigin(program, key) === "ai" ? (
                " · заполнено ИИ по посту"
              ) : null}
            </span>
            {multiline ? (
              <textarea
                className="mw-admin-input"
                rows={4}
                placeholder="Организатор не указал — на сайте будет серое «Примечание MyWave»"
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
        <button
          type="button"
          className="mw-admin-btn mw-admin-btn--ghost"
          onClick={handleEnrich}
          disabled={saving || enriching}
          title="Заполнить название, «для кого», включено/не включено и снаряжение по исходному посту. Ручные правки не трогаются."
        >
          {enriching ? "ИИ заполняет..." : "Автозаполнить (ИИ)"}
        </button>
      </div>

      <div className="mw-admin-caption">
        Медиа карточки ({program.media.length}). Первое — обложка на витрине и в Telegram. Новое медиа (файлом или полем
        «Ссылка на медиа» в строке таблицы) встаёт в конец.
      </div>
      <label className="mw-admin-inline-form">
        <span className="mw-admin-caption">{uploading ? "Загружаем..." : "Загрузить файлы (JPEG, PNG, WebP, MP4, WebM, до 25 МБ):"}</span>
        <input
          type="file"
          accept={UPLOAD_ACCEPT}
          multiple
          disabled={uploading}
          onChange={(e) => {
            void handleUpload(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {program.media.map((media, index) => (
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
              {index === 0 ? <strong>Обложка · </strong> : null}
              {getMediaTypeLabel(media.mediaType)}
              {media.url.startsWith("/ingestion-media/") ? " · на нашем сервере" : " · внешняя ссылка"}
            </span>
            <div className="mw-admin-inline-form">
              <button
                type="button"
                className="mw-admin-btn mw-admin-btn--ghost"
                onClick={() => handleMoveMedia(index, index - 1, "Порядок медиа обновлён.")}
                disabled={reordering || index === 0}
                aria-label="Переместить левее"
              >
                ←
              </button>
              <button
                type="button"
                className="mw-admin-btn mw-admin-btn--ghost"
                onClick={() => handleMoveMedia(index, index + 1, "Порядок медиа обновлён.")}
                disabled={reordering || index === program.media.length - 1}
                aria-label="Переместить правее"
              >
                →
              </button>
            </div>
            {index > 0 && media.mediaType === "image" ? (
              <button
                type="button"
                className="mw-admin-btn mw-admin-btn--ghost"
                onClick={() => handleMoveMedia(index, 0, "Обложка карточки изменена.")}
                disabled={reordering}
              >
                Сделать обложкой
              </button>
            ) : null}
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
