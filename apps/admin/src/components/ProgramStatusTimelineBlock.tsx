"use client";

import { useState } from "react";
import { adminJson } from "../lib/admin";
import { DomainStatusTimeline, type DomainStatusEventRow } from "./DomainStatusTimeline";

export function ProgramStatusTimelineBlock({ programId }: { programId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<DomainStatusEventRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await adminJson<{ items: DomainStatusEventRow[] }>(
        `/admin/domain-status-events?entity_type=program&entity_id=${encodeURIComponent(programId)}&limit=50`,
      );
      setEvents(Array.isArray(data.items) ? data.items : []);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  return (
    <details
      style={{ marginTop: 8 }}
      onToggle={(e) => {
        const el = e.currentTarget;
        if (el.open && !loaded && !loading) void load();
      }}
    >
      <summary style={{ cursor: "pointer", fontSize: 12, color: "#0f766e" }}>Доменные статус-события</summary>
      <DomainStatusTimeline events={events} loading={loading} error={error} />
    </details>
  );
}
