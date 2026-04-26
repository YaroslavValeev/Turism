"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Не удалось войти");
        return;
      }
      if (data.token) {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("admin_token", data.token);
        }
        window.location.href = "/organizers";
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mw-admin-login">
      <div className="mw-admin-login__card" style={{ maxWidth: 400, width: "100%" }}>
        <p style={{ margin: 0, fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--mw-accent)" }}>
          MyWave
        </p>
        <h1 className="mw-admin-login__title">Админ-панель</h1>
        <p className="mw-admin-login__subtitle">
          Вход только для внутренней команды MyWave. Публичной регистрации нет — используйте учётную запись, выданную администратором.
        </p>
        <form onSubmit={handleSubmit} noValidate>
          <div className="mw-admin-field">
            <label className="mw-admin-label" htmlFor="admin-email">
              Электронная почта
            </label>
            <input
              id="admin-email"
              className="mw-admin-input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="mw-admin-field">
            <label className="mw-admin-label" htmlFor="admin-password">
              Пароль
            </label>
            <input
              id="admin-password"
              className="mw-admin-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? <div className="mw-admin-alert mw-admin-alert--error">{error}</div> : null}
          <button className="mw-admin-btn" type="submit" disabled={loading} style={{ width: "100%", marginTop: 4 }}>
            {loading ? "Вход…" : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
