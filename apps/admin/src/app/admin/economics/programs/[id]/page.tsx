"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AdminNav } from "../../../../../components/AdminNav";
import { adminJson, getAdminToken } from "../../../../../lib/admin";

const PROGRAM_MODES = ["force_full", "force_soft", "force_hard", "force_suspend"] as const;

type EffectivePayload = {
  ok: true;
  program_id: string;
  title: string;
  raw_auto: Record<string, unknown>;
  manual_override: {
    mode: string | null;
    reason: string | null;
    until: string | null;
    updated_at: string | null;
    active: boolean;
  };
  effective: { multiplier_bps: number; suspended: boolean; override_active: boolean };
  why: string;
  applied_rule: string;
  effective_multiplier_bps: number;
  effective_quality_flag: null;
  grant_or_apply_blocked: boolean;
  source_of_truth: string;
};

type PreviewPayload = {
  ok: true;
  dry_run: true;
  current: {
    effective_multiplier_bps: number;
    effective_suspended: boolean;
    effective: { multiplierBps: number; suspended: boolean; overrideActive: boolean };
    explanation: { grant_or_apply_blocked: boolean };
  };
  after_override: {
    effective_multiplier_bps: number;
    effective_suspended: boolean;
    effective: { multiplierBps: number; suspended: boolean; overrideActive: boolean };
    explanation: { grant_or_apply_blocked: boolean };
  };
  comparison: {
    multiplier_before: number;
    multiplier_after: number;
    grant_or_apply_blocked_before: boolean;
    grant_or_apply_blocked_after: boolean;
  };
};

type ClearPayload = {
  ok: true;
  old_effective: { multiplierBps: number; suspended: boolean; overrideActive: boolean };
  new_effective: { multiplierBps: number; suspended: boolean; overrideActive: boolean };
  recomputed: unknown;
};

export default function EconomicsProgramPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const [eff, setEff] = useState<EffectivePayload | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [clearOut, setClearOut] = useState<ClearPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [previewOk, setPreviewOk] = useState(false);

  const [mode, setMode] = useState<string>("force_soft");
  const [reason, setReason] = useState("");
  const [untilLocal, setUntilLocal] = useState("");
  const [indefinite, setIndefinite] = useState(false);

  const loadEffective = useCallback(async () => {
    setError("");
    const data = await adminJson<EffectivePayload>(`/admin/economics/programs/${encodeURIComponent(id)}/effective`);
    setEff(data);
    setClearOut(null);
  }, [id]);

  useEffect(() => {
    if (!getAdminToken()) {
      window.location.href = "/login";
      return;
    }
    if (!id) return;
    setLoading(true);
    loadEffective()
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [id, loadEffective]);

  useEffect(() => {
    setPreviewOk(false);
    setPreview(null);
  }, [mode, reason, untilLocal, indefinite]);

  /** Временный override требует дату «до», если не отмечен бессрочный. */
  const untilMissing = !indefinite && !untilLocal.trim();
  const applyBlocked = untilMissing || !reason.trim() || !previewOk;

  function buildBody() {
    const untilIso =
      indefinite || !untilLocal
        ? undefined
        : untilLocal.includes("T")
          ? new Date(untilLocal).toISOString()
          : new Date(`${untilLocal}:00`).toISOString();
    return {
      mode,
      reason: reason.trim() || undefined,
      until: indefinite ? null : untilIso,
      indefinite,
    };
  }

  async function doPreview() {
    if (untilMissing) {
      setError("Укажите дату окончания или включите бессрочный override.");
      return;
    }
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const body = buildBody();
      const p = await adminJson<PreviewPayload>(`/admin/economics/programs/${encodeURIComponent(id)}/override/preview`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setPreview(p);
      setPreviewOk(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doApply() {
    if (untilMissing) {
      setError("Укажите дату окончания или бессрочный override.");
      return;
    }
    if (!reason.trim()) {
      setError("Укажите reason для применения override.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const untilIso =
        indefinite || !untilLocal
          ? undefined
          : untilLocal.includes("T")
            ? new Date(untilLocal).toISOString()
            : new Date(`${untilLocal}:00`).toISOString();
      await adminJson(`/admin/economics/programs/${encodeURIComponent(id)}/override`, {
        method: "POST",
        body: JSON.stringify({
          mode,
          reason: reason.trim(),
          until: indefinite ? null : untilIso,
          indefinite,
        }),
      });
      setPreviewOk(false);
      setPreview(null);
      await loadEffective();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doClear() {
    if (!window.confirm("Снять ручной override и пересчитать авто-economics для этой программы?")) return;
    setBusy(true);
    setError("");
    try {
      const out = await adminJson<ClearPayload>(`/admin/economics/programs/${encodeURIComponent(id)}/override`, {
        method: "DELETE",
      });
      setClearOut(out);
      setPreview(null);
      setPreviewOk(false);
      await loadEffective();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p style={{ padding: 24 }}>Загрузка…</p>;
  if (!eff) {
    return (
      <main style={{ padding: 24 }}>
        <p style={{ color: "red" }}>{error || "Нет данных"}</p>
        <Link href="/admin/economics">← К обзору</Link>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 900 }}>
      <AdminNav current="/admin/economics" />
      <p>
        <Link href="/admin/economics">← Economics · обзор</Link>
      </p>
      <h1>
        Economics · программа <span style={{ fontFamily: "monospace" }}>{eff.title}</span>
      </h1>
      <p style={{ marginTop: 8 }}>
        <Link href={`/admin/conversion-drafts?programId=${encodeURIComponent(id)}`}>Conversion drafts по этой программе</Link>
      </p>
      <p style={{ fontSize: 13, color: "#666" }}>ID: {eff.program_id}</p>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <section style={{ border: "1px solid #ccc", padding: 16, borderRadius: 8, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Текущее effective</h2>
        <p>
          <strong>Множитель:</strong> {eff.effective.multiplier_bps} bps · <strong>suspend:</strong>{" "}
          {eff.effective.suspended ? "да" : "нет"} · <strong>override активен:</strong>{" "}
          {eff.effective.override_active ? "да" : "нет"}
        </p>
        <p>
          <strong>Grant/apply:</strong> {eff.grant_or_apply_blocked ? "заблокировано" : "разрешено"}
        </p>
        <p>
          <strong>Источник:</strong> {eff.source_of_truth}
        </p>
        <p>
          <strong>Почему:</strong> {eff.why}
        </p>
        <p>
          <strong>Правило:</strong> <code>{eff.applied_rule}</code>
        </p>
        <details>
          <summary>raw auto</summary>
          <pre style={{ fontSize: 12, overflow: "auto" }}>{JSON.stringify(eff.raw_auto, null, 2)}</pre>
        </details>
        <details>
          <summary>manual override</summary>
          <pre style={{ fontSize: 12, overflow: "auto" }}>{JSON.stringify(eff.manual_override, null, 2)}</pre>
        </details>
      </section>

      {clearOut && (
        <section style={{ border: "1px solid #080", padding: 16, borderRadius: 8, marginBottom: 20, background: "#f6fff6" }}>
          <h3 style={{ marginTop: 0 }}>После снятия override (recompute)</h3>
          <p>
            Было: {clearOut.old_effective.multiplierBps} bps · suspend {clearOut.old_effective.suspended ? "да" : "нет"}
          </p>
          <p>
            Стало: {clearOut.new_effective.multiplierBps} bps · suspend {clearOut.new_effective.suspended ? "да" : "нет"}
          </p>
          <details>
            <summary>recomputed payload</summary>
            <pre style={{ fontSize: 12 }}>{JSON.stringify(clearOut.recomputed, null, 2)}</pre>
          </details>
        </section>
      )}

      <section style={{ border: "1px solid #ccc", padding: 16, borderRadius: 8 }}>
        <h2 style={{ marginTop: 0 }}>Новый override</h2>
        <p style={{ fontSize: 13, color: "#444", marginTop: 0, maxWidth: 640 }}>
          <strong>Временный override:</strong> задайте дату «действует до» (локальное время).{" "}
          <strong>Бессрочный</strong> — только как исключение по политике (согласование с ops).
        </p>
        <label style={{ display: "block", marginBottom: 8 }}>
          Режим
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            style={{ marginLeft: 8, padding: 4 }}
            disabled={busy}
          >
            {PROGRAM_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "block", marginBottom: 8 }}>
          Reason (обязателен при применении)
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            style={{ display: "block", width: "100%", marginTop: 4 }}
            disabled={busy}
          />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <input type="checkbox" checked={indefinite} onChange={(e) => setIndefinite(e.target.checked)} disabled={busy} />
          Бессрочный override (исключительно; требует согласованной политики)
        </label>
        {!indefinite && (
          <label style={{ display: "block", marginBottom: 8 }}>
            Действует до (локальное время)
            <input
              type="datetime-local"
              value={untilLocal}
              onChange={(e) => setUntilLocal(e.target.value)}
              style={{ display: "block", marginTop: 4, ...(untilMissing ? { outline: "2px solid #b42318", outlineOffset: 2 } : {}) }}
              disabled={busy}
            />
          </label>
        )}
        {untilMissing && (
          <p style={{ color: "#b42318", fontSize: 13, marginBottom: 8 }}>Укажите дату окончания или отметьте бессрочный override.</p>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => void doPreview()} disabled={busy || untilMissing}>
            {busy ? "…" : "Предпросмотр"}
          </button>
          <button type="button" onClick={() => void doApply()} disabled={busy || applyBlocked}>
            Применить override
          </button>
          <button type="button" onClick={() => void doClear()} disabled={busy || !eff.manual_override.active}>
            Снять override
          </button>
        </div>
        {!previewOk && !untilMissing && (
          <p style={{ fontSize: 13, color: "#666" }}>Сначала «Предпросмотр», затем «Применить» (нужен reason).</p>
        )}

        {preview && (
          <div style={{ marginTop: 16, padding: 14, background: "#f0f7ff", border: "1px solid #8ab4d8", borderRadius: 8 }}>
            <h3 style={{ marginTop: 0 }}>Результат предпросмотра</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              <div style={{ padding: 10, background: "#fff", borderRadius: 6, border: "1px solid #ddd" }}>
                <div style={{ fontSize: 12, color: "#666" }}>Сейчас · множитель (effective)</div>
                <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "ui-monospace, monospace" }}>
                  {preview.comparison.multiplier_before} bps
                </div>
                <div style={{ fontSize: 13, marginTop: 6 }}>
                  Grant/apply:{" "}
                  <strong>{preview.comparison.grant_or_apply_blocked_before ? "заблокировано" : "разрешено"}</strong>
                </div>
              </div>
              <div style={{ padding: 10, background: "#fff", borderRadius: 6, border: "2px solid #1a5f2a" }}>
                <div style={{ fontSize: 12, color: "#1a5f2a" }}>После override · множитель</div>
                <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "ui-monospace, monospace", color: "#145a22" }}>
                  {preview.comparison.multiplier_after} bps
                </div>
                <div style={{ fontSize: 13, marginTop: 6 }}>
                  Grant/apply:{" "}
                  <strong>{preview.comparison.grant_or_apply_blocked_after ? "заблокировано" : "разрешено"}</strong>
                </div>
              </div>
            </div>
            <p style={{ fontSize: 13, marginBottom: 0, marginTop: 12 }}>
              Срок: {indefinite ? "бессрочно (exceptional)" : new Date(untilLocal.includes("T") ? untilLocal : `${untilLocal}:00`).toLocaleString("ru-RU")}
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
