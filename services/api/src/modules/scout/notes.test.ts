import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { loadScoutBatch, type ScoutCandidate } from "./candidate";
import { NOTES_MAX_LENGTH, batchNotesHeader, buildNotes } from "./notes";

const WAVE1_PATH = fileURLToPath(new URL("../../../prisma/source_proposals_osint_2026-09-29.json", import.meta.url));

describe("buildNotes", () => {
  it("produces the legacy Wave 1 notes for the first candidate", async () => {
    const batch = await loadScoutBatch(WAVE1_PATH);
    const notes = buildNotes(batch.candidates[0], batchNotesHeader(batch.batchId));

    expect(notes).toBe(
      [
        "OSINT discovery 2026-09-29",
        "регион=Камчатка",
        "тип=туроператор/горно-спортивная база",
        "дисциплины=хели-ски, фрирайд, активные туры",
        "OSINT score=5/5",
        "ключевая персона=требует обогащения",
        "реестр=РТО 021610",
        "ИНН=4101109668",
        "сезонность=круглый год; хели-ски зимой/весной",
        "репутация=публичный профиль и отзывы на сайте; независимые отзывы проверить",
        `evidence=${batch.candidates[0].evidence.join(" | ")}`,
      ].join("; "),
    );
  });

  it("matches the pre-Scout CLI output for every Wave 1 candidate", async () => {
    const batch = await loadScoutBatch(WAVE1_PATH);
    const legacyBuildNotes = (item: ScoutCandidate): string =>
      [
        "OSINT discovery 2026-09-29",
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
      ]
        .filter(Boolean)
        .join("; ")
        .slice(0, 2_000);

    for (const item of batch.candidates) {
      expect(buildNotes(item, batchNotesHeader(batch.batchId))).toBe(legacyBuildNotes(item));
    }
  });

  const v2Item: ScoutCandidate = {
    scoutArea: "sheregesh",
    region: "Кемеровская область — Кузбасс",
    name: "Sheregesh Freeride School",
    url: "https://sheregesh-school.ru/",
    organizerKinds: ["school"],
    kind: "школа",
    disciplines: ["freeride", "ski-tour"],
    rawDisciplines: ["фрирайд", "скитур"],
    formats: ["course"],
    osintScore: 4,
    legal: { inn: "4205000000" },
    evidence: ["https://sheregesh-school.ru/about"],
  };

  it("v2 notes add the zone line and canonical discipline ids", () => {
    expect(buildNotes(v2Item, batchNotesHeader("wave2-2026-10-05"), 2)).toBe(
      [
        "OSINT discovery wave2-2026-10-05",
        "зона=sheregesh",
        "регион=Кемеровская область — Кузбасс",
        "тип=школа",
        "дисциплины=freeride, ski-tour",
        "OSINT score=4/5",
        "ключевая персона=требует обогащения",
        "реестр=требует проверки",
        "ИНН=4205000000",
        "evidence=https://sheregesh-school.ru/about",
      ].join("; "),
    );
  });

  it("v1 layout ignores scoutArea even if a row carries it", () => {
    const notes = buildNotes(v2Item, batchNotesHeader("b"));
    expect(notes).not.toContain("зона=");
    expect(notes).toBe(buildNotes(v2Item, batchNotesHeader("b"), 1));
  });

  it("truncates to the SourceProposal notes limit", () => {
    const notes = buildNotes(
      {
        region: "Алтай",
        name: "x",
        url: "https://x.ru",
        kind: "школа",
        disciplines: ["фрирайд"],
        osintScore: 3,
        keyPerson: "Иван",
        role: "основатель",
        evidence: ["https://x.ru/" + "a".repeat(3_000)],
      },
      batchNotesHeader("2026-10-01"),
    );
    expect(notes).toHaveLength(NOTES_MAX_LENGTH);
    expect(notes.startsWith("OSINT discovery 2026-10-01; регион=Алтай; тип=школа")).toBe(true);
    expect(notes).toContain("ключевая персона=Иван (основатель)");
  });
});
