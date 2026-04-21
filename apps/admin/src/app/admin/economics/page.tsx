"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminNav } from "../../../components/AdminNav";
import { adminJson, getAdminToken } from "../../../lib/admin";

function govSeverityColor(severity: string): string {
  if (severity === "critical") return "#b91c1c";
  if (severity === "warning") return "#c2410c";
  return "#64748b";
}

function governanceEntityHref(entityType: string, entityId: string): string | null {
  if (entityType === "program") return `/admin/economics/programs/${entityId}`;
  return null;
}

type GovAlertsDash = {
  active_alerts: Array<{
    id: string;
    fingerprint: string;
    alertType: string;
    severity: string;
    entityType: string;
    entityId: string;
    title: string;
    detail: string | null;
    firstSeenAt: string;
    lastSeenAt: string;
    lastSentAt: string | null;
    lastDigestAt: string | null;
  }>;
  critical_open_count: number;
  last_digest_sent_at: string | null;
};

type GuardrailsDash = {
  enabled: boolean;
  thresholds: Record<string, string | number | boolean>;
  global_discount_guardrail: {
    avgDiscountSharePct: number;
    mode: string;
    valueMultiplierBps: number;
  };
  programs_overridden: Array<{
    id: string;
    title: string;
    reward_multiplier_bps: number;
    economics_override_mode: string | null;
    economics_override_reason: string | null;
    economics_override_until: string | null;
    economics_override_updated_at: string | null;
  }>;
  referrals_overridden: Array<{
    code: string;
    economics_override_mode: string | null;
    economics_override_until: string | null;
  }>;
  programs_limited: Array<{ id: string; title: string; reward_multiplier_bps: number | null }>;
  early_warning: {
    programs_flagged: Array<{ id: string; title: string; early_warning_reason: string | null }>;
    referrals_flagged: Array<{ code: string; early_warning_reason: string | null }>;
  };
};

export default function EconomicsDashboardPage() {
  const router = useRouter();
  const [dash, setDash] = useState<GuardrailsDash | null>(null);
  const [alerts, setAlerts] = useState<GovAlertsDash | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [runMsg, setRunMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [referralJump, setReferralJump] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [gr, ga] = await Promise.allSettled([
        adminJson<GuardrailsDash>("/admin/economics/guardrails"),
        adminJson<GovAlertsDash>("/admin/economics/alerts"),
      ]);
      const parts: string[] = [];
      if (gr.status === "fulfilled") setDash(gr.value);
      else parts.push(gr.reason instanceof Error ? gr.reason.message : String(gr.reason));
      if (ga.status === "fulfilled") setAlerts(ga.value);
      else parts.push("Governance alerts: запрос не удался");
      setError(parts.join(" · "));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getAdminToken()) {
      window.location.href = "/login";
      return;
    }
    void load();
  }, []);

  async function runGuardrails() {
    setBusy(true);
    setRunMsg("");
    try {
      await adminJson("/admin/economics/guardrails/run", { method: "POST", body: JSON.stringify({}) });
      setRunMsg("Прогон guardrails завершён.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p style={{ padding: 24 }}>Загрузка…</p>;
  if (!dash) {
    return (
      <main style={{ padding: 24 }}>
        <p style={{ color: "red" }}>{error || "Нет данных"}</p>
      </main>
    );
  }

  const ewPrograms = dash.early_warning.programs_flagged.length;

  return (
    <main style={{ padding: 24, maxWidth: 1100 }}>
      <AdminNav current="/admin/economics" />
      <h1>Economics · обзор</h1>
      <p style={{ fontSize: 14, color: "#444", maxWidth: 800 }}>
        Сводка guardrails и ручных override. Управление по программе и реферальному коду — отдельные страницы.
      </p>
      <aside
        style={{
          fontSize: 13,
          color: "#333",
          maxWidth: 720,
          marginBottom: 16,
          padding: 12,
          background: "#f8fafc",
          borderLeft: "4px solid #2563eb",
          borderRadius: 4,
        }}
      >
        <strong>Шпаргалка override:</strong> <strong>force_soft</strong> — лёгкое снижение множителя;{" "}
        <strong>force_suspend</strong> — стоп grant/apply по программе (инцидент / договорённость); снимать override,
        когда причина устранена (после clear — сразу recompute). Если срабатывает только early warning и completion в
        норме — чаще <strong>не вмешиваться</strong>, дать job восстановить множитель. Полный ритм (daily/weekly/monthly)
        и таблица сигналов: репозиторий{" "}
        <code style={{ fontSize: 12 }}>docs/operations/OWNER_ECONOMICS_RHYTHM.md</code>. Автоалерты и дайджест:{" "}
        <code style={{ fontSize: 12 }}>docs/operations/GOVERNANCE_ALERTS_V1.md</code>.
      </aside>

      <section style={{ marginBottom: 20, padding: 14, background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Governance alerts</h2>
        {alerts ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
              <div style={{ border: "1px solid #e5e7eb", padding: 10, borderRadius: 6, background: "#fff" }}>
                <div style={{ fontSize: 12, color: "#666" }}>Открытых алертов</div>
                <div style={{ fontSize: 26, fontWeight: 700 }}>{alerts.active_alerts.length}</div>
              </div>
              <div style={{ border: "1px solid #fecaca", padding: 10, borderRadius: 6, background: "#fef2f2" }}>
                <div style={{ fontSize: 12, color: "#991b1b" }}>Critical (open)</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: "#b91c1c" }}>{alerts.critical_open_count}</div>
              </div>
              <div style={{ border: "1px solid #e5e7eb", padding: 10, borderRadius: 6, background: "#fff" }}>
                <div style={{ fontSize: 12, color: "#666" }}>Последний daily digest</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {alerts.last_digest_sent_at
                    ? new Date(alerts.last_digest_sent_at).toLocaleString("ru-RU")
                    : "—"}
                </div>
              </div>
            </div>
            <p style={{ fontSize: 13, color: "#444", marginBottom: 8 }}>
              Список read-only; доставка critical — Telegram и email (см. runbook). Warning — в ежедневном digest на email.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", border: "1px solid #ddd", padding: 6 }}>Severity</th>
                    <th style={{ textAlign: "left", border: "1px solid #ddd", padding: 6 }}>Тип</th>
                    <th style={{ textAlign: "left", border: "1px solid #ddd", padding: 6 }}>Сущность</th>
                    <th style={{ textAlign: "left", border: "1px solid #ddd", padding: 6 }}>Заголовок</th>
                    <th style={{ textAlign: "left", border: "1px solid #ddd", padding: 6 }}>Последнее наблюдение</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.active_alerts.map((a) => {
                    const href = governanceEntityHref(a.entityType, a.entityId);
                    return (
                      <tr key={a.id}>
                        <td style={{ border: "1px solid #ddd", padding: 6, color: govSeverityColor(a.severity), fontWeight: 600 }}>
                          {a.severity}
                        </td>
                        <td style={{ border: "1px solid #ddd", padding: 6, fontFamily: "monospace", fontSize: 12 }}>{a.alertType}</td>
                        <td style={{ border: "1px solid #ddd", padding: 6 }}>
                          {href ? (
                            <Link href={href}>
                              {a.entityType} · {a.entityId}
                            </Link>
                          ) : (
                            `${a.entityType} · ${a.entityId}`
                          )}
                        </td>
                        <td style={{ border: "1px solid #ddd", padding: 6 }}>{a.title}</td>
                        <td style={{ border: "1px solid #ddd", padding: 6, whiteSpace: "nowrap" }}>
                          {new Date(a.lastSeenAt).toLocaleString("ru-RU")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {alerts.active_alerts.length === 0 && <p style={{ color: "#666", marginBottom: 0 }}>Нет открытых алертов.</p>}
          </>
        ) : (
          <p style={{ color: "#92400e", marginBottom: 0 }}>Данные алертов не загружены.</p>
        )}
      </section>

      <form
        style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 16, padding: 12, background: "#f5f5f5", borderRadius: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          const c = referralJump.trim();
          if (!c) return;
          router.push(`/admin/economics/referrals/${encodeURIComponent(c)}`);
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 240px" }}>
          <span style={{ fontSize: 13, whiteSpace: "nowrap" }}>Реферальный код</span>
          <input
            value={referralJump}
            onChange={(e) => setReferralJump(e.target.value)}
            placeholder="например PUBLIC1"
            style={{ flex: 1, minWidth: 120, padding: 6 }}
            autoComplete="off"
          />
        </label>
        <button type="submit" style={{ padding: "6px 12px" }}>
          Открыть economics
        </button>
      </form>

      {error && <p style={{ color: "red" }}>{error}</p>}
      {runMsg && <p style={{ color: "green" }}>{runMsg}</p>}

      <div style={{ marginBottom: 16 }}>
        <button type="button" onClick={() => void runGuardrails()} disabled={busy} style={{ padding: "8px 14px" }}>
          {busy ? "Запуск…" : "Запустить guardrails job"}
        </button>
        <button type="button" onClick={() => void load()} style={{ marginLeft: 8, padding: "8px 14px" }}>
          Обновить
        </button>
      </div>

      <p>
        <strong>Guardrails:</strong> {dash.enabled ? "включены" : "выключены"} ·{" "}
        <strong>Глобальная скидка:</strong> {dash.global_discount_guardrail.mode} (
        {dash.global_discount_guardrail.avgDiscountSharePct}% avg, mult {dash.global_discount_guardrail.valueMultiplierBps}{" "}
        bps)
      </p>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginTop: 20 }}>
        <div style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Programs overridden</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{dash.programs_overridden.length}</div>
        </div>
        <div style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Referrals overridden</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{dash.referrals_overridden.length}</div>
        </div>
        <div style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Programs early warning</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{ewPrograms}</div>
        </div>
        <div style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Programs limited (список guardrails)</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{dash.programs_limited.length}</div>
        </div>
      </section>

      <h2 style={{ marginTop: 32 }}>Активные пороги (env)</h2>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
        <tbody>
          {Object.entries(dash.thresholds).map(([k, v]) => (
            <tr key={k}>
              <td style={{ border: "1px solid #ddd", padding: 6, fontFamily: "monospace" }}>{k}</td>
              <td style={{ border: "1px solid #ddd", padding: 6 }}>{String(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ marginTop: 24 }}>Программы с ручным override</h2>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", border: "1px solid #ddd", padding: 6 }}>Программа</th>
            <th style={{ textAlign: "left", border: "1px solid #ddd", padding: 6 }}>Режим</th>
            <th style={{ textAlign: "left", border: "1px solid #ddd", padding: 6 }}>До</th>
          </tr>
        </thead>
        <tbody>
          {dash.programs_overridden.map((p) => (
            <tr key={p.id}>
              <td style={{ border: "1px solid #ddd", padding: 6 }}>
                <Link href={`/admin/economics/programs/${p.id}`}>{p.title}</Link>
              </td>
              <td style={{ border: "1px solid #ddd", padding: 6 }}>{p.economics_override_mode}</td>
              <td style={{ border: "1px solid #ddd", padding: 6 }}>
                {p.economics_override_until ? new Date(p.economics_override_until).toLocaleString("ru-RU") : "∞"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {dash.programs_overridden.length === 0 && <p style={{ color: "#666" }}>Нет активных override по программам.</p>}

      <h2 style={{ marginTop: 24 }}>Рефералы с ручным override</h2>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", border: "1px solid #ddd", padding: 6 }}>Код</th>
            <th style={{ textAlign: "left", border: "1px solid #ddd", padding: 6 }}>Режим</th>
            <th style={{ textAlign: "left", border: "1px solid #ddd", padding: 6 }}>До</th>
          </tr>
        </thead>
        <tbody>
          {dash.referrals_overridden.map((r) => (
            <tr key={r.code}>
              <td style={{ border: "1px solid #ddd", padding: 6 }}>
                <Link href={`/admin/economics/referrals/${encodeURIComponent(r.code)}`}>{r.code}</Link>
              </td>
              <td style={{ border: "1px solid #ddd", padding: 6 }}>{r.economics_override_mode}</td>
              <td style={{ border: "1px solid #ddd", padding: 6 }}>
                {r.economics_override_until ? new Date(r.economics_override_until).toLocaleString("ru-RU") : "∞"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {dash.referrals_overridden.length === 0 && <p style={{ color: "#666" }}>Нет активных override по рефералам.</p>}

      <h2 style={{ marginTop: 24 }}>Early warning · программы</h2>
      <ul style={{ fontSize: 14 }}>
        {dash.early_warning.programs_flagged.slice(0, 30).map((p) => (
          <li key={p.id}>
            <Link href={`/admin/economics/programs/${p.id}`}>{p.title}</Link>
            {p.early_warning_reason ? ` — ${p.early_warning_reason}` : ""}
          </li>
        ))}
      </ul>
      {dash.early_warning.programs_flagged.length === 0 && <p style={{ color: "#666" }}>Нет флагов EW.</p>}

      <h2 style={{ marginTop: 16 }}>Early warning · рефералы</h2>
      <ul style={{ fontSize: 14 }}>
        {dash.early_warning.referrals_flagged.slice(0, 30).map((r) => (
          <li key={r.code}>
            <Link href={`/admin/economics/referrals/${encodeURIComponent(r.code)}`}>{r.code}</Link>
            {r.early_warning_reason ? ` — ${r.early_warning_reason}` : ""}
          </li>
        ))}
      </ul>
      {dash.early_warning.referrals_flagged.length === 0 && <p style={{ color: "#666" }}>Нет флагов EW.</p>}
    </main>
  );
}
