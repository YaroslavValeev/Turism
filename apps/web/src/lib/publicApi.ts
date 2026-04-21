const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function getPublicApiUrl(): string {
  return API_URL;
}

export type SupplyTrack = "standard" | "verified_style";

export type ProgramDraftV2 = {
  exactLocation: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  levelRequired: string;
  riskLevel: string;
  gearRequirements: string;
  medicalLimitations: string;
  cancellationRules: string;
  audienceFit: string;
  inclusions: string;
  exclusions: string;
  itineraryDayByDay: string;
  formatType: string;
  priceFromRub: number | null;
  currency: string;
  organizerDisplayName: string;
  trustReason: string;
  reviewsSummary: string;
  whatHappensAfterBooking: string;
  cta: string;
};

export type ProgramIntakeMetaV2 = {
  wizardVersion: 2;
  supplyTrack: SupplyTrack;
  programDraft: ProgramDraftV2;
};

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
  meta?: ProgramIntakeMetaV2 | Record<string, unknown>;
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

export type ProgramPublishHints = {
  version: 1;
  baseline: { missingToken: string; hintTitleRu: string; hintBodyRu: string }[];
  verifiedExtra: { missingToken: string; hintTitleRu: string; hintBodyRu: string }[];
};

export async function fetchProgramPublishHints(): Promise<ProgramPublishHints | null> {
  try {
    const res = await fetch(`${API_URL}/public/program-publish-hints`, { method: "GET" });
    if (!res.ok) return null;
    return (await res.json()) as ProgramPublishHints;
  } catch {
    return null;
  }
}
