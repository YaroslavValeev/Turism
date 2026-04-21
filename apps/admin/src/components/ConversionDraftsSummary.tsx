"use client";

import Link from "next/link";
import type { ConversionDraftsStats } from "./conversionDraftsStatsTypes";

export type { ConversionDraftsStats } from "./conversionDraftsStatsTypes";

type Props = {
  stats: ConversionDraftsStats | null;
  loading: boolean;
  error?: string;
};

export function ConversionDraftsSummary({ stats, loading, error }: Props) {
  if (error) {
    return (
      <p style={{ fontSize: 13, color: "#b42318" }} data-testid="admin-conversion-summary-error">
        Conversion drafts: не удалось загрузить сводку ({error})
      </p>
    );
  }
  if (loading) {
    return <p style={{ fontSize: 13, color: "#666" }}>Загрузка сводки conversion drafts…</p>;
  }
  if (!stats) {
    return null;
  }

  return (
    <section
      data-testid="admin-conversion-summary"
      style={{
        padding: 16,
        marginBottom: 20,
        borderRadius: 8,
        border: "1px solid #ddd",
        background: "rgba(37, 99, 235, 0.06)",
        maxWidth: 720,
      }}
    >
      <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Conversion drafts (очередь owner)</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 14, lineHeight: 1.5 }}>
        <span>
          <strong>Ждут решения:</strong> {stats.awaitingOwner}
        </span>
        <span>
          <strong>Отложено:</strong> {stats.deferred}
        </span>
        <span>
          <strong>Отклонено:</strong> {stats.rejected}
        </span>
        <span>
          <strong>Отправлено сегодня (UTC):</strong> {stats.sentToday}
        </span>
        {stats.ownerNotifyFailed > 0 && (
          <span style={{ color: "#b42318" }}>
            <strong>Ошибка TG owner:</strong> {stats.ownerNotifyFailed}
          </span>
        )}
      </div>
      <p style={{ margin: "12px 0 0", fontSize: 12, color: "#555" }}>
        Сутки UTC с {new Date(stats.sentTodayStartsAt).toLocaleString("ru-RU")}
      </p>
      <p style={{ margin: "12px 0 0" }}>
        <Link href="/admin/conversion-drafts" style={{ fontWeight: 600 }}>
          Открыть conversion drafts →
        </Link>
      </p>
    </section>
  );
}
