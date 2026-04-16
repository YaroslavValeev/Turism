"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { getReviewModerationStatusLabel } from "@mywave/shared-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const MODERATION_STATUSES = ["pending", "approved", "rejected"];

type BookingOption = {
  id: string;
  bookingStatus: string;
  guestContact: string;
  program?: { title: string };
};

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  moderationStatus: string;
  createdAt: string;
  program?: { id: string; title: string };
  organizer?: { id: string; displayName: string };
  booking?: { id: string; bookingStatus: string };
};

type CreateReviewForm = {
  bookingId: string;
  rating: string;
  comment: string;
};

export default function ReviewsQueuePage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [completedBookings, setCompletedBookings] = useState<BookingOption[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [moderationDrafts, setModerationDrafts] = useState<Record<string, string>>({});
  const [createForm, setCreateForm] = useState<CreateReviewForm>({ bookingId: "", rating: "5", comment: "" });
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const getToken = () => (typeof window !== "undefined" ? window.localStorage.getItem("admin_token") : null);

  const loadReviews = async () => {
    const token = getToken();
    if (!token) {
      window.location.href = "/login";
      return;
    }
    setLoading(true);
    setError("");
    try {
      const q = filter ? `?moderation_status=${encodeURIComponent(filter)}` : "";
      const res = await fetch(`${API_URL}/reviews${q}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        window.localStorage.removeItem("admin_token");
        window.location.href = "/login";
        return;
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setReviews(list);
      setModerationDrafts(Object.fromEntries(list.map((review) => [review.id, review.moderationStatus])));
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setLoading(false);
    }
  };

  const loadCompletedBookings = async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/bookings?booking_status=completed`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setCompletedBookings(list);
      setCreateForm((current) => ({ ...current, bookingId: current.bookingId || list[0]?.id || "" }));
    } catch {
      setCompletedBookings([]);
    }
  };

  useEffect(() => {
    loadReviews();
  }, [filter]);

  useEffect(() => {
    loadCompletedBookings();
  }, []);

  const handleCreateReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = getToken();
    if (!token) return;
    setCreating(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          bookingId: createForm.bookingId,
          rating: Number(createForm.rating),
          comment: createForm.comment.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? "Не удалось создать отзыв");
      }
      setMessage("Отзыв создан и отправлен на модерацию.");
      setCreateForm((current) => ({ ...current, comment: "" }));
      await loadReviews();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Не удалось создать отзыв");
    } finally {
      setCreating(false);
    }
  };

  const handleSaveModeration = async (reviewId: string) => {
    const token = getToken();
    if (!token) return;
    setSavingId(reviewId);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/reviews/${reviewId}/moderation`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ moderationStatus: moderationDrafts[reviewId] }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? "Не удалось обновить статус модерации");
      }
      setMessage("Модерация обновлена.");
      await loadReviews();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось обновить статус модерации");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <main style={{ padding: 24 }}>
      <p>
        <Link href="/organizers">Организаторы</Link> | <Link href="/programs">Программы</Link> | <Link href="/bookings">Заявки</Link> | <Link href="/incidents">Инциденты</Link> | <strong>Отзывы</strong> | <Link href="/commissions">Комиссии</Link>
      </p>
      <h1>Очередь отзывов</h1>
      <p style={{ fontSize: 14, color: "#555" }}>
        Отзывы создаются только после завершённой заявки и затем проходят ручную модерацию по <code>docs/REVIEW_PUBLISH_POLICY.md</code>.
      </p>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {message && <p style={{ color: "#1d6f42" }}>{message}</p>}

      <section style={{ margin: "20px 0", padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
        <h2 style={{ marginTop: 0 }}>Создать отзыв по завершённой заявке</h2>
        <form onSubmit={handleCreateReview} style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <select value={createForm.bookingId} onChange={(e) => setCreateForm((current) => ({ ...current, bookingId: e.target.value }))} style={{ padding: 10 }}>
            <option value="">Выберите завершённую заявку</option>
            {completedBookings.map((booking) => (
              <option key={booking.id} value={booking.id}>
                {booking.program?.title ?? booking.id} · {booking.guestContact}
              </option>
            ))}
          </select>
          <select value={createForm.rating} onChange={(e) => setCreateForm((current) => ({ ...current, rating: e.target.value }))} style={{ padding: 10 }}>
            {[5, 4, 3, 2, 1].map((rating) => (
              <option key={rating} value={rating}>{rating}</option>
            ))}
          </select>
          <textarea
            value={createForm.comment}
            onChange={(e) => setCreateForm((current) => ({ ...current, comment: e.target.value }))}
            placeholder="Комментарий гостя"
            rows={3}
            style={{ padding: 10 }}
          />
          <button type="submit" disabled={creating || !createForm.bookingId} style={{ padding: 10 }}>
            {creating ? "Создание..." : "Создать отзыв"}
          </button>
        </form>
      </section>

      <p>
        Фильтр по модерации:{" "}
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: 6 }}>
          <option value="">Все</option>
          {MODERATION_STATUSES.map((status) => (
            <option key={status} value={status}>{getReviewModerationStatusLabel(status)}</option>
          ))}
        </select>
      </p>
      {loading && <p>Загрузка…</p>}
      {!loading && (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #333" }}>
              <th style={{ textAlign: "left", padding: 8 }}>Рейтинг</th>
              <th style={{ textAlign: "left", padding: 8 }}>Комментарий</th>
              <th style={{ textAlign: "left", padding: 8 }}>Программа</th>
              <th style={{ textAlign: "left", padding: 8 }}>Организатор</th>
              <th style={{ textAlign: "left", padding: 8 }}>Модерация</th>
              <th style={{ textAlign: "left", padding: 8 }}>Создан</th>
              <th style={{ textAlign: "left", padding: 8 }}>Действие</th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((review) => (
              <tr key={review.id} style={{ borderBottom: "1px solid #ccc" }}>
                <td style={{ padding: 8 }}>{review.rating}</td>
                <td style={{ padding: 8, maxWidth: 250 }}>{(review.comment ?? "").slice(0, 60)}{(review.comment?.length ?? 0) > 60 ? "…" : ""}</td>
                <td style={{ padding: 8 }}>{review.program?.title ?? "—"}</td>
                <td style={{ padding: 8 }}>{review.organizer?.displayName ?? "—"}</td>
                <td style={{ padding: 8 }}>
                  <select
                    value={moderationDrafts[review.id] ?? review.moderationStatus}
                    onChange={(e) => setModerationDrafts((current) => ({ ...current, [review.id]: e.target.value }))}
                    style={{ padding: 6 }}
                  >
                    {MODERATION_STATUSES.map((status) => (
                      <option key={status} value={status}>{getReviewModerationStatusLabel(status)}</option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: 8 }}>{new Date(review.createdAt).toLocaleString("ru-RU")}</td>
                <td style={{ padding: 8 }}>
                  <button
                    type="button"
                    onClick={() => handleSaveModeration(review.id)}
                    disabled={savingId === review.id || (moderationDrafts[review.id] ?? review.moderationStatus) === review.moderationStatus}
                    style={{ padding: "6px 10px" }}
                  >
                    {savingId === review.id ? "Сохраняем..." : "Сохранить"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!loading && reviews.length === 0 && <p>Нет отзывов.</p>}
    </main>
  );
}
