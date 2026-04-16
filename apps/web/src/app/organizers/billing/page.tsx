"use client";

import { useState } from "react";
import {
  getOrganizerBillingStatusLabel,
  getOrganizerContractStatusLabel,
  getOrganizerOnboardingStatusLabel,
  getOrganizerPrivilegeStatusLabel,
} from "@mywave/shared-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Privileges = {
  organizerId: string;
  onboardingStatus: string;
  billingStatus: string;
  privilegeStatus: string;
  contractStatus: string | null;
};

type BillingProfile = {
  legalName?: string | null;
  legalType?: string | null;
  inn?: string | null;
  contactEmail?: string | null;
  billingStatus: string;
};

export default function OrganizerBillingPage() {
  const [organizerId, setOrganizerId] = useState("");
  const [privileges, setPrivileges] = useState<Privileges | null>(null);
  const [profile, setProfile] = useState<BillingProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [privilegesRes, profileRes] = await Promise.all([
        fetch(`${API_URL}/organizers/${encodeURIComponent(organizerId)}/privileges`),
        fetch(`${API_URL}/organizers/${encodeURIComponent(organizerId)}/billing-profile`),
      ]);
      if (!privilegesRes.ok) {
        const data = await privilegesRes.json().catch(() => ({}));
        throw new Error(data.error ?? "Не удалось получить статус привилегий");
      }
      setPrivileges(await privilegesRes.json());
      if (profileRes.ok) {
        setProfile(await profileRes.json());
      } else {
        setProfile(null);
      }
    } catch (e) {
      setPrivileges(null);
      setProfile(null);
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mw-container" style={{ paddingTop: 24, paddingBottom: 40 }}>
      <h1 className="mw-h2">Договор и реквизиты</h1>
      <p className="mw-lead" style={{ maxWidth: 760 }}>
        MVP режим для организатора: read-only просмотр статусов договора, подключения billing и привилегий.
      </p>
      <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap", marginBottom: 20 }}>
        <label>
          Organizer ID
          <input
            value={organizerId}
            onChange={(e) => setOrganizerId(e.target.value)}
            style={{ display: "block", minWidth: 320, padding: 8 }}
            placeholder="Введите organizerId"
          />
        </label>
        <button
          onClick={load}
          disabled={!organizerId || loading}
          className="mw-btn mw-btn--primary"
          type="button"
        >
          {loading ? "Загрузка..." : "Проверить"}
        </button>
      </div>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {privileges && (
        <section className="mw-card" style={{ marginBottom: 16 }}>
          <h2 className="mw-h3">Статус привилегий</h2>
          <p>Onboarding: {getOrganizerOnboardingStatusLabel(privileges.onboardingStatus)}</p>
          <p>Billing: {getOrganizerBillingStatusLabel(privileges.billingStatus)}</p>
          <p>Privilege: {getOrganizerPrivilegeStatusLabel(privileges.privilegeStatus)}</p>
          <p>
            Contract:{" "}
            {privileges.contractStatus
              ? getOrganizerContractStatusLabel(privileges.contractStatus)
              : "Нет договора"}
          </p>
        </section>
      )}
      {profile && (
        <section className="mw-card">
          <h2 className="mw-h3">Реквизиты</h2>
          <p>Юр. форма: {profile.legalType ?? "—"}</p>
          <p>Юр. лицо: {profile.legalName ?? "—"}</p>
          <p>ИНН: {profile.inn ?? "—"}</p>
          <p>Email для биллинга: {profile.contactEmail ?? "—"}</p>
        </section>
      )}
    </main>
  );
}
