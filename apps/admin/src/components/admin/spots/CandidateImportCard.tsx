"use client";

import { useState } from "react";
import { adminJson } from "../../../lib/admin";
import { AdminMessage } from "../AdminMessage";
import { AdminSectionCard } from "../AdminSectionCard";
import { parseCandidateTable } from "./spotModel";

interface ImportRow {
  index: number;
  name: string | null;
  region?: string;
}

interface ImportResult {
  dryRun: boolean;
  created: Array<{ id: string; name: string }>;
  toCreate: ImportRow[];
  duplicates: Array<ImportRow & { reason: "exists" | "repeated_in_batch" }>;
  errors: Array<ImportRow & { error: string }>;
}

const PLACEHOLDER = [
  "Вставьте таблицу из Google Sheets/Excel (или строки через «;»).",
  "Колонки: Название, Регион, Координаты, Адрес, Водоём — заголовок необязателен.",
  "",
  "Название\tРегион\tКоординаты\tВодоём",
  "Wake Park\tМосковская область\t55.751244, 37.618423\tозеро",
].join("\n");

export function CandidateImportCard({ onImported }: { onImported: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const parsed = parseCandidateTable(text);

  const send = async (dryRun: boolean) => {
    setError("");
    setBusy(true);
    try {
      const data = await adminJson<ImportResult>("/spots/import", {
        method: "POST",
        body: JSON.stringify({ items: parsed.items, dryRun }),
      });
      setResult(data);
      if (!dryRun) {
        setText("");
        await onImported();
      }
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const canSend = !busy && parsed.items.length > 0 && parsed.errors.length === 0;

  return (
    <AdminSectionCard title="Импорт кандидатов">
      <div className="mw-admin-stack-8">
        <p className="mw-admin-caption">
          Кандидаты — это места без рейтинга и вне публичного каталога. Уже существующие споты (то же название и
          регион) пропускаются. Если хоть одна строка с ошибкой, не создаётся ничего.
        </p>
        <textarea
          className="mw-admin-input"
          rows={8}
          placeholder={PLACEHOLDER}
          value={text}
          onChange={(e) => { setText(e.target.value); setResult(null); }}
          style={{ width: "100%", fontFamily: "monospace" }}
        />
        {text.trim() ? (
          <p className="mw-admin-caption">Строк распознано: {parsed.items.length}</p>
        ) : null}
        {parsed.errors.length > 0 ? (
          <AdminMessage type="error">
            {parsed.errors.slice(0, 10).map((e) => <div key={e}>{e}</div>)}
          </AdminMessage>
        ) : null}
        <AdminMessage type="error">{error}</AdminMessage>
        <div className="mw-admin-inline-form">
          <button type="button" className="mw-admin-btn mw-admin-btn--ghost" disabled={!canSend} onClick={() => void send(true)}>
            Проверить
          </button>
          <button
            type="button"
            className="mw-admin-btn"
            disabled={!canSend || !result?.dryRun || result.toCreate.length === 0}
            onClick={() => void send(false)}
          >
            {busy ? "Импортируем..." : `Импортировать${result?.dryRun ? ` (${result.toCreate.length})` : ""}`}
          </button>
        </div>
        {result ? (
          <div className="mw-admin-stack-6">
            {result.dryRun ? (
              <AdminMessage type="success">
                {`Будет создано: ${result.toCreate.length}. Пропущено как дубли: ${result.duplicates.length}.`}
              </AdminMessage>
            ) : (
              <AdminMessage type="success">
                {`Создано кандидатов: ${result.created.length}. Пропущено как дубли: ${result.duplicates.length}.`}
              </AdminMessage>
            )}
            {result.duplicates.length > 0 ? (
              <p className="mw-admin-caption">
                Дубли:{" "}
                {result.duplicates
                  .map((d) => `${d.name} (${d.region}) — ${d.reason === "exists" ? "уже есть" : "повтор в таблице"}`)
                  .join("; ")}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </AdminSectionCard>
  );
}
