"use client";

import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState, type FormEvent } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const MAX_MEDIA = 6;

export default function ProgramUgcSubmitPage() {
  const params = useParams();
  const programId = params?.id as string;
  const search = useSearchParams();
  const token = search?.get("token") ?? "";

  const [authorName, setAuthorName] = useState("");
  const [textReview, setTextReview] = useState("");
  const [rating, setRating] = useState<number | "">("");
  const [mediaInput, setMediaInput] = useState("");
  const [consent, setConsent] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const parsedMedia = mediaInput
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s))
    .slice(0, MAX_MEDIA);

  if (!token) {
    return (
      <main className="mw-container" style={{ padding: "3rem 0", maxWidth: 680 }}>
        <h1 className="mw-h1">Отзыв о поездке</h1>
        <p style={{ color: "var(--mw-muted)" }}>
          Ссылка недействительна: отсутствует токен. Перейдите из письма, которое мы отправили после завершения поездки.
        </p>
        <Link href={`/program/${programId}`} className="mw-page-back">
          ← К программе
        </Link>
      </main>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (!authorName.trim() || !textReview.trim() || !consent) return;
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`${API_URL}/public/program-ugc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          authorName: authorName.trim(),
          textReview: textReview.trim(),
          rating: rating === "" ? undefined : Number(rating),
          mediaUrls: parsedMedia,
          consentToPublish: consent,
          contactEmail: contactEmail.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? "Не удалось отправить отзыв");
      }
      if (body?.state === "already_submitted") {
        setSuccess("Мы уже получили ваш отзыв по этой поездке. Публикация — после короткой модерации.");
      } else {
        setSuccess("Спасибо! Отзыв отправлен на модерацию. После одобрения он появится на карточке программы.");
        setAuthorName("");
        setTextReview("");
        setRating("");
        setMediaInput("");
        setContactEmail("");
        setConsent(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить отзыв");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mw-container" style={{ padding: "2.5rem 0 4rem", maxWidth: 720 }}>
      <Link href={`/program/${programId}`} className="mw-page-back" style={{ color: "var(--mw-accent)" }}>
        ← К программе
      </Link>
      <h1 className="mw-h1" style={{ maxWidth: "none" }}>
        Отзыв участника
      </h1>
      <p style={{ color: "var(--mw-muted)", lineHeight: 1.6 }}>
        Ваш отзыв появится в блоке «Реальные участники» на карточке программы — только с вашего согласия и после короткой
        модерации. Ссылка привязана к вашему бронированию.
      </p>

      {error && <p style={{ color: "#b00020", margin: "12px 0" }}>{error}</p>}
      {success && <p style={{ color: "#047857", margin: "12px 0", fontWeight: 600 }}>{success}</p>}

      <form onSubmit={handleSubmit} className="mw-form-card" style={{ marginTop: 24 }}>
        <div className="mw-field" style={{ marginBottom: 16 }}>
          <label htmlFor="authorName">Как подписать отзыв</label>
          <input
            id="authorName"
            className="mw-input"
            style={{ width: "100%", minWidth: 0 }}
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder="Имя или ник (будет видно на карточке)"
            maxLength={120}
            disabled={submitting}
          />
        </div>

        <div className="mw-field" style={{ marginBottom: 16 }}>
          <label htmlFor="rating">Рейтинг (опционально)</label>
          <select
            id="rating"
            className="mw-input"
            value={rating}
            onChange={(e) => setRating(e.target.value === "" ? "" : Number(e.target.value))}
            disabled={submitting}
          >
            <option value="">Не указывать</option>
            <option value="5">5 — отлично</option>
            <option value="4">4 — хорошо</option>
            <option value="3">3 — нормально</option>
            <option value="2">2 — так себе</option>
            <option value="1">1 — плохо</option>
          </select>
        </div>

        <div className="mw-field" style={{ marginBottom: 16 }}>
          <label htmlFor="textReview">Отзыв</label>
          <textarea
            id="textReview"
            className="mw-textarea"
            value={textReview}
            onChange={(e) => setTextReview(e.target.value)}
            placeholder="Что понравилось, что нет, что важно знать следующим участникам"
            rows={6}
            maxLength={5000}
            disabled={submitting}
          />
        </div>

        <div className="mw-field" style={{ marginBottom: 16 }}>
          <label htmlFor="media">Фото и видео (ссылки, до {MAX_MEDIA})</label>
          <textarea
            id="media"
            className="mw-textarea"
            value={mediaInput}
            onChange={(e) => setMediaInput(e.target.value)}
            placeholder="https://… (по одной ссылке на строку)"
            rows={3}
            disabled={submitting}
          />
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--mw-muted)" }}>
            Загрузите файлы в свой облачный диск / фотохостинг и вставьте прямые ссылки. Распознано: {parsedMedia.length}.
          </p>
        </div>

        <div className="mw-field" style={{ marginBottom: 16 }}>
          <label htmlFor="contactEmail">Email для связи (опционально)</label>
          <input
            id="contactEmail"
            className="mw-input"
            type="email"
            style={{ width: "100%", minWidth: 0 }}
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="на случай вопросов по модерации"
            disabled={submitting}
          />
        </div>

        <label
          className="mw-field"
          style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 18 }}
        >
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            disabled={submitting}
            style={{ marginTop: 4 }}
          />
          <span style={{ color: "var(--mw-muted)", lineHeight: 1.55 }}>
            Согласен(на) на публикацию моего отзыва, имени и медиа на карточке программы. Я понимаю, что публикация
            произойдёт только после модерации MyWave.
          </span>
        </label>

        <button
          type="submit"
          disabled={submitting || !authorName.trim() || !textReview.trim() || !consent}
          className="mw-btn mw-btn--primary"
        >
          {submitting ? "Отправляем…" : "Отправить отзыв"}
        </button>
      </form>
    </main>
  );
}
