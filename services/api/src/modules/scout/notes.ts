import { SCOUT_SCHEMA_VERSION, SCOUT_SCHEMA_VERSION_V2, type ScoutCandidate } from "./candidate";

/** Matches SourceProposal.notes storage limit in sources/sourceProposal.ts. */
export const NOTES_MAX_LENGTH = 2_000;

export function batchNotesHeader(batchId: string): string {
  return `OSINT discovery ${batchId}`;
}

/** v1 output must stay byte-identical: Wave 1 proposals are already reviewed against it. */
export function composeNotes(item: ScoutCandidate, batchHeader: string, schemaVersion: number = SCOUT_SCHEMA_VERSION): string {
  const isV2 = schemaVersion === SCOUT_SCHEMA_VERSION_V2;
  const parts = [
    batchHeader,
    isV2 ? `зона=${item.scoutArea}` : null,
    `регион=${item.region}`,
    `тип=${item.kind}`,
    `дисциплины=${item.disciplines.join(", ")}`,
    `OSINT score=${item.osintScore}/5`,
    item.keyPerson ? `ключевая персона=${item.keyPerson}${item.role ? ` (${item.role})` : ""}` : "ключевая персона=требует обогащения",
    item.legal?.registry ? `реестр=${item.legal.registry}` : "реестр=требует проверки",
    item.legal?.inn ? `ИНН=${item.legal.inn}` : null,
    item.seasonality ? `сезонность=${item.seasonality}` : null,
    item.reputation ? `репутация=${item.reputation}` : null,
    item.partners?.length ? `партнеры=${item.partners.join(", ")}` : null,
    `evidence=${item.evidence.join(" | ")}`,
  ].filter(Boolean);
  return parts.join("; ");
}

export function buildNotes(item: ScoutCandidate, batchHeader: string, schemaVersion: number = SCOUT_SCHEMA_VERSION): string {
  return composeNotes(item, batchHeader, schemaVersion).slice(0, NOTES_MAX_LENGTH);
}
