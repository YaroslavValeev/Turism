import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cardDraftFromProgram, cardPatchFromDraft, type Program } from "./programModel";

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
});
