"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type PlatformPayload = {
  platformMode: string;
  launchMode: boolean;
};

export default function AdminPlatformModePage() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<PlatformPayload | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    setData(null);
    try {
      const res = await fetch(`${API_URL}/metrics/admin/platform-mode`, {
        headers: { Authorization: `Bearer ${token.trim()}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setData(body as PlatformPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mw-container" style={{ paddingTop: 24, paddingBottom: 40 }}>
      <h1 className="mw-h2">Режим платформы (admin)</h1>
      <p className="mw-lead" style={{ maxWidth: 720 }}>
        Данные с API совпадают с публичным <code>/public/platform</code>, но этот экран требует admin JWT — удобно для приёмки без curl.
      </p>
      <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap", marginBottom: 20 }}>
        <label>
          Admin Bearer token
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            style={{ display: "block", minWidth: 320, padding: 8 }}
            placeholder="JWT после POST /auth/login"
            autoComplete="off"
          />
        </label>
        <button onClick={load} disabled={!token.trim() || loading} className="mw-btn mw-btn--primary" type="button">
          {loading ? "Загрузка..." : "Показать"}
        </button>
      </div>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {data && (
        <section className="mw-card">
          <p style={{ margin: 0 }}>
            <strong>platformMode:</strong> {data.platformMode}
          </p>
          <p style={{ margin: "8px 0 0" }}>
            <strong>launchMode:</strong> {data.launchMode ? "да" : "нет"}
          </p>
        </section>
      )}
    </main>
  );
}
