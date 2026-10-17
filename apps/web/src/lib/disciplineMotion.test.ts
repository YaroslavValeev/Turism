import assert from "node:assert/strict";
import test from "node:test";
import { advanceDisciplinePosition, disciplinePose, wrapDisciplinePosition } from "./disciplineMotion";

test("continuous rotation covers the same distance at 30, 60 and 120 fps", () => {
  for (const fps of [30, 60, 120]) {
    let position = 0;
    for (let frame = 0; frame < fps * 12; frame++) position = advanceDisciplinePosition(position, 1000 / fps, 13);
    assert.ok(Math.abs(position - 3) < 1e-10);
  }
  assert.equal(advanceDisciplinePosition(0, 1000, 13), 0.25);
  assert.equal(advanceDisciplinePosition(0, 2000, 13), 0.5);
});

test("ring wrapping preserves fractional progress and handles empty or single lists", () => {
  assert.equal(advanceDisciplinePosition(12.75, 2000, 13), 0.25);
  assert.equal(advanceDisciplinePosition(4, 0, 13), 4);
  assert.equal(advanceDisciplinePosition(4, -100, 13), 4);
  assert.equal(wrapDisciplinePosition(-0.25, 13), 12.75);
  assert.equal(advanceDisciplinePosition(0, 4000, 1), 0);
  assert.equal(advanceDisciplinePosition(0, 4000, 0), 0);
});

test("a full revolution has no visible wrap jump or scale cusp at the centre", () => {
  const pose = (position: number) => disciplinePose(0, position, 13, 110, 0.225, 4);
  assert.deepEqual(pose(0.125), pose(13.125));
  assert.equal(pose(6.5 - 0.0001).opacity, 0);
  assert.equal(pose(6.5 + 0.0001).opacity, 0);
  assert.equal(pose(-0.01).scale, pose(0.01).scale);
  assert.ok(Math.abs(pose(0.0001).scale - pose(0).scale) < 1e-8);
  assert.ok(Math.abs(pose(13 - 0.0001).x - pose(0.0001).x) < 0.03);
});
