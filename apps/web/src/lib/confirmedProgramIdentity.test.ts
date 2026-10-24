import test from "node:test";
import assert from "node:assert/strict";
import { confirmedProgramId, confirmedAdditionalSources } from "./confirmedProgramIdentity";

test("only the owner-confirmed alias resolves to the canonical event", () => {
  assert.equal(confirmedProgramId("cmulpn7bz000rgghlvenfi7ln"), "cmulpo3li0011gghl5vz4oq96");
});
for (const id of ["cmulpo3li0011gghl5vz4oq96", "cmufa0ufs00x7l57wkh2ubz1u", "cmugp5smi0006ja9it68jpxue", "cmurkgxr4004krbged2q71wah", "", "../cmulpn7bz000rgghlvenfi7ln", "cmulpn7bz000rgghlvenfi7ln-extra"]) {
  test(`unrelated/canonical/path-like ID is not remapped: ${id}`, () => assert.equal(confirmedProgramId(id), id));
}
test("identity resolution is idempotent", () => {
  const id = confirmedProgramId("cmulpn7bz000rgghlvenfi7ln"); assert.equal(confirmedProgramId(id), id);
});
test("canonical card exposes the second documentary source", () => {
  assert.deepEqual(confirmedAdditionalSources("cmulpo3li0011gghl5vz4oq96", "https://t.me/raceenduro/2871"),
    [{ url: "https://t.me/raceenduro/2878", label: "Дополнительный пост об этом событии" }]);
});
test("changed identity/source cannot inherit another event's attribution", () => {
  assert.deepEqual(confirmedAdditionalSources("other", "https://t.me/raceenduro/2871"), []);
  assert.deepEqual(confirmedAdditionalSources("cmulpo3li0011gghl5vz4oq96", "https://example.invalid/"), []);
  assert.deepEqual(confirmedAdditionalSources("cmulpo3li0011gghl5vz4oq96", null), []);
});
