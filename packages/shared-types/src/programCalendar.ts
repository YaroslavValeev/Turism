/**
 * Календарь программы: единая формула длительности по датам (UTC, включительно).
 * Источник истины для API, publish gate и предпросмотра в админке.
 */

/** Включительно по календарным дням в UTC (один и тот же календарный день старта и конца = 1 дн.). */
export function inclusiveDurationDaysUTC(start: Date, end: Date): number {
  const s = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const e = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  if (e < s) {
    throw new Error("endDate must be on or after startDate");
  }
  return Math.floor((e - s) / 86400000) + 1;
}
