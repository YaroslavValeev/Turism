"use client";

import { AdminEmptyState } from "../AdminEmptyState";
import type { OrganizerOption, SourceDraft, SourceRecord, SourceRun } from "./sourceTypes";
import { formatDate } from "./sourceTypes";

type Props = {
  sources: SourceRecord[];
  drafts: Record<string, SourceDraft>;
  organizers: OrganizerOption[];
  savingId: string;
  runningId: string;
  onUpdateDraft: (sourceId: string, patch: Partial<SourceDraft>) => void;
  onSave: (sourceId: string) => void;
  onRun: (sourceId: string) => void;
};

function RunBlock({ run }: { run: SourceRun }) {
  return (
    <div className="mw-admin-run">
      <div>
        <strong>{run.runType}</strong> · {run.status}
      </div>
      <div className="mw-admin-run__meta">
        {formatDate(run.startedAt)} → {formatDate(run.finishedAt)}
      </div>
      <div className="mw-admin-run__meta">
        найдено {run.itemsFound} / создано {run.itemsCreated}
      </div>
      {run.errorMessage ? <div className="mw-admin-run__error">{run.errorMessage}</div> : null}
    </div>
  );
}

export function SourcesActiveTable({ sources, drafts, organizers, savingId, runningId, onUpdateDraft, onSave, onRun }: Props) {
  if (sources.length === 0) {
    return (
      <AdminEmptyState
        title="Нет источников по фильтру"
        description="Создайте источник формой выше, смените поиск/фильтр или проверьте доступ к API."
      />
    );
  }

  return (
    <div className="mw-admin-table-outer">
      <table className="mw-admin-table">
        <thead>
          <tr>
            <th align="left">Источник</th>
            <th align="left">Параметры</th>
            <th align="left">Организатор</th>
            <th align="left">Состояние</th>
            <th align="left">Последние запуски</th>
            <th align="left">Действия</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((source) => {
            const draft = drafts[source.id];
            return (
              <tr key={source.id}>
                <td className="mw-admin-cell-stack mw-admin-minw-260">
                  <div>
                    <strong>{source.name}</strong>
                  </div>
                  <div className="mw-admin-subline">{source.urlOrHandle}</div>
                  <div className="mw-admin-mt-8">
                    <select
                      className="mw-admin-input mw-admin-input--fill"
                      value={draft?.type ?? source.type}
                      onChange={(e) => onUpdateDraft(source.id, { type: e.target.value })}
                    >
                      <option value="rss">RSS</option>
                      <option value="telegram">Telegram</option>
                      <option value="instagram">Instagram</option>
                      <option value="site">Сайт</option>
                    </select>
                  </div>
                  <input
                    className="mw-admin-input mw-admin-input--fill mw-admin-mt-8"
                    value={draft?.name ?? source.name}
                    onChange={(e) => onUpdateDraft(source.id, { name: e.target.value })}
                  />
                  <input
                    className="mw-admin-input mw-admin-input--fill mw-admin-mt-8"
                    value={draft?.urlOrHandle ?? source.urlOrHandle}
                    onChange={(e) => onUpdateDraft(source.id, { urlOrHandle: e.target.value })}
                  />
                </td>
                <td className="mw-admin-cell-stack mw-admin-minw-280">
                  <input
                    className="mw-admin-input mw-admin-input--fill mw-admin-mb-8"
                    placeholder="Дисциплина"
                    value={draft?.discipline ?? ""}
                    onChange={(e) => onUpdateDraft(source.id, { discipline: e.target.value })}
                  />
                  <input
                    className="mw-admin-input mw-admin-input--fill mw-admin-mb-8"
                    placeholder="Страна"
                    value={draft?.country ?? ""}
                    onChange={(e) => onUpdateDraft(source.id, { country: e.target.value })}
                  />
                  <input
                    className="mw-admin-input mw-admin-input--fill mw-admin-mb-8"
                    placeholder="Регион"
                    value={draft?.region ?? ""}
                    onChange={(e) => onUpdateDraft(source.id, { region: e.target.value })}
                  />
                  <input
                    className="mw-admin-input mw-admin-input--fill mw-admin-mb-8"
                    placeholder="Язык"
                    value={draft?.language ?? ""}
                    onChange={(e) => onUpdateDraft(source.id, { language: e.target.value })}
                  />
                  <div className="mw-admin-form-grid-2">
                    <input
                      className="mw-admin-input"
                      placeholder="Приоритет"
                      value={draft?.priority ?? ""}
                      onChange={(e) => onUpdateDraft(source.id, { priority: e.target.value })}
                    />
                    <input
                      className="mw-admin-input"
                      placeholder="Доверие (0–100)"
                      value={draft?.trustScore ?? ""}
                      onChange={(e) => onUpdateDraft(source.id, { trustScore: e.target.value })}
                    />
                    <input
                      className="mw-admin-input"
                      placeholder="Профиль парсера"
                      value={draft?.parserProfile ?? ""}
                      onChange={(e) => onUpdateDraft(source.id, { parserProfile: e.target.value })}
                    />
                    <input
                      className="mw-admin-input"
                      placeholder="Интервал, мин"
                      value={draft?.fetchIntervalMinutes ?? ""}
                      onChange={(e) => onUpdateDraft(source.id, { fetchIntervalMinutes: e.target.value })}
                    />
                  </div>
                  <input
                    className="mw-admin-input mw-admin-input--fill mw-admin-mt-8"
                    placeholder="URL картинки по умолчанию"
                    value={draft?.fallbackImageUrl ?? ""}
                    onChange={(e) => onUpdateDraft(source.id, { fallbackImageUrl: e.target.value })}
                  />
                </td>
                <td className="mw-admin-cell-stack mw-admin-minw-220">
                  <select
                    className="mw-admin-input mw-admin-input--fill mw-admin-mb-8"
                    value={draft?.organizerId ?? ""}
                    onChange={(e) => onUpdateDraft(source.id, { organizerId: e.target.value })}
                  >
                    <option value="">Без привязки</option>
                    {organizers.map((organizer) => (
                      <option key={organizer.id} value={organizer.id}>
                        {organizer.displayName}
                      </option>
                    ))}
                  </select>
                  <label className="mw-admin-check-line mw-admin-mt-4">
                    <input
                      type="checkbox"
                      checked={draft?.isActive ?? source.isActive}
                      onChange={(e) => onUpdateDraft(source.id, { isActive: e.target.checked })}
                    />
                    Активен
                  </label>
                  <label className="mw-admin-check-line">
                    <input
                      type="checkbox"
                      checked={draft?.autoPublish ?? false}
                      onChange={(e) => onUpdateDraft(source.id, { autoPublish: e.target.checked })}
                    />
                    Автопубликация
                  </label>
                  <div className="mw-admin-subline mw-admin-mt-8">
                    сырых записей: {source._count.rawItems}
                    <br />
                    последняя проверка: {formatDate(source.lastCheckedAt)}
                    <br />
                    последний успех: {formatDate(source.lastSuccessAt)}
                  </div>
                </td>
                <td className="mw-admin-cell-stack mw-admin-run-list mw-admin-minw-260">
                  {source.runs.length === 0 ? <span className="mw-admin-muted">Запусков ещё не было</span> : source.runs.map((run) => <RunBlock key={run.id} run={run} />)}
                </td>
                <td className="mw-admin-actions-col mw-admin-minw-180">
                  <button type="button" className="mw-admin-btn" onClick={() => void onSave(source.id)} disabled={savingId === source.id}>
                    {savingId === source.id ? "Сохраняем..." : "Сохранить"}
                  </button>
                  <button type="button" className="mw-admin-btn mw-admin-btn--ghost" onClick={() => void onRun(source.id)} disabled={runningId === source.id}>
                    {runningId === source.id ? "Запускаем..." : "Прогнать источник"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
