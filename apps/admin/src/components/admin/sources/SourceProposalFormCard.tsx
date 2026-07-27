"use client";

import { useState } from "react";
import { AdminSectionCard } from "../AdminSectionCard";

type Props = {
  saving: boolean;
  onSubmit: (input: { url: string; displayName: string; organizerName: string; notes: string }) => Promise<void>;
};

export function SourceProposalFormCard({ saving, onSubmit }: Props) {
  const [url, setUrl] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [organizerName, setOrganizerName] = useState("");
  const [notes, setNotes] = useState("");

  async function submit() {
    await onSubmit({ url, displayName, organizerName, notes });
    setUrl("");
    setDisplayName("");
    setOrganizerName("");
    setNotes("");
  }

  return (
    <AdminSectionCard title="Предложить новый источник">
      <p className="mw-admin-muted">Заявка не создаёт активный источник, не запускает парсинг и не публикует программы. Сначала она попадает в очередь проверки.</p>
      <div className="mw-admin-form-grid-4">
        <input className="mw-admin-input mw-admin-form-span-2" placeholder="URL Telegram, Instagram, RSS или сайта" value={url} onChange={(event) => setUrl(event.target.value)} />
        <input className="mw-admin-input" placeholder="Название (необязательно)" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        <input className="mw-admin-input" placeholder="Организатор (необязательно)" value={organizerName} onChange={(event) => setOrganizerName(event.target.value)} />
        <textarea className="mw-admin-input mw-admin-form-span-4" placeholder="Комментарий для проверки (необязательно)" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </div>
      <button type="button" className="mw-admin-btn mw-admin-mt-8" disabled={saving || !url.trim()} onClick={() => void submit()}>
        {saving ? "Отправляем..." : "Отправить на проверку"}
      </button>
    </AdminSectionCard>
  );
}
