import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { organizerText, readMyWaveNotes, resolveProgramField } from "./recommendedProgramFields";

describe("organizerText", () => {
  it("скрывает служебные заглушки сбора", () => {
    assert.equal(organizerText("Требует ручного заполнения оператором."), null);
    assert.equal(
      organizerText("Базовая программа и сопровождение организатора. Детальный состав включенного оператор уточняет по источнику перед передачей заявки."),
      null,
    );
  });

  it("оставляет реальный текст организатора", () => {
    assert.equal(organizerText("  Проживание на яхте\nПитание  "), "Проживание на яхте\nПитание");
    assert.equal(organizerText(""), null);
  });
});

describe("readMyWaveNotes", () => {
  it("читает примечания и игнорирует мусор", () => {
    assert.equal(readMyWaveNotes(null), null);
    assert.equal(readMyWaveNotes({ notes: { general: [], accommodation: "" } }), null);
    assert.deepEqual(readMyWaveNotes({ notes: { general: [" Обычно нужен загранпаспорт. ", 5], transfer: "Уточните у организатора." } }), {
      general: ["Обычно нужен загранпаспорт."],
      audience: "",
      accommodation: "",
      transfer: "Уточните у организатора.",
      gear: "",
      cancellation: "",
    });
  });
});

describe("resolveProgramField", () => {
  it("вместо заглушки показывает примечание MyWave", () => {
    const field = resolveProgramField({
      field: "equipment",
      organizerValue: "Требует ручного заполнения оператором.",
      myWaveNote: "Обычно кайт можно взять в аренду на борту.",
    });
    assert.deepEqual(field, { mode: "recommended", text: "Обычно кайт можно взять в аренду на борту." });
  });

  it("данные организатора важнее примечания", () => {
    const field = resolveProgramField({ field: "transfer", organizerValue: "Трансфер из Хургады", myWaveNote: "x" });
    assert.deepEqual(field, { mode: "confirmed", text: "Трансфер из Хургады" });
  });
});
