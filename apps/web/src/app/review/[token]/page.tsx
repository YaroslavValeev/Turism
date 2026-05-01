"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getPublicApiBase } from "../../../lib/publicApiBase";

type RequestInfo = {
  request: {
    id: string;
    bookingId: string;
    status: string;
  };
  review: { id: string; rating: number; moderationStatus: string } | null;
};

export default function ReviewRequestPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<RequestInfo | null>(null);
  const [error, setError] = useState("");
  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`${getPublicApiBase()}/reviews/request/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error ?? "Не удалось загрузить ссылку");
        setInfo(body);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка"))
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`${getPublicApiBase()}/reviews/request/${encodeURIComponent(token)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: Number(rating), comment }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Не удалось отправить отзыв");
      setMessage("Спасибо! Отзыв отправлен на модерацию.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка отправки");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <main className="mw-container" style={{ padding: "2rem 0" }}><p>Загрузка...</p></main>;

  return (
    <main className="mw-container" style={{ padding: "2rem 0", maxWidth: 680 }}>
      <h1 className="mw-h2">Оставить отзыв</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {message && <p style={{ color: "#1d6f42" }}>{message}</p>}
      {info?.review ? (
        <p>Отзыв уже отправлен ранее. Спасибо!</p>
      ) : (
        <form onSubmit={submit} className="mw-card" style={{ display: "grid", gap: 12 }}>
          <label>
            Оценка (1-5)
            <input value={rating} onChange={(e) => setRating(e.target.value)} min={1} max={5} type="number" style={{ display: "block", padding: 8, width: 120 }} />
          </label>
          <label>
            Что важно для тебя в этом выезде
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={5} style={{ display: "block", width: "100%", padding: 8 }} />
          </label>
          <button className="mw-btn mw-btn--primary" type="submit" disabled={submitting}>
            {submitting ? "Отправка..." : "Отправить отзыв"}
          </button>
        </form>
      )}
    </main>
  );
}
