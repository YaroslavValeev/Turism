export type OrganizerProfile = {
  id: string;
  displayName: string;
  legalStatus: string | null;
  contactEmail: string;
  contactPhone: string | null;
  verificationStatus: string;
  autoPublishApprovedAt: string | null;
  autoPublishApprovedBy: string | null;
  isIngestionStub: boolean;
  createdAt: string;
};

export type OrganizerEvidence = {
  id: string;
  evidenceType: string;
  evidenceUrl: string | null;
  notes: string | null;
  createdAt: string;
};

export type OrganizerSource = {
  id: string;
  name: string;
  type: string;
  urlOrHandle: string;
  isActive: boolean;
  lastSuccessAt: string | null;
  autoPublishOptOut: boolean;
};

export type OrganizerProgram = {
  id: string;
  title: string;
  publishStatus: string;
  reviewStatus: string;
  autoPublished: boolean;
  startDate: string;
  endDate: string;
  discipline: string;
  region: string;
};

export type SimilarOrganizer = {
  id: string;
  displayName: string;
  verificationStatus: string;
  isIngestionStub: boolean;
  programCount: number;
};

export type OrganizerOverview = {
  organizer: OrganizerProfile;
  evidence: OrganizerEvidence[];
  sources: OrganizerSource[];
  programs: OrganizerProgram[];
  similar: SimilarOrganizer[];
  storefrontHidden: boolean;
};

export const VERIFICATION_LADDER = ["listed", "checked", "verified", "trusted_by_platform"] as const;

/** What the operator should confirm before raising the status (docs/VERIFICATION_LADDER.md). */
const NEXT_STEP_HINTS: Record<string, string> = {
  checked: "Сверьте сайт/соцсети и реальные контакты организатора. Приложите ссылку на сайт или заметку о звонке.",
  verified: "Проверьте документы (ИП/ООО, договор, страховка) или прошлые отзывы. Приложите ссылку или заметку.",
  trusted_by_platform: "Нужна история: успешные поездки через MyWave без инцидентов. Опишите основание.",
};

export function nextVerificationStep(status: string): { target: string; hint: string } | null {
  if (status === "paused" || status === "rejected") {
    return { target: "listed", hint: "Вернуть организатора в каталог: программы снова появятся на сайте." };
  }
  const index = (VERIFICATION_LADDER as readonly string[]).indexOf(status);
  const target = index < 0 ? undefined : VERIFICATION_LADDER[index + 1];
  return target ? { target, hint: NEXT_STEP_HINTS[target] ?? "" } : null;
}

export function verificationTone(status: string): "ok" | "warn" | "danger" | "muted" {
  if (status === "trusted_by_platform" || status === "verified") return "ok";
  if (status === "rejected" || status === "paused") return "danger";
  if (status === "listed" || status === "checked") return "warn";
  return "muted";
}

export function canHaveAutoPublish(status: string): boolean {
  return status === "verified" || status === "trusted_by_platform";
}

export type ChecklistItem = { label: string; done: boolean; hint: string };

/** Short «что сделать дальше» list shown at the top of the organizer page. */
export function organizerChecklist(overview: OrganizerOverview): ChecklistItem[] {
  const { organizer, sources, programs } = overview;
  const published = programs.filter((p) => p.publishStatus === "published").length;
  return [
    {
      label: "Реальные контакты",
      done: !organizer.isIngestionStub,
      hint: organizer.isIngestionStub
        ? "Создан автосбором с email-заглушкой: укажите настоящий email или объедините с существующим организатором."
        : "Контакты указаны.",
    },
    {
      label: "Проверка",
      done: organizer.verificationStatus !== "listed" && !overview.storefrontHidden,
      hint: overview.storefrontHidden
        ? "Организатор на паузе или отклонён — его программы скрыты с сайта."
        : organizer.verificationStatus === "listed"
          ? "Поднимите до «Проверен», приложив доказательство."
          : "Статус подтверждён доказательствами.",
    },
    {
      label: "Источник привязан",
      done: sources.length > 0,
      hint: sources.length > 0 ? `Источников: ${sources.length}.` : "Привяжите сайт/канал организатора, чтобы новые программы собирались к нему.",
    },
    {
      label: "Программы на сайте",
      done: published > 0 && !overview.storefrontHidden,
      hint: `Опубликовано ${published} из ${programs.length}.`,
    },
  ];
}
