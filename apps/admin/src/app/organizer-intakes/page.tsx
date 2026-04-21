"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminJson } from "../../lib/admin";
import { AdminNav } from "../../components/AdminNav";

type IntakeRow = {
  id: string;
  intakeType: string;
  contactName: string;
  contactEmail: string;
  programTitle: string | null;
  discipline: string | null;
  region: string | null;
  processingStatus: string;
  linkedProgramId: string | null;
  createdAt: string;
};

type ListResponse = {
  items: IntakeRow[];
  total: number;
  limit: number;
  offset: number;
};

const STATUS_LABELS: Record<string, string> = {
  new: "Новая",
  in_review: "В работе",
  draft_created: "Черновик программы",
  dismissed: "Отклонена",
};

export default function OrganizerIntakesListPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const q = new URLSearchParams();
        if (filterType) q.set("intake_type", filterType);
        if (filterStatus) q.set("processing_status", filterStatus);
        q.set("limit", "50");
        const res = await adminJson<ListResponse>(`/admin/organizer-intakes?${q.toString()}`);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ошибка загрузки");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filterType, filterStatus]);

  return (
    <main style={{ padding: 24 }}>
      <AdminNav current="/organizer-intakes" />
      <h1>Заявки организаторов (публичный intake)</h1>
      <p style={{ color: "#444", maxWidth: "72ch" }}>
        Заявки с лендинга и мастера программы. Создание черновика программы из заявки доступно, если в <code>meta</code> есть wizard v2 — иначе
        переносите данные вручную через «Программы».
      </p>
      <p>
        <label>
          Тип:{" "}
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ padding: 6 }}>
            <option value="">Все</option>
            <option value="program_submission">program_submission</option>
            <option value="verification_inquiry">verification_inquiry</option>
          </select>
        </label>{" "}
        <label style={{ marginLeft: 12 }}>
          Статус обработки:{" "}
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: 6 }}>
            <option value="">Все</option>
            <option value="new">Новая</option>
            <option value="in_review">В работе</option>
            <option value="draft_created">Черновик создан</option>
            <option value="dismissed">Отклонена</option>
          </select>
        </label>
      </p>
      {loading && <p>Загрузка…</p>}
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
      {!loading && data && (
        <>
          <p style={{ color: "#666" }}>
            Всего: {data.total}. Показано: {data.items.length}.
          </p>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #333" }}>
                <th style={{ textAlign: "left", padding: 8 }}>Создана</th>
                <th style={{ textAlign: "left", padding: 8 }}>Тип</th>
                <th style={{ textAlign: "left", padding: 8 }}>Контакт</th>
                <th style={{ textAlign: "left", padding: 8 }}>Программа</th>
                <th style={{ textAlign: "left", padding: 8 }}>Статус</th>
                <th style={{ textAlign: "left", padding: 8 }}>Программа (draft)</th>
                <th style={{ textAlign: "left", padding: 8 }}></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid #ccc" }}>
                  <td style={{ padding: 8, whiteSpace: "nowrap" }}>{new Date(row.createdAt).toLocaleString("ru-RU")}</td>
                  <td style={{ padding: 8 }}>{row.intakeType}</td>
                  <td style={{ padding: 8 }}>
                    <div>{row.contactName}</div>
                    <div style={{ fontSize: 12, color: "#666" }}>{row.contactEmail}</div>
                  </td>
                  <td style={{ padding: 8 }}>
                    <div>{row.programTitle ?? "—"}</div>
                    <div style={{ fontSize: 12, color: "#666" }}>
                      {row.discipline ?? ""} {row.region ? `· ${row.region}` : ""}
                    </div>
                  </td>
                  <td style={{ padding: 8 }}>
                    <div>{STATUS_LABELS[row.processingStatus] ?? row.processingStatus}</div>
                  </td>
                  <td style={{ padding: 8 }}>
                    {row.linkedProgramId ? (
                      <Link href={`/programs?program=${encodeURIComponent(row.linkedProgramId)}`} title={row.linkedProgramId}>
                        Открыть в списке программ
                      </Link>
                    ) : (
                      <span style={{ color: "#999" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: 8 }}>
                    <Link href={`/organizer-intakes/${row.id}`}>Открыть</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.items.length === 0 && <p>Нет записей по фильтру.</p>}
        </>
      )}
    </main>
  );
}
