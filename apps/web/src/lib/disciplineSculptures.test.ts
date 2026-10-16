import assert from "node:assert/strict";
import test from "node:test";
import { arrangeDisciplineItems, sculptureBounds, sculptureFor } from "./disciplineSculptures";

const labels = ["Unknown", "вейксерф", "горные лыжи", "дикая природа", "кайтсерфинг", "маунтинбайк", "Скалолазание / альпинизм", "ски-тур", "снегоход", "трекинг", "фрирайд", "Фрирайд / скитур", "хели-ски", "экспедиция"];
test("the live categories keep every original action while repeated figures are half a ring apart", () => {
  const source = labels.map((label, index) => ({ label, href: `/?discipline=${index}#programs` }));
  const before = JSON.stringify(source);
  const arranged = arrangeDisciplineItems(source);
  assert.equal(JSON.stringify(source), before);
  assert.equal(arranged.length, source.length - 1);
  assert.equal(arranged[0].label, "вейксерф");
  assert.deepEqual([...arranged].sort((a, b) => a.href.localeCompare(b.href)), source.filter((item) => item.label !== "дикая природа").sort((a, b) => a.href.localeCompare(b.href)));
  const repeated = arranged.flatMap((item, index) => sculptureFor(item.label) === "freeride-snowboard" ? [index] : []);
  assert.ok(Math.min(repeated[1] - repeated[0], arranged.length - repeated[1] + repeated[0]) >= 5);
  for (let index = 0; index < arranged.length; index++) assert.notEqual(sculptureFor(arranged[index].label), sculptureFor(arranged[(index + 1) % arranged.length].label));
});
test("empty, single-item and unknown-category inputs retain valid navigation", () => {
  assert.deepEqual(arrangeDisciplineItems([]), []);
  assert.deepEqual(arrangeDisciplineItems([{ label: "wildlife", href: "/wildlife" }]), []);
  assert.deepEqual(arrangeDisciplineItems([{ label: "Unknown", href: "/unknown" }]), [{ label: "Unknown", href: "/unknown" }]);
  assert.equal(sculptureFor("ski-tour"), "ski-tour");
  assert.equal(sculptureFor("Фрирайд / скитур"), "freeride-snowboard");
});
test("all crop windows stay inside the approved image canvases", () => {
  for (const bounds of Object.values(sculptureBounds)) {
    assert.ok(bounds.width > 0 && bounds.height > 0 && bounds.x >= 0 && bounds.y >= 0);
    assert.ok(bounds.x + bounds.width <= 400 && bounds.y + bounds.height <= 440);
  }
});
