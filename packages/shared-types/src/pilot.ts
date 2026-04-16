export const PILOT_DISCIPLINE = "Wakesurf";
export const PILOT_REGION = "Krasnodar";
export const PILOT_SCOPE_LABEL = `${PILOT_DISCIPLINE} + ${PILOT_REGION}`;

export function isPilotProgramScope(discipline: string | null | undefined, region: string | null | undefined): boolean {
  return String(discipline ?? "").trim().toLowerCase() === PILOT_DISCIPLINE.toLowerCase()
    && String(region ?? "").trim().toLowerCase() === PILOT_REGION.toLowerCase();
}
