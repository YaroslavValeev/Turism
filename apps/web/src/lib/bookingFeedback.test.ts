import test from "node:test";
import assert from "node:assert/strict";
import { contactError, bookingFeedback } from "./bookingFeedback";

test("contacts accept supported channels and reject incomplete values", () => {
  for (const value of [
    "+7 (999) 123-45-67",
    "@traveller",
    "person@example.org",
  ])
    assert.equal(contactError(value), null);
  for (const value of ["", "123", "@a", "abc", "person@host", "<script>"])
    assert.ok(contactError(value));
});
test("success requires a persisted booking identifier", () => {
  assert.match(
    bookingFeedback(201, { id: "booking-42" }).success!,
    /booking-42/,
  );
  assert.ok(bookingFeedback(201, {}).error);
  assert.ok(bookingFeedback(500, { error: "internal SQL secret" }).error);
  assert.doesNotMatch(
    bookingFeedback(500, { error: "internal SQL secret" }).error!,
    /SQL|secret/,
  );
});
test("duplicate response refers to existing booking without claiming delivery", () => {
  const result = bookingFeedback(409, { bookingId: "original-42" });
  assert.match(result.success!, /original-42/);
  assert.doesNotMatch(result.success!, /получил|24 час/);
  assert.ok(bookingFeedback(409, {}).error);
});
