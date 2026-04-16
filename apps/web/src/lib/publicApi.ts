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
