"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getReviewModerationStatusLabel } from "@mywave/shared-types";
import { adminJson, getAdminToken } from "../../lib/admin";
import { AdminEmptyState } from "../../components/admin/AdminEmptyState";
import { AdminFilterField, AdminFiltersBar } from "../../components/admin/AdminFiltersBar";
import { AdminLoadingState } from "../../components/admin/AdminLoadingState";
import { AdminMessage } from "../../components/admin/AdminMessage";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminSectionCard } from "../../components/admin/AdminSectionCard";
import { AdminStatCard, AdminStatGrid } from "../../components/admin/AdminStatCard";
import { AdminStatusBadge } from "../../components/admin/AdminStatusBadge";

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

  const loadReviews = async () => {
    if (!getAdminToken()) {
      window.location.href = "/login";
      return;
    }
    setLoading(true);
    setError("");
    try {
      const q = filter ? `?moderation_status=${encodeURIComponent(filter)}` : "";
      const list = await adminJson<Review[]>(`/reviews${q}`);
      setReviews(list);
      setModerationDrafts(Object.fromEntries(list.map((review) => [review.id, review.moderationStatus])));
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setLoading(false);
    }
  };

  const loadCompletedBookings = async () => {
    if (!getAdminToken()) return;
    try {
      const list = await adminJson<BookingOption[]>("/bookings?booking_status=completed");
      setCompletedBookings(list);
      setCreateForm((current) => ({ ...current, bookingId: current.bookingId || list[0]?.id || "" }));
    } catch {
      setCompletedBookings([]);
    }
  };

  useEffect(() => {
    void loadReviews();
  }, [filter]);

  useEffect(() => {
    void loadCompletedBookings();
  }, []);

  const stats = useMemo(() => {
    const pending = reviews.filter((r) => r.moderationStatus === "pending").length;
    const approved = reviews.filter((r) => r.moderationStatus === "approved").length;
    const rejected = reviews.filter((r) => r.moderationStatus === "rejected").length;
    return { total: reviews.length, pending, approved, rejected };
  }, [reviews]);

  function moderationTone(status: string): "ok" | "warn" | "danger" | "muted" {
    if (status === "approved") return "ok";
    if (status === "rejected") return "danger";
    if (status === "pending") return "warn";
    return "muted";
  }

  const handleCreateReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!getAdminToken()) return;
    setCreating(true);
    setError("");
    setMessage("");
    try {
      await adminJson("/reviews", {
        method: "POST",
        body: JSON.stringify({
          bookingId: createForm.bookingId,
          rating: Number(createForm.rating),
          comment: createForm.comment.trim() || undefined,
        }),
      });
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
    if (!getAdminToken()) return;
    setSavingId(reviewId);
    setError("");
    setMessage("");
    try {
      await adminJson(`/reviews/${reviewId}/moderation`, {
        method: "PATCH",
        body: JSON.stringify({ moderationStatus: moderationDrafts[reviewId] }),
      });
      setMessage("Модерация обновлена.");
      await loadReviews();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось обновить статус модерации");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <main className="mw-admin-page">
      <AdminPageHeader
        title="Очередь отзывов"
        description={
          <>
            Отзывы создаются только после завершённой заявки и проходят ручную модерацию (см.{" "}
            <span className="mw-admin-code">docs/REVIEW_PUBLISH_POLICY.md</span>).
          </>
        }
      />
      {error ? <AdminMessage type="error">{error}</AdminMessage> : null}
      {message ? <AdminMessage type="success">{message}</AdminMessage> : null}

      {!loading && (
        <AdminStatGrid>
          <AdminStatCard label="Всего в списке" value={stats.total} />
          <AdminStatCard label="На модерации" value={stats.pending} />
          <AdminStatCard label="Одобрено" value={stats.approved} />
          <AdminStatCard label="Отклонено" value={stats.rejected} />
        </AdminStatGrid>
      )}

      <AdminSectionCard title="Создать отзыв по завершённой заявке">
        <form className="mw-admin-form-grid" onSubmit={handleCreateReview}>
          <select
            className="mw-admin-input"
            value={createForm.bookingId}
            onChange={(e) => setCreateForm((current) => ({ ...current, bookingId: e.target.value }))}
          >
            <option value="">Выберите завершённую заявку</option>
            {completedBookings.map((booking) => (
              <option key={booking.id} value={booking.id}>
                {booking.program?.title ?? booking.id} · {booking.guestContact}
              </option>
            ))}
          </select>
          <select
            className="mw-admin-input"
            value={createForm.rating}
            onChange={(e) => setCreateForm((current) => ({ ...current, rating: e.target.value }))}
          >
            {[5, 4, 3, 2, 1].map((rating) => (
              <option key={rating} value={rating}>
                Оценка {rating}
              </option>
            ))}
          </select>
          <textarea
            className="mw-admin-textarea mw-admin-form-span-2"
            value={createForm.comment}
            onChange={(e) => setCreateForm((current) => ({ ...current, comment: e.target.value }))}
            placeholder="Комментарий гостя"
            rows={3}
          />
          <button type="submit" className="mw-admin-btn" disabled={creating || !createForm.bookingId}>
            {creating ? "Создаём…" : "Создать отзыв"}
          </button>
        </form>
      </AdminSectionCard>

      <AdminFiltersBar title="Фильтры">
        <AdminFilterField label="Статус модерации">
          <select className="mw-admin-input mw-admin-minw-220" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Все</option>
            {MODERATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {getReviewModerationStatusLabel(status)}
              </option>
            ))}
          </select>
        </AdminFilterField>
      </AdminFiltersBar>

      {loading ? (
        <AdminLoadingState label="Загружаем отзывы…" />
      ) : reviews.length === 0 ? (
        <AdminEmptyState
          title="Нет отзывов"
          description={filter ? "По выбранному фильтру модерации записей нет." : "Очередь отзывов пока пуста."}
        />
      ) : (
        <div className="mw-admin-table-outer">
          <table className="mw-admin-table">
            <thead>
              <tr>
                <th>Рейтинг</th>
                <th>Комментарий</th>
                <th>Программа</th>
                <th>Организатор</th>
                <th>Модерация</th>
                <th>Создан</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((review) => (
                <tr key={review.id}>
                  <td className="mw-admin-td-nowrap">{review.rating}</td>
                  <td className="mw-admin-td-wrap mw-admin-minw-260">
                    {(review.comment ?? "").slice(0, 70)}
                    {(review.comment?.length ?? 0) > 70 ? "…" : ""}
                  </td>
                  <td className="mw-admin-muted">{review.program?.title ?? "—"}</td>
                  <td className="mw-admin-muted">{review.organizer?.displayName ?? "—"}</td>
                  <td>
                    <div className="mw-admin-mb-6">
                      <AdminStatusBadge tone={moderationTone(review.moderationStatus)}>
                        {getReviewModerationStatusLabel(review.moderationStatus)}
                      </AdminStatusBadge>
                    </div>
                    <select
                      className="mw-admin-input mw-admin-minw-180"
                      value={moderationDrafts[review.id] ?? review.moderationStatus}
                      onChange={(e) => setModerationDrafts((current) => ({ ...current, [review.id]: e.target.value }))}
                    >
                      {MODERATION_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {getReviewModerationStatusLabel(status)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="mw-admin-muted">{new Date(review.createdAt).toLocaleString("ru-RU")}</td>
                  <td className="mw-admin-actions-col">
                    <button
                      type="button"
                      className="mw-admin-btn mw-admin-btn--ghost"
                      onClick={() => void handleSaveModeration(review.id)}
                      disabled={savingId === review.id || (moderationDrafts[review.id] ?? review.moderationStatus) === review.moderationStatus}
                    >
                      {savingId === review.id ? "Сохраняем…" : "Сохранить"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
