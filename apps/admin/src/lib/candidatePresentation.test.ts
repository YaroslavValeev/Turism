import test from "node:test";
import assert from "node:assert/strict";
import { candidateDate, candidateHeading, candidateMedia } from "./candidatePresentation";

test("long source captions have a bounded display heading without modifying the original", () => {
  const source = "Сёрфинг на Хайнане. " + "Подробности тренировки #сёрфинг ".repeat(50);
  const heading = candidateHeading(source);
  assert.ok(heading.length <= 120);
  assert.ok(heading.endsWith("…"));
  assert.ok(source.length > 1000);
  assert.equal(candidateHeading("Кэмп на Алтае"), "Кэмп на Алтае");
  assert.equal(candidateHeading(null), "Название не указано");
});
test("original media order, local references and explicit extensionless video type survive", () => {
  assert.deepEqual(candidateMedia("/ingestion-media/original.webp", [
    { url: "https://example.org/asset?id=2", mediaType: "video" },
    { url: "/ingestion-media/original.webp" },
    "//example.org/photo.jpg", "javascript:alert(1)", "https://telegram.org/img/emoji/40.png",
  ]), [
    { url: "/ingestion-media/original.webp", kind: "image" },
    { url: "https://example.org/asset?id=2", kind: "video" },
    { url: "https://example.org/photo.jpg", kind: "image" },
  ]);
});
test("a cover incorrectly identifying a video does not override explicit metadata", () => {
  assert.deepEqual(candidateMedia("https://example.org/media", [{ url: "https://example.org/media", type: "video" }]), [{ url: "https://example.org/media", kind: "video" }]);
  assert.deepEqual(candidateMedia(null, null), []);
  assert.equal(candidateMedia(null, Array.from({ length: 20 }, (_, i) => `/image-${i}.jpg`)).length, 12);
});
test("missing and invalid dates remain explicit and calendar dates do not shift time zones", () => {
  assert.equal(candidateDate(null), "Дата не указана");
  assert.equal(candidateDate("broken"), "Дата требует проверки");
  assert.match(candidateDate("2026-11-01T00:00:00Z"), /1 ноября 2026/);
});
