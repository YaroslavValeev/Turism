"use client";

import { AdminSectionCard } from "../AdminSectionCard";
import type { OrganizerOption, SourceDraft } from "./sourceTypes";

type Props = {
  createDraft: SourceDraft;
  onChange: (patch: Partial<SourceDraft>) => void;
  organizers: OrganizerOption[];
  saving: boolean;
  onCreate: () => void;
};

export function SourceCreateFormCard({ createDraft, onChange, organizers, saving, onCreate }: Props) {
  return (
    <AdminSectionCard title="Добавить источник">
      <div className="mw-admin-form-grid-4">
        <select className="mw-admin-input" value={createDraft.type} onChange={(e) => onChange({ type: e.target.value })}>
          <option value="rss">RSS</option>
          <option value="telegram">Telegram</option>
          <option value="instagram">Instagram</option>
          <option value="site">Сайт</option>
        </select>
        <input
          className="mw-admin-input"
          placeholder="Название"
          value={createDraft.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <input
          className="mw-admin-input"
          placeholder="URL или @handle"
          value={createDraft.urlOrHandle}
          onChange={(e) => onChange({ urlOrHandle: e.target.value })}
        />
        <select className="mw-admin-input" value={createDraft.organizerId} onChange={(e) => onChange({ organizerId: e.target.value })}>
          <option value="">Без привязки к организатору</option>
          {organizers.map((organizer) => (
            <option key={organizer.id} value={organizer.id}>
              {organizer.displayName}
            </option>
          ))}
        </select>
        <input
          className="mw-admin-input"
          placeholder="Дисциплина"
          value={createDraft.discipline}
          onChange={(e) => onChange({ discipline: e.target.value })}
        />
        <input
          className="mw-admin-input"
          placeholder="Страна"
          value={createDraft.country}
          onChange={(e) => onChange({ country: e.target.value })}
        />
        <input
          className="mw-admin-input"
          placeholder="Регион"
          value={createDraft.region}
          onChange={(e) => onChange({ region: e.target.value })}
        />
        <input
          className="mw-admin-input"
          placeholder="Язык"
          value={createDraft.language}
          onChange={(e) => onChange({ language: e.target.value })}
        />
        <input
          className="mw-admin-input"
          placeholder="Приоритет"
          value={createDraft.priority}
          onChange={(e) => onChange({ priority: e.target.value })}
        />
        <input
          className="mw-admin-input"
          placeholder="Доверие (0–100)"
          value={createDraft.trustScore}
          onChange={(e) => onChange({ trustScore: e.target.value })}
        />
        <input
          className="mw-admin-input"
          placeholder="Профиль парсера"
          value={createDraft.parserProfile}
          onChange={(e) => onChange({ parserProfile: e.target.value })}
        />
        <input
          className="mw-admin-input"
          placeholder="Интервал сбора, мин"
          value={createDraft.fetchIntervalMinutes}
          onChange={(e) => onChange({ fetchIntervalMinutes: e.target.value })}
        />
        <input
          className="mw-admin-input mw-admin-form-span-2"
          placeholder="URL картинки по умолчанию"
          value={createDraft.fallbackImageUrl}
          onChange={(e) => onChange({ fallbackImageUrl: e.target.value })}
        />
      </div>
      <label className="mw-admin-check-line">
        <input type="checkbox" checked={createDraft.isActive} onChange={(e) => onChange({ isActive: e.target.checked })} />
        Источник активен
      </label>
      <label className="mw-admin-check-line">
        <input type="checkbox" checked={createDraft.autoPublish} onChange={(e) => onChange({ autoPublish: e.target.checked })} />
        Автопубликация для доверенного источника
      </label>
      <button type="button" className="mw-admin-btn mw-admin-mt-8" onClick={() => void onCreate()} disabled={saving}>
        {saving ? "Создаём..." : "Создать источник"}
      </button>
    </AdminSectionCard>
  );
}
