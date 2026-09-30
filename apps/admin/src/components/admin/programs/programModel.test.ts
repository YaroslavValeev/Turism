import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cardDraftFromProgram,
  cardPatchFromDraft,
  myWaveNoteForField,
  storefrontVisibleFrom,
  type Program,
} from "./programModel";

const program: Program = {
  id: "p1",
  title: "Турнир в Дахабе",
  discipline: "kite",
  region: "Egypt",
  publishStatus: "published",
  intakeSource: null,
  startDate: "2026-10-01T00:00:00.000Z",
  endDate: "2026-10-05T00:00:00.000Z",
  durationDays: 5,
  capacityTotal: null,
  spotsAvailable: null,
  isStarred: false,
  gearRequirements: "Требует ручного заполнения оператором.",
  inclusions: "Проживание",
  media: [],
};

describe("cardDraftFromProgram", () => {
  it("показывает заглушку сбора пустым полем", () => {
    const draft = cardDraftFromProgram(program);
    assert.equal(draft.gearRequirements, "");
    assert.equal(draft.inclusions, "Проживание");
  });

  it("не отправляет нетронутую заглушку в PATCH", () => {
    assert.deepEqual(cardPatchFromDraft(program, cardDraftFromProgram(program)), {});
  });

  it("заполненное поле уходит в PATCH", () => {
    const draft = { ...cardDraftFromProgram(program), gearRequirements: "Гидрокостюм 3/2" };
    assert.deepEqual(cardPatchFromDraft(program, draft), { gearRequirements: "Гидрокостюм 3/2" });
  });

  it("показывает пустым и заглушку «Требует ручной нормализации»", () => {
    assert.equal(cardDraftFromProgram({ ...program, audienceFit: "Требует ручной нормализации оператором." }).audienceFit, "");
  });
});

describe("myWaveNoteForField", () => {
  const withNotes: Program = {
    ...program,
    aiEnrichment: { notes: { gear: "Шлем обычно свой.", accommodation: "Жильё уточните.", transfer: "Трансфер отдельно.", cancellation: "" } },
  };

  it("берёт то же примечание, что и сайт", () => {
    assert.equal(myWaveNoteForField(withNotes, "gearRequirements"), "Шлем обычно свой.");
    assert.equal(myWaveNoteForField(withNotes, "inclusions"), "Жильё уточните. Трансфер отдельно.");
    assert.equal(myWaveNoteForField(withNotes, "cancellationRules"), "");
    assert.equal(myWaveNoteForField(program, "gearRequirements"), "");
  });
});

describe("storefrontVisibleFrom", () => {
  const now = new Date("2026-09-30T12:00:00Z");

  it("программа дальше 6 месяцев появится на сайте за 183 дня до старта", () => {
    assert.equal(storefrontVisibleFrom("2027-09-01T00:00:00.000Z", now)?.toISOString().slice(0, 10), "2027-03-02");
    assert.equal(storefrontVisibleFrom("2026-12-01T00:00:00.000Z", now), null);
  });
});
