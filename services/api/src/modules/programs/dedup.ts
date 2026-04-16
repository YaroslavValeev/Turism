export type ProgramDedupShape = {
  id: string;
  title: string;
  discipline: string;
  region: string;
  exactLocation: string | null;
  startDate: Date;
  endDate: Date;
  organizerId?: string | null;
  organizerName?: string | null;
  priceFromRub?: number | null;
  capacityTotal?: number | null;
  spotsAvailable?: number | null;
  isStarred?: boolean | null;
  media?: readonly unknown[];
  createdAt?: Date;
  updatedAt?: Date;
};

function normalizeDedupToken(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/&nbsp;/g, " ")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim()
    .replace(/\s+/g, "-");
}

function normalizeProgramTitleForDedup(value: string): string {
  return normalizeDedupToken(
    value
      .replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g, " ")
      .replace(/\b\d{1,2}\.\d{2}\.\d{4}\b/g, " ")
      .replace(/\b\d{1,2}\s*(?:-|–|—)\s*\d{1,2}\b/g, " ")
      .replace(/\b\d{4}\b/g, " "),
  );
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function buildProgramDedupKey(program: ProgramDedupShape): string {
  const title = normalizeProgramTitleForDedup(program.title) || "untitled";
  const discipline = normalizeDedupToken(program.discipline) || "unknown-discipline";
  const region = normalizeDedupToken(program.region) || "unknown-region";
  const location = normalizeDedupToken(program.exactLocation) || "unknown-location";
  return [discipline, dateKey(program.startDate), dateKey(program.endDate), region, location, title].join("|");
}

function completenessScore(program: ProgramDedupShape): number {
  return [
    program.isStarred ? 8 : 0,
    program.priceFromRub != null ? 4 : 0,
    program.exactLocation ? 2 : 0,
    program.capacityTotal != null ? 1 : 0,
    program.spotsAvailable != null ? 1 : 0,
    program.media?.length ? 2 : 0,
  ].reduce((sum, value) => sum + value, 0);
}

export function pickPreferredProgram<T extends ProgramDedupShape>(current: T, next: T): T {
  const currentScore = completenessScore(current);
  const nextScore = completenessScore(next);
  if (nextScore !== currentScore) return nextScore > currentScore ? next : current;

  const currentCreatedAt = current.createdAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const nextCreatedAt = next.createdAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (nextCreatedAt !== currentCreatedAt) return nextCreatedAt < currentCreatedAt ? next : current;

  const currentUpdatedAt = current.updatedAt?.getTime() ?? 0;
  const nextUpdatedAt = next.updatedAt?.getTime() ?? 0;
  return nextUpdatedAt > currentUpdatedAt ? next : current;
}

export function dedupeProgramsByEventKey<T extends ProgramDedupShape>(programs: T[]): T[] {
  const preferredByKey = new Map<string, T>();
  for (const program of programs) {
    const key = buildProgramDedupKey(program);
    const existing = preferredByKey.get(key);
    preferredByKey.set(key, existing ? pickPreferredProgram(existing, program) : program);
  }

  return programs.filter((program) => preferredByKey.get(buildProgramDedupKey(program))?.id === program.id);
}
