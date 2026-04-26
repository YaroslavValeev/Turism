const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function getPublicApiUrl(): string {
  return API_URL;
}

export type OrganizerIntakePayload = {
  intakeType: "program_submission" | "verification_inquiry";
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  organization?: string;
  programTitle?: string;
  discipline?: string;
  region?: string;
  plannedDates?: string;
  message?: string;
  links?: string;
};

export async function postOrganizerIntake(payload: OrganizerIntakePayload): Promise<{ id: string; ok: boolean }> {
  const res = await fetch(`${API_URL}/public/organizer-intake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; ok?: boolean; error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Ошибка ${res.status}`);
  }
  if (!data.id) {
    throw new Error("Пустой ответ сервера");
  }
  return { id: data.id, ok: true };
}

export type PublicSubscriptionPayload = {
  email?: string;
  telegramUsername?: string;
  discipline?: string;
  region?: string;
  channelEmail?: boolean;
  channelTelegram?: boolean;
  emailOptIn?: boolean;
  telegramOptIn?: boolean;
  consent?: boolean;
  source?: string;
  utm?: Record<string, string>;
};

export type PublicSubscriptionResponse = {
  id: string;
  ok: boolean;
  created: boolean;
  message?: string;
  tgOptInUrl?: string | null;
  tgGroupInviteUrl?: string | null;
};

export async function postPublicSubscription(payload: PublicSubscriptionPayload): Promise<PublicSubscriptionResponse> {
  const res = await fetch(`${API_URL}/public/subscriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as PublicSubscriptionResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Ошибка ${res.status}`);
  }
  if (!data.id) {
    throw new Error("Пустой ответ сервера");
  }
  return {
    id: data.id,
    ok: true,
    created: Boolean(data.created),
    message: data.message,
    tgOptInUrl: data.tgOptInUrl ?? null,
    tgGroupInviteUrl: data.tgGroupInviteUrl ?? null,
  };
}
