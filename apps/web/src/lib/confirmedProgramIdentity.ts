/** Owner-confirmed identity, not an organiser/date-window deduplication rule.
 * Decision: 2026-10-24; both raceenduro posts describe the same event.
 * Keep archival records/source lineage. Never extend this list by heuristics.
 */
const ENDURO_EVENT = Object.freeze({
  canonicalId: "cmulpo3li0011gghl5vz4oq96",
  aliasId: "cmulpn7bz000rgghlvenfi7ln",
  primarySource: "https://t.me/raceenduro/2871",
  additionalSource: "https://t.me/raceenduro/2878",
});

export function confirmedProgramId(id: string): string {
  return id === ENDURO_EVENT.aliasId ? ENDURO_EVENT.canonicalId : id;
}

export function confirmedAdditionalSources(id: string, primarySource: string | null | undefined) {
  if (id !== ENDURO_EVENT.canonicalId || primarySource !== ENDURO_EVENT.primarySource) return [];
  return [{ url: ENDURO_EVENT.additionalSource, label: "Дополнительный пост об этом событии" }];
}
