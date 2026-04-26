"use client";

import { AdminSectionCard } from "../AdminSectionCard";
import type { LinkageBackfillReport, LinkageBackfillSummary, OrganizerOption } from "./sourceTypes";
import { LINKAGE_KPI_KEYS, LINKAGE_ROWS_PREVIEW } from "./sourceTypes";

type Props = {
  organizers: OrganizerOption[];
  linkageOrgScope: string;
  onLinkageOrgScope: (v: string) => void;
  linkageReport: LinkageBackfillReport | null;
  linkageLoading: boolean;
  onDryRun: () => void;
  onApply: () => void;
};

export function SourceLinkageBackfillCard({
  organizers,
  linkageOrgScope,
  onLinkageOrgScope,
  linkageReport,
  linkageLoading,
  onDryRun,
  onApply,
}: Props) {
  return (
    <AdminSectionCard title="PR2 — привязка внешнего канала (meta → externalChannelId)" className="mw-admin-section-warn">
      <p className="mw-admin-prose-block">
        Сначала всегда выполняйте <strong>проверку (dry-run)</strong> с телом <code>{`{ "mode": "dry_run" }`}</code>. Запись{" "}
        <strong>применения (apply)</strong> возможна только при <code>SOURCES_LINKAGE_BACKFILL_WRITE_ENABLED=1</code> на API; иначе
        ответ: <code>403 apply_disabled</code>.
      </p>
      <div className="mw-admin-toolbar">
        <div className="mw-admin-filters-bar__field">
          <label>Организатор (пусто = все с null FK)</label>
          <select className="mw-admin-input" value={linkageOrgScope} onChange={(e) => onLinkageOrgScope(e.target.value)}>
            <option value="">Все организаторы</option>
            {organizers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.displayName}
              </option>
            ))}
          </select>
        </div>
        <div className="mw-admin-toolbar__actions">
          <button type="button" className="mw-admin-btn" onClick={() => void onDryRun()} disabled={linkageLoading}>
            {linkageLoading ? "Запрос…" : "Проверка (dry-run)"}
          </button>
          <button type="button" className="mw-admin-btn mw-admin-btn--emphasis" onClick={() => void onApply()} disabled={linkageLoading}>
            Применить привязку
          </button>
        </div>
      </div>
      {linkageReport ? (
        <div>
          <p className="mw-admin-muted mw-admin-mb-8">
            Режим ответа: <code>{linkageReport.mode}</code> · запись на сервере разрешена: <strong>{linkageReport.writeEnabled ? "да" : "нет"}</strong>
            {linkageReport.organizerScope ? (
              <>
                {" "}
                · scope: <code>{linkageReport.organizerScope}</code>
              </>
            ) : null}
            {typeof linkageReport.appliedCount === "number" ? (
              <>
                {" "}
                · применено: <strong>{linkageReport.appliedCount}</strong>
              </>
            ) : null}
          </p>
          <div className="mw-admin-kpi-grid">
            {LINKAGE_KPI_KEYS.map(([key, label]) => (
              <div key={key} className="mw-admin-kpi">
                <div className="mw-admin-kpi__label">{label}</div>
                <div className="mw-admin-kpi__value">{linkageReport.summary[key as keyof LinkageBackfillSummary]}</div>
              </div>
            ))}
          </div>
          <h3 className="mw-admin-filters-bar__title">Строки отчёта (сокращённо)</h3>
          <p className="mw-admin-muted mw-admin-mt-0">
            Показано не более {LINKAGE_ROWS_PREVIEW} из {linkageReport.rows.length}. Полный список — в JSON ответа API или повторный
            dry-run с фильтром по организатору.
          </p>
          <div className="mw-admin-mini-table-wrap">
            <table className="mw-admin-table mw-admin-table--pr2">
              <thead>
                <tr>
                  <th className="mw-admin-td-nowrap">Статус</th>
                  <th className="mw-admin-td-nowrap">ID источника</th>
                  <th className="mw-admin-td-nowrap">Канал (meta)</th>
                  <th className="mw-admin-td-nowrap">Предлагаемый ID</th>
                  <th>Детали</th>
                </tr>
              </thead>
              <tbody>
                {linkageReport.rows.slice(0, LINKAGE_ROWS_PREVIEW).map((row) => (
                  <tr key={row.sourceId}>
                    <td className="mw-admin-td-nowrap">{row.status}</td>
                    <td className="mw-admin-td-mono">{row.sourceId}</td>
                    <td className="mw-admin-td-mono">{row.metaChannelId ?? "—"}</td>
                    <td className="mw-admin-td-mono">{row.proposedExternalChannelId ?? "—"}</td>
                    <td className="mw-admin-td-wrap">{row.detail ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </AdminSectionCard>
  );
}
