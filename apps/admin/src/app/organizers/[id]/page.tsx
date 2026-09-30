"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getOrganizerVerificationStatusLabel, getProgramPublishStatusLabel } from "@mywave/shared-types";
import { adminJson, getAdminToken } from "../../../lib/admin";
import { AdminLoadingState } from "../../../components/admin/AdminLoadingState";
import { AdminMessage } from "../../../components/admin/AdminMessage";
import { AdminPageHeader } from "../../../components/admin/AdminPageHeader";
import { AdminSectionCard } from "../../../components/admin/AdminSectionCard";
import { AdminStatusBadge } from "../../../components/admin/AdminStatusBadge";
import {
  VERIFICATION_LADDER,
  canHaveAutoPublish,
  nextVerificationStep,
  organizerChecklist,
  verificationTone,
  type OrganizerOverview,
} from "../../../components/admin/organizers/organizerModel";

const WEB_BASE = (process.env.NEXT_PUBLIC_WEB_URL ?? "").replace(/\/+$/, "");

type SourceOption = { id: string; name: string; type: string; organizer: { id: string; displayName: string } | null };
type OrganizerOption = { id: string; displayName: string; verificationStatus: string };

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("ru-RU") : "—";
}

export default function OrganizerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<OrganizerOverview | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState({ displayName: "", contactEmail: "", contactPhone: "", legalStatus: "" });
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceNotes, setEvidenceNotes] = useState("");
  const [sourceOptions, setSourceOptions] = useState<SourceOption[] | null>(null);
  const [sourceToLink, setSourceToLink] = useState("");
  const [mergeOptions, setMergeOptions] = useState<OrganizerOption[] | null>(null);
  const [mergeTarget, setMergeTarget] = useState("");

  const load = useCallback(async () => {
    try {
      const overview = await adminJson<OrganizerOverview>(`/organizers/${id}/overview`);
      setData(overview);
      const o = overview.organizer;
      setProfile({
        displayName: o.displayName,
        contactEmail: o.isIngestionStub ? "" : o.contactEmail,
        contactPhone: o.contactPhone ?? "",
        legalStatus: o.legalStatus ?? "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);

  useEffect(() => {
    if (!getAdminToken()) {
      window.location.href = "/login";
      return;
    }
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <main className="mw-admin-page">
        {error ? <AdminMessage type="error">{error}</AdminMessage> : <AdminLoadingState label="Загружаем организатора…" />}
      </main>
    );
  }

  const { organizer, evidence, sources, programs, similar, storefrontHidden } = data;
  const next = nextVerificationStep(organizer.verificationStatus);
  const checklist = organizerChecklist(data);
  const statusLabel = getOrganizerVerificationStatusLabel(organizer.verificationStatus);

  const saveProfile = () =>
    run(
      () =>
        adminJson(`/organizers/${organizer.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            displayName: profile.displayName,
            ...(profile.contactEmail.trim() ? { contactEmail: profile.contactEmail } : {}),
            contactPhone: profile.contactPhone,
            legalStatus: profile.legalStatus,
          }),
        }),
      "Профиль сохранён. Новое название подставлено в программы организатора.",
    );

  const changeStatus = (target: string, withEvidence: boolean) =>
    run(async () => {
      await adminJson(`/organizers/${organizer.id}/verification-status`, {
        method: "PATCH",
        body: JSON.stringify({
          verificationStatus: target,
          evidence: withEvidence ? { evidenceUrl, notes: evidenceNotes } : null,
        }),
      });
      setEvidenceUrl("");
      setEvidenceNotes("");
    }, `Статус изменён на «${getOrganizerVerificationStatusLabel(target)}».`);

  const confirmHide = (target: "paused" | "rejected") => {
    const label = target === "paused" ? "поставить на паузу" : "отклонить";
    if (window.confirm(`Точно ${label} «${organizer.displayName}»? Все его программы сразу пропадут с сайта, автопубликация будет отозвана.`)) {
      void changeStatus(target, false);
    }
  };

  const toggleAutoPublish = (enabled: boolean) =>
    run(
      () => adminJson(`/organizers/${organizer.id}/autopublish`, { method: "PUT", body: JSON.stringify({ enabled }) }),
      enabled ? "Автопубликация разрешена." : "Автопубликация отозвана: новые программы пойдут через проверку.",
    );

  const loadSourceOptions = async () => {
    try {
      const list = await adminJson<SourceOption[]>("/sources");
      setSourceOptions(list.filter((s) => s.organizer?.id !== organizer.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const linkSource = () =>
    run(async () => {
      await adminJson(`/sources/${sourceToLink}`, { method: "PATCH", body: JSON.stringify({ organizerId: organizer.id }) });
      setSourceOptions(null);
      setSourceToLink("");
    }, "Источник привязан: новые программы из него будут собираться к этому организатору.");

  const unlinkSource = (sourceId: string, name: string) => {
    if (!window.confirm(`Отвязать источник «${name}» от организатора?`)) return;
    void run(
      () => adminJson(`/sources/${sourceId}`, { method: "PATCH", body: JSON.stringify({ organizerId: null }) }),
      "Источник отвязан.",
    );
  };

  const loadMergeOptions = async () => {
    try {
      const list = await adminJson<OrganizerOption[]>("/organizers");
      setMergeOptions(list.filter((o) => o.id !== organizer.id).sort((a, b) => a.displayName.localeCompare(b.displayName, "ru")));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const merge = (fromId: string, fromName: string, targetId: string, targetName: string) => {
    if (!window.confirm(`Перенести программы и источники «${fromName}» в «${targetName}»? Запись «${fromName}» станет «Отклонён».`)) return;
    void run(async () => {
      await adminJson(`/organizers/${fromId}/merge-into`, { method: "POST", body: JSON.stringify({ targetId }) });
      if (fromId === organizer.id) window.location.href = `/organizers/${targetId}`;
    }, `«${fromName}» объединён с «${targetName}».`);
  };

  return (
    <main className="mw-admin-page">
      <p style={{ margin: "0 0 8px" }}>
        <Link href="/organizers">← Все организаторы</Link>
      </p>
      <AdminPageHeader
        title={organizer.displayName}
        description={
          <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <AdminStatusBadge tone={verificationTone(organizer.verificationStatus)}>{statusLabel}</AdminStatusBadge>
            {organizer.isIngestionStub ? <AdminStatusBadge tone="warn">Создан автосбором</AdminStatusBadge> : null}
            {organizer.autoPublishApprovedAt ? <AdminStatusBadge tone="ok">Автопубликация</AdminStatusBadge> : null}
            {storefrontHidden ? <AdminStatusBadge tone="danger">Программы скрыты с сайта</AdminStatusBadge> : null}
          </span>
        }
      />
      {error ? <AdminMessage type="error">{error}</AdminMessage> : null}
      {message ? <AdminMessage type="success">{message}</AdminMessage> : null}

      <AdminSectionCard title="Что сделать дальше">
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "grid", gap: 8 }}>
          {checklist.map((item) => (
            <li key={item.label}>
              <strong>{item.done ? "✓" : "•"} {item.label}</strong>
              <span className="mw-admin-muted"> — {item.hint}</span>
            </li>
          ))}
        </ul>
      </AdminSectionCard>

      <AdminSectionCard title="1. Профиль">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          <label className="mw-admin-stack-6">
            <span className="mw-admin-caption">Название (так видят на сайте)</span>
            <input className="mw-admin-input" value={profile.displayName} onChange={(e) => setProfile((p) => ({ ...p, displayName: e.target.value }))} />
          </label>
          <label className="mw-admin-stack-6">
            <span className="mw-admin-caption">Email{organizer.isIngestionStub ? " (сейчас заглушка автосбора)" : ""}</span>
            <input
              className="mw-admin-input"
              type="email"
              placeholder={organizer.isIngestionStub ? organizer.contactEmail : ""}
              value={profile.contactEmail}
              onChange={(e) => setProfile((p) => ({ ...p, contactEmail: e.target.value }))}
            />
          </label>
          <label className="mw-admin-stack-6">
            <span className="mw-admin-caption">Телефон</span>
            <input className="mw-admin-input" value={profile.contactPhone} onChange={(e) => setProfile((p) => ({ ...p, contactPhone: e.target.value }))} />
          </label>
          <label className="mw-admin-stack-6">
            <span className="mw-admin-caption">Юр. статус (ИП, ООО, самозанятый)</span>
            <input className="mw-admin-input" value={profile.legalStatus} onChange={(e) => setProfile((p) => ({ ...p, legalStatus: e.target.value }))} />
          </label>
        </div>
        <div className="mw-admin-inline-form mw-admin-mt-8">
          <button type="button" className="mw-admin-btn" onClick={() => void saveProfile()} disabled={busy || !profile.displayName.trim()}>
            Сохранить профиль
          </button>
        </div>
      </AdminSectionCard>

      <AdminSectionCard title="2. Проверка">
        <p className="mw-admin-muted" style={{ marginTop: 0 }}>
          Ступени:{" "}
          {VERIFICATION_LADDER.map((s, i) => (
            <span key={s}>
              {i > 0 ? " → " : ""}
              {s === organizer.verificationStatus ? <strong>{getOrganizerVerificationStatusLabel(s)}</strong> : getOrganizerVerificationStatusLabel(s)}
            </span>
          ))}
          . Повышение — по одной ступени и с доказательством.
        </p>
        {next ? (
          <div className="mw-admin-stack-6">
            <strong>Следующий шаг: «{getOrganizerVerificationStatusLabel(next.target)}»</strong>
            <span className="mw-admin-muted">{next.hint}</span>
            {next.target !== "listed" ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                <input className="mw-admin-input" placeholder="Ссылка на доказательство (сайт, документ, отзыв)" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} />
                <input className="mw-admin-input" placeholder="Заметка: что проверено" value={evidenceNotes} onChange={(e) => setEvidenceNotes(e.target.value)} />
              </div>
            ) : null}
            <div className="mw-admin-inline-form">
              <button
                type="button"
                className="mw-admin-btn"
                disabled={busy || (next.target !== "listed" && evidence.length === 0 && !evidenceUrl.trim() && !evidenceNotes.trim())}
                onClick={() => void changeStatus(next.target, next.target !== "listed")}
              >
                {next.target === "listed" ? "Вернуть в каталог" : `Повысить до «${getOrganizerVerificationStatusLabel(next.target)}»`}
              </button>
            </div>
          </div>
        ) : (
          <p>Высшая ступень доверия.</p>
        )}
        <div className="mw-admin-inline-form mw-admin-mt-8" style={{ flexWrap: "wrap" }}>
          {organizer.verificationStatus !== "listed" && !storefrontHidden ? (
            <button type="button" className="mw-admin-btn mw-admin-btn--ghost" disabled={busy} onClick={() => void changeStatus("listed", false)}>
              Понизить до «В листинге»
            </button>
          ) : null}
          {organizer.verificationStatus !== "paused" ? (
            <button type="button" className="mw-admin-btn mw-admin-btn--ghost" disabled={busy} onClick={() => confirmHide("paused")}>
              На паузу (скрыть программы)
            </button>
          ) : null}
          {organizer.verificationStatus !== "rejected" ? (
            <button type="button" className="mw-admin-btn mw-admin-btn--ghost" disabled={busy} onClick={() => confirmHide("rejected")}>
              Отклонить
            </button>
          ) : null}
        </div>
        <h3 style={{ margin: "16px 0 8px" }}>Доказательства ({evidence.length})</h3>
        {evidence.length === 0 ? (
          <p className="mw-admin-muted">Пока нет.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {evidence.map((e) => (
              <li key={e.id}>
                {formatDate(e.createdAt)} ·{" "}
                {e.evidenceUrl ? (
                  <a href={e.evidenceUrl} target="_blank" rel="noreferrer">
                    {e.evidenceUrl}
                  </a>
                ) : null}{" "}
                {e.notes ? <span className="mw-admin-muted">{e.notes}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </AdminSectionCard>

      <AdminSectionCard title="3. Автопубликация">
        <p style={{ marginTop: 0 }}>
          {organizer.autoPublishApprovedAt
            ? `Разрешена с ${formatDate(organizer.autoPublishApprovedAt)}: программы из привязанных активных источников публикуются сами (у источника тоже должна быть включена автопубликация).`
            : "Выключена: программы этого организатора попадают в очередь «Кандидаты» на ручную проверку."}
        </p>
        {organizer.autoPublishApprovedAt ? (
          <button type="button" className="mw-admin-btn mw-admin-btn--ghost" disabled={busy} onClick={() => void toggleAutoPublish(false)}>
            Отозвать автопубликацию
          </button>
        ) : (
          <button
            type="button"
            className="mw-admin-btn"
            disabled={busy || !canHaveAutoPublish(organizer.verificationStatus)}
            onClick={() => void toggleAutoPublish(true)}
            title={canHaveAutoPublish(organizer.verificationStatus) ? "" : "Доступно со статуса «Верифицирован»"}
          >
            Разрешить автопубликацию
          </button>
        )}
        {!canHaveAutoPublish(organizer.verificationStatus) && !organizer.autoPublishApprovedAt ? (
          <span className="mw-admin-muted"> Доступно со статуса «Верифицирован».</span>
        ) : null}
      </AdminSectionCard>

      <AdminSectionCard title={`4. Источники (${sources.length})`}>
        {sources.length === 0 ? <p className="mw-admin-muted" style={{ marginTop: 0 }}>Не привязаны.</p> : (
          <table className="mw-admin-table">
            <thead>
              <tr>
                <th>Источник</th>
                <th>Тип</th>
                <th>Активен</th>
                <th>Автопубликация источника</th>
                <th>Последний успешный сбор</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name}</strong>
                    <div className="mw-admin-caption">{s.urlOrHandle}</div>
                  </td>
                  <td>{s.type}</td>
                  <td>{s.isActive ? "да" : "нет"}</td>
                  <td>{s.autoPublishOptOut ? "выключена" : "по организатору"}</td>
                  <td>{formatDate(s.lastSuccessAt)}</td>
                  <td>
                    <button type="button" className="mw-admin-btn mw-admin-btn--ghost" disabled={busy} onClick={() => unlinkSource(s.id, s.name)}>
                      Отвязать
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mw-admin-inline-form mw-admin-mt-8" style={{ flexWrap: "wrap" }}>
          {sourceOptions === null ? (
            <button type="button" className="mw-admin-btn mw-admin-btn--ghost" onClick={() => void loadSourceOptions()}>
              Привязать источник
            </button>
          ) : (
            <>
              <select className="mw-admin-input" value={sourceToLink} onChange={(e) => setSourceToLink(e.target.value)} style={{ minWidth: 320 }}>
                <option value="">Выберите источник…</option>
                {sourceOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.type}
                    {s.organizer ? ` (сейчас: ${s.organizer.displayName})` : ""}
                  </option>
                ))}
              </select>
              <button type="button" className="mw-admin-btn" disabled={busy || !sourceToLink} onClick={() => void linkSource()}>
                Привязать
              </button>
              <button type="button" className="mw-admin-btn mw-admin-btn--ghost" onClick={() => setSourceOptions(null)}>
                Отмена
              </button>
            </>
          )}
        </div>
      </AdminSectionCard>

      <AdminSectionCard title={`5. Программы (${programs.length})`}>
        {programs.length === 0 ? <p className="mw-admin-muted" style={{ marginTop: 0 }}>Программ нет.</p> : (
          <table className="mw-admin-table">
            <thead>
              <tr>
                <th>Программа</th>
                <th>Даты</th>
                <th>Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.title}</strong>
                    <div className="mw-admin-caption">
                      {p.discipline} · {p.region}
                    </div>
                  </td>
                  <td>
                    {formatDate(p.startDate)} — {formatDate(p.endDate)}
                  </td>
                  <td>
                    {getProgramPublishStatusLabel(p.publishStatus)}
                    {p.publishStatus === "published" && storefrontHidden ? <div className="mw-admin-caption">скрыта: организатор не активен</div> : null}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <Link className="mw-admin-btn mw-admin-btn--ghost" href={`/programs?edit=${p.id}`}>
                      Редактировать
                    </Link>{" "}
                    {p.publishStatus === "published" && WEB_BASE ? (
                      <a className="mw-admin-btn mw-admin-btn--ghost" href={`${WEB_BASE}/program/${p.id}`} target="_blank" rel="noreferrer">
                        На сайте
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AdminSectionCard>

      <AdminSectionCard title="6. Дубли и объединение">
        {similar.length > 0 ? (
          <ul style={{ margin: "0 0 12px", paddingLeft: 18 }}>
            {similar.map((o) => (
              <li key={o.id} style={{ marginBottom: 6 }}>
                <Link href={`/organizers/${o.id}`}>{o.displayName}</Link>{" "}
                <span className="mw-admin-muted">
                  · {getOrganizerVerificationStatusLabel(o.verificationStatus)} · программ: {o.programCount}
                  {o.isIngestionStub ? " · создан автосбором" : ""}
                </span>{" "}
                <button type="button" className="mw-admin-btn mw-admin-btn--ghost" disabled={busy} onClick={() => merge(o.id, o.displayName, organizer.id, organizer.displayName)}>
                  Перенести сюда
                </button>{" "}
                <button type="button" className="mw-admin-btn mw-admin-btn--ghost" disabled={busy} onClick={() => merge(organizer.id, organizer.displayName, o.id, o.displayName)}>
                  Влить эту запись туда
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mw-admin-muted" style={{ marginTop: 0 }}>Похожих по названию организаторов не найдено.</p>
        )}
        <div className="mw-admin-inline-form" style={{ flexWrap: "wrap" }}>
          {mergeOptions === null ? (
            <button type="button" className="mw-admin-btn mw-admin-btn--ghost" onClick={() => void loadMergeOptions()}>
              Объединить с другим организатором…
            </button>
          ) : (
            <>
              <select className="mw-admin-input" value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} style={{ minWidth: 320 }}>
                <option value="">Куда перенести эту запись…</option>
                {mergeOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.displayName} · {getOrganizerVerificationStatusLabel(o.verificationStatus)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="mw-admin-btn"
                disabled={busy || !mergeTarget}
                onClick={() => merge(organizer.id, organizer.displayName, mergeTarget, mergeOptions.find((o) => o.id === mergeTarget)?.displayName ?? "")}
              >
                Влить эту запись
              </button>
              <button type="button" className="mw-admin-btn mw-admin-btn--ghost" onClick={() => setMergeOptions(null)}>
                Отмена
              </button>
            </>
          )}
        </div>
        <p className="mw-admin-caption" style={{ marginBottom: 0 }}>
          Переносятся программы, источники, доказательства, лиды, отзывы и инциденты. Если есть бронирования, платежи или договоры — объединение блокируется.
        </p>
      </AdminSectionCard>
    </main>
  );
}
