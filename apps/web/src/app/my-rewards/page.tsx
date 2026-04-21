"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Reward = {
  id: string;
  valueType: "percent" | "amount" | string;
  value: number;
  currency: string | null;
  status: "available" | "used" | "expired" | string;
  source: string;
  createdAt: string;
  usedAt: string | null;
  recoveredAt: string | null;
  recoveredCancellationKind: string | null;
  expiresAt: string | null;
};

type ApiResponse = {
  owner: { email: string | null; userId: string | null };
  rewards: Reward[];
  aggregates: {
    available_count: number;
    available_total_percent: number;
    available_total_amount_rub: number;
  };
};

function fmtValue(r: Reward): string {
  if (r.valueType === "percent") return `${r.value}%`;
  if (r.valueType === "amount") return `${r.value.toLocaleString("ru-RU")} ${r.currency ?? "₽"}`;
  return `${r.value}`;
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("ru-RU", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return s;
  }
}

function statusLabel(s: Reward["status"]): { text: string; color: string; bg: string } {
  switch (s) {
    case "available":
      return { text: "Доступен", color: "#047857", bg: "#d1fae5" };
    case "used":
      return { text: "Использован", color: "#6b7280", bg: "#f3f4f6" };
    case "expired":
      return { text: "Истёк", color: "#b91c1c", bg: "#fee2e2" };
    default:
      return { text: s, color: "#374151", bg: "#f3f4f6" };
  }
}

function MyRewardsInner() {
  const search = useSearchParams();
  const token = search?.get("token") ?? "";
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/public/my-rewards?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? "Ссылка недействительна или истекла");
        if (!cancelled) setData(body as ApiResponse);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ошибка загрузки");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!token) {
    return (
      <main className="mw-container" style={{ padding: "3rem 0", maxWidth: 680 }}>
        <h1 className="mw-h1">Мои бонусы</h1>
        <p style={{ color: "var(--mw-muted)" }}>
          Ссылка недействительна: отсутствует токен. Перейдите по ссылке из письма MyWave.
        </p>
        <Link href="/" className="mw-page-back">
          ← На главную
        </Link>
      </main>
    );
  }

  return (
    <main className="mw-container" style={{ padding: "2.5rem 0 4rem", maxWidth: 760 }}>
      <Link href="/" className="mw-page-back" style={{ color: "var(--mw-accent)" }}>
        ← На главную
      </Link>
      <h1 className="mw-h1" style={{ maxWidth: "none" }}>
        Мои бонусы
      </h1>
      <p style={{ color: "var(--mw-muted)", lineHeight: 1.6 }}>
        Бонусы за отзывы и участие. Применяются автоматически при следующем бронировании MyWave —
        отдельные действия не нужны.
      </p>

      {loading && <p style={{ marginTop: 24 }}>Загружаем…</p>}
      {error && (
        <p style={{ color: "#b00020", marginTop: 24, fontWeight: 600 }}>
          {error}
        </p>
      )}

      {data && (
        <>
          <section
            style={{
              marginTop: 24,
              padding: "16px 18px",
              borderRadius: 10,
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
            }}
          >
            <p style={{ margin: 0, fontWeight: 600, color: "#065f46" }}>
              Доступно бонусов: {data.aggregates.available_count}
            </p>
            {(data.aggregates.available_total_percent > 0 ||
              data.aggregates.available_total_amount_rub > 0) && (
              <p style={{ margin: "6px 0 0", color: "#047857", fontSize: 14 }}>
                {data.aggregates.available_total_percent > 0 && (
                  <>В сумме: до {data.aggregates.available_total_percent}%</>
                )}
                {data.aggregates.available_total_percent > 0 &&
                  data.aggregates.available_total_amount_rub > 0 &&
                  " + "}
                {data.aggregates.available_total_amount_rub > 0 && (
                  <>{data.aggregates.available_total_amount_rub.toLocaleString("ru-RU")} ₽</>
                )}
              </p>
            )}
            <p style={{ margin: "6px 0 0", color: "var(--mw-muted)", fontSize: 13 }}>
              Бонус — одноразовый. Применится автоматически к следующему бронированию.
            </p>
          </section>

          <h2 style={{ marginTop: 32, marginBottom: 12, fontSize: 18 }}>История</h2>
          {data.rewards.length === 0 && (
            <p style={{ color: "var(--mw-muted)" }}>Бонусов пока нет.</p>
          )}
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
            {data.rewards.map((r) => {
              const s = statusLabel(r.status);
              return (
                <li
                  key={r.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    padding: "14px 16px",
                    background: "#fff",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{fmtValue(r)}</div>
                    <span
                      style={{
                        background: s.bg,
                        color: s.color,
                        padding: "3px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {s.text}
                    </span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 13, color: "var(--mw-muted)", lineHeight: 1.5 }}>
                    Источник: {r.source === "ugc" ? "за отзыв" : r.source}
                    <br />
                    Создан: {fmtDate(r.createdAt)}
                    {r.usedAt && (
                      <>
                        <br />
                        Использован: {fmtDate(r.usedAt)}
                      </>
                    )}
                    {r.recoveredAt && (
                      <>
                        <br />
                        <span style={{ color: "#047857" }}>
                          Восстановлен: {fmtDate(r.recoveredAt)}
                          {r.recoveredCancellationKind ? ` (${r.recoveredCancellationKind})` : ""}
                        </span>
                      </>
                    )}
                    {r.expiresAt && r.status === "available" && (
                      <>
                        <br />
                        Действителен до {fmtDate(r.expiresAt)}
                      </>
                    )}
                    {r.expiresAt && r.status === "expired" && (
                      <>
                        <br />
                        Срок действия истёк ({fmtDate(r.expiresAt)})
                      </>
                    )}
                    {r.expiresAt && r.status === "used" && (
                      <>
                        <br />
                        На момент бронирования срок действия: {fmtDate(r.expiresAt)}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <p style={{ marginTop: 28, fontSize: 12, color: "var(--mw-muted)" }}>
            Ссылка действительна ограниченное время. Если она истекла — следующее письмо MyWave
            (например, после новой брони или нового отзыва) пришлёт свежую.
          </p>
        </>
      )}
    </main>
  );
}

export default function MyRewardsPage() {
  return (
    <Suspense
      fallback={
        <main className="mw-container" style={{ padding: "3rem 0" }}>
          <p style={{ color: "var(--mw-muted)" }}>Загрузка…</p>
        </main>
      }
    >
      <MyRewardsInner />
    </Suspense>
  );
}
