/**
 * Туры «по запросу»: в startDate/endDate лежит окно сезона, а не даты заезда,
 * поэтому вместо диапазона дат показываем сезон.
 */
export type ProgramScheduleFields = {
  scheduleType?: string | null;
  seasonLabel?: string | null;
};

export function isOnRequestProgram(p: ProgramScheduleFields): boolean {
  return p.scheduleType === "on_request";
}

/** «По запросу · сезон июнь–сентябрь» / «По запросу · круглый год». */
export function onRequestLabel(p: ProgramScheduleFields): string {
  const season = p.seasonLabel?.trim();
  if (!season) return "По запросу";
  if (/круглый год/i.test(season)) return "По запросу · круглый год";
  return `По запросу · сезон ${season}`;
}
