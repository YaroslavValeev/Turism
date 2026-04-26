"use client";

import { useMemo, useState } from "react";
import { AdminSectionCard } from "../AdminSectionCard";
import { parseInstagramUrlLines, stripInstagramTrackingAndNormalizeUrl, suggestInstagramSourceName } from "./instagramSourceUtils";

type Props = {
  saving: boolean;
  onAddUrls: (items: { url: string; name: string }[]) => Promise<void>;
};

export function SourceInstagramQuickAddCard({ saving, onAddUrls }: Props) {
  const [text, setText] = useState("");
  const addCount = useMemo(() => new Set(parseInstagramUrlLines(text)).size, [text]);
  const firstPreview = useMemo(() => {
    const first = parseInstagramUrlLines(text)[0];
    return first ? stripInstagramTrackingAndNormalizeUrl(first) : "";
  }, [text]);

  return (
    <AdminSectionCard title="Быстрое добавление: Instagram">
      <p className="mw-admin-hint" style={{ marginTop: 0, marginBottom: 12, fontSize: 14, lineHeight: 1.45 }}>
        Вставьте по одной ссылке на строку (профиль, пост, рил). Параметр <code>igsh=</code> снимается. Профиль — сбор
        ленты; пост/рил — снимок страницы. Полный список источников — в таблице ниже.
      </p>
      <textarea
        className="mw-admin-input"
        style={{ minHeight: 100, width: "100%", maxWidth: "100%", fontFamily: "inherit" }}
        placeholder={`https://www.instagram.com/username\nhttps://www.instagram.com/reel/…`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={saving}
      />
      <p className="mw-admin-hint" style={{ marginTop: 8, marginBottom: 8, fontSize: 13, opacity: 0.9 }}>
        После сохранения можно нажать «Собрать сейчас» в таблице для проверки прогона.
      </p>
      <button
        type="button"
        className="mw-admin-btn"
        disabled={saving}
        onClick={async () => {
          const lines = parseInstagramUrlLines(text);
          if (lines.length === 0) return;
          const seen = new Set<string>();
          const items: { url: string; name: string }[] = [];
          for (const url of lines) {
            if (seen.has(url)) continue;
            seen.add(url);
            items.push({ url, name: suggestInstagramSourceName(url) });
          }
          await onAddUrls(items);
          setText("");
        }}
      >
        {saving ? "Добавляем…" : addCount > 0 ? `Добавить (${addCount})` : "Добавить"}
      </button>
      {firstPreview ? (
        <p className="mw-admin-hint" style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
          Предпросмотр: {firstPreview}
        </p>
      ) : null}
    </AdminSectionCard>
  );
}
