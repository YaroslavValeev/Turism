"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ConversionDraftsSummary } from "../components/ConversionDraftsSummary";
import type { ConversionDraftsStats } from "../components/conversionDraftsStatsTypes";
import { adminJson, getAdminToken } from "../lib/admin";

export default function AdminHome() {
  const [stats, setStats] = useState<ConversionDraftsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      window.location.href = "/login";
      return;
    }
    setError("");
    adminJson<ConversionDraftsStats>("/admin/conversion-drafts/stats/summary")
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (typeof window !== "undefined" && !getAdminToken()) {
    return <p>Перенаправляем…</p>;
  }

  return (
    <main style={{ padding: 24, maxWidth: 900 }}>
      <h1 style={{ marginTop: 0 }}>Админка MyWave Travel</h1>
      <p style={{ marginBottom: 20 }}>
        <Link href="/organizers">Организаторы</Link>
        {" · "}
        <Link href="/programs">Программы</Link>
        {" · "}
        <Link href="/admin/economics">Economics</Link>
        {" · "}
        <Link href="/admin/conversion-drafts">Conversion drafts</Link>
      </p>

      <ConversionDraftsSummary stats={stats} loading={loading} error={error} />

      <p style={{ color: "#555", fontSize: 14 }}>
        Сводка conversion drafts — очередь owner approval; подробности в разделе conversion drafts.
      </p>
    </main>
  );
}
