'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SPECS, canonical, hash, supports, buildPlan, validatePlan, parseArgs, planRepair, runRepair } = require('./repair-source-card-classifications.cjs');
const clone = x => structuredClone(x);
function fixture() {
  const programs = SPECS.map(s => ({ id: s.id, sourceId: s.sourceId, sourceUrl: s.sourceUrl, sourceType: s.sourceType,
    discipline: 'kite', region: 'Кавказ и др.', [s.field]: s.before, publishStatus: 'published', manualFields: ['title'],
    title: `Fixture ${s.id}`, startDate: new Date('2026-10-29T12:00:00Z'), endDate: new Date('2026-11-08T12:00:00Z'), durationDays: 11,
    updatedAt: new Date('2026-10-01T12:00:00Z'), aiEnrichment: null, mediaOrderPinned: true }));
  const raws = SPECS.map((s, i) => ({ id: `raw-${i}`, sourceId: s.sourceId, sourceUrl: s.sourceUrl, sourceType: s.sourceType,
    rawTitle: 'Классы, Новороссийск; кайт в Красном море; школа скалолазания в Турции, Анталия',
    rawText: 'Fixture documentary evidence', sourceRunId: `run-${i}`, fetchedAt: new Date('2026-10-01T12:00:00Z'), source: { name: 'Анонсы эндуро' } }));
  return { programs, raws };
}
test('fixed scope contains precisely four fields, never dates/status/media', () => {
  assert.deepEqual(SPECS.map(s => s.field), ['discipline', 'discipline', 'region', 'region']);
  assert.ok(Object.isFrozen(SPECS) && SPECS.every(Object.isFrozen));
});
test('plan preserves all fields except approved classification and manual lock', () => {
  const { programs, raws } = fixture(); const plan = validatePlan(buildPlan(programs, raws));
  assert.match(plan.id, /^[a-f0-9]{64}$/);
  for (const [i, item] of plan.items.entries()) {
    const expected = canonical(programs[i]); expected[SPECS[i].field] = SPECS[i].value;
    expected.manualFields = [SPECS[i].field, 'title'].sort();
    assert.deepEqual(item.after, expected);
  }
});
test('hash is deterministic across row order, property order, Date and JSON roundtrip', () => {
  const f = fixture(); const a = buildPlan(f.programs, f.raws);
  assert.equal(buildPlan([...f.programs].reverse(), [...f.raws].reverse()).id, a.id);
  assert.deepEqual(validatePlan(JSON.parse(JSON.stringify(a))), a);
  assert.equal(hash({ b: 2, a: 1 }), hash({ a: 1, b: 2 }));
});
for (const field of ['sourceId', 'sourceUrl', 'sourceType', 'publishStatus', 'discipline']) test(`drift in ${field} blocks whole plan`, () => {
  const f = fixture(); f.programs[0][field] = 'unexpected'; assert.throws(() => buildPlan(f.programs, f.raws));
});
test('manual classification lock is never overwritten', () => {
  const f = fixture(); f.programs[0].manualFields.push('discipline'); assert.throws(() => buildPlan(f.programs, f.raws));
});
test('malformed manual locks fail closed', () => {
  const f = fixture(); f.programs[0].manualFields = null; assert.throws(() => buildPlan(f.programs, f.raws));
});
for (const kind of ['missing', 'duplicate', 'unexpected']) test(`${kind} target is rejected`, () => {
  const f = fixture(); if (kind === 'missing') f.programs.pop();
  else if (kind === 'duplicate') f.programs[3] = f.programs[0]; else f.programs[0].id = 'other';
  assert.throws(() => buildPlan(f.programs, f.raws));
});
for (const key of ['sourceId', 'sourceUrl', 'sourceType', 'rawTitle', 'source']) test(`insufficient evidence (${key}) blocks plan`, () => {
  const f = fixture(); f.raws[0][key] = null; assert.throws(() => buildPlan(f.programs, f.raws));
});
test('new source text or fetched timestamp changes confirmation identity', () => {
  const f = fixture(); const first = buildPlan(f.programs, f.raws).id;
  f.raws[0].rawText += ' new revision'; assert.notEqual(buildPlan(f.programs, f.raws).id, first);
});
test('evidence from a different post is not interchangeable', () => {
  const f = fixture(); assert.equal(supports(SPECS[0], f.raws[1]), false);
});
for (const field of ['startDate', 'publishStatus', 'title', 'manualFields']) test(`tampered after.${field} rejected even with recomputed hash`, () => {
  const f = fixture(); const p = buildPlan(f.programs, f.raws); p.items[0].after[field] = field === 'manualFields' ? [] : 'tampered';
  p.id = hash({ version: p.version, tag: p.tag, items: p.items }); assert.throws(() => validatePlan(p));
});
test('plan hash corruption rejected', () => {
  const f = fixture(); const p = buildPlan(f.programs, f.raws); p.id = '0'.repeat(64); assert.throws(() => validatePlan(p));
});
test('unsupported, unconfirmed and extra CLI flags rejected before DB access', () => {
  for (const args of [[], ['--apply'], ['--force'], ['--plan', '--apply'], ['--apply', 'a', '--confirm', 'no', '--receipt', 'b'], ['--rollback', 'a']]) assert.throws(() => parseArgs(args));
  assert.deepEqual(parseArgs(['--plan']), { mode: 'plan' });
  assert.equal(parseArgs(['--apply', 'p.json', '--confirm', 'a'.repeat(64), '--receipt', 'r.json']).mode, 'apply');
});
test('planning explicitly enters read-only RepeatableRead before any SELECT', async () => {
  const f = fixture(); const calls = [];
  await planRepair({ $transaction: async (fn, options) => {
    assert.equal(options.isolationLevel, 'RepeatableRead');
    return fn({ $executeRawUnsafe: async sql => calls.push(sql),
      program: { findMany: async () => { assert.deepEqual(calls, ['SET TRANSACTION READ ONLY']); return f.programs; } },
      rawItem: { findMany: async () => f.raws } });
  } });
});
test('invalid repair or rollback receipt cannot open write transaction', async () => {
  const f = fixture(); const p = buildPlan(f.programs, f.raws);
  const db = { $transaction: () => { throw new Error('must not connect'); } };
  await assert.rejects(runRepair(db, p, 'rollback', { planId: 'wrong' }), assert.AssertionError);
  const bad = clone(p); bad.id = '0'.repeat(64); await assert.rejects(runRepair(db, bad, 'apply'), assert.AssertionError);
});
