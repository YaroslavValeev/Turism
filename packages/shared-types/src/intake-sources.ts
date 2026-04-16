/**
 * Program intake source — canonical publish pipeline only (not discovery/scouting).
 * See docs/INGESTION_POLICY.md
 */
export const PROGRAM_INTAKE_SOURCES = [
  "organizer_form",
  "admin_manual",
  "email",
  "telegram",
  "sheets_csv",
  "seed",
] as const;

export type ProgramIntakeSource = (typeof PROGRAM_INTAKE_SOURCES)[number];

const LABELS: Record<ProgramIntakeSource, string> = {
  organizer_form: "Форма организатора на сайте",
  admin_manual: "Вручную в админке",
  email: "Письмо администратору",
  telegram: "Telegram / мессенджер (intake)",
  sheets_csv: "Импорт Sheets / CSV (trusted)",
  seed: "Сид / тестовые данные",
};

export function isProgramIntakeSource(value: string | null | undefined): value is ProgramIntakeSource {
  return value != null && (PROGRAM_INTAKE_SOURCES as readonly string[]).includes(value);
}

export function getProgramIntakeSourceLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return isProgramIntakeSource(value) ? LABELS[value] : value;
}
