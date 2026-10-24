'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { PRIMARY, DUPLICATE, buildPlan, validatePlan, planMerge, runMerge } = require('./merge-confirmed-enduro-event.cjs');
function fixture() {
  return [PRIMARY, DUPLICATE].map(id => ({ program: { id, sourceId: 'cmot577px003luf5gis5a4048', sourceType: 'telegram', sourceUrl: `https://t.me/raceenduro/${id === PRIMARY ? '2871' : '2878'}`,
    publishStatus: 'published', discipline: 'enduro', region: 'Краснодарский край', exactLocation: 'Новороссийск', durationDays: 1,
    startDate: '2026-10-24T12:00:00.000Z', endDate: '2026-10-24T12:00:00.000Z', manualFields: ['discipline'], organizerId: 'same-owner', updatedAt: '2026-10-24T06:00:00.000Z' },
    media: Array.from({ length: id === PRIMARY ? 1 : 2 }, (_, i) => ({ id: `${id}-${i}`, programId: id, mediaType: 'image', caption: null, position: i, url: `/ingestion-media/tg-raceenduro-${id === PRIMARY ? '2871' : '2878'}-${i}-fixture.jpg` })),
    counts: { bookings: 0, leads: 0, publishedPrograms: 1 } })).sort((a, b) => a.program.id.localeCompare(b.program.id));
}
const evidence = [{ id: 'raw-1', sourceUrl: 'https://t.me/raceenduro/2871', sha256: 'a'.repeat(64) }, { id: 'raw-2', sourceUrl: 'https://t.me/raceenduro/2878', sha256: 'b'.repeat(64) }];
test('plan is bounded to approved pair and roundtrips without changing originals', () => {
  const before = fixture(), saved = structuredClone(before), plan = buildPlan(before, evidence);
  assert.equal(plan.primaryId, PRIMARY); assert.equal(plan.duplicateId, DUPLICATE);
  assert.deepEqual(validatePlan(JSON.parse(JSON.stringify(plan))), plan); assert.deepEqual(before, saved);
});
for (const key of ['sourceId', 'sourceType', 'sourceUrl', 'publishStatus', 'discipline', 'exactLocation', 'durationDays', 'startDate', 'endDate', 'organizerId', 'region']) test(`identity drift ${key} blocks merge`, () => {
  const before = fixture(); before[0].program[key] = 'drift'; assert.throws(() => buildPlan(before, evidence));
});
for (const key of ['leads', 'bookings', 'payments', 'reviews', 'subscriptionDeliveries']) test(`related ${key} block simplistic merge`, () => {
  const before = fixture(); before[0].counts[key] = 1; assert.throws(() => buildPlan(before, evidence));
});
test('extra or missing target is rejected', () => {
  assert.throws(() => buildPlan(fixture().slice(0, 1), evidence)); const rows = fixture(); rows[0].program.id = 'other'; assert.throws(() => buildPlan(rows, evidence));
});
test('edited media cardinality, unsafe references and repeated images are rejected', () => {
  const rows = fixture(); rows[0].media.push(structuredClone(rows[0].media[0])); assert.throws(() => buildPlan(rows, evidence));
  const unsafe = fixture(); unsafe[0].media[0].url = 'https://external.invalid/image.jpg'; assert.throws(() => buildPlan(unsafe, evidence));
});
test('no source proof, corrupted plans or changed canonical ID are accepted', () => {
  assert.throws(() => buildPlan(fixture(), []));
  const p = buildPlan(fixture(), evidence); p.id = '0'.repeat(64); assert.throws(() => validatePlan(p));
  const other = buildPlan(fixture(), evidence); other.primaryId = DUPLICATE; assert.throws(() => validatePlan(other));
});
test('planning is an explicitly read-only transaction', async () => {
  const rows = fixture(); let readOnly = false;
  const raw = evidence.map(e => ({ id: e.id, sourceUrl: e.sourceUrl }));
  await planMerge({ $transaction: async (fn, options) => {
    assert.equal(options.isolationLevel, 'RepeatableRead');
    return fn({ $executeRawUnsafe: async sql => { assert.equal(sql, 'SET TRANSACTION READ ONLY'); readOnly = true; }, rawItem: { findMany: async () => { assert.ok(readOnly); return raw; } },
      program: { findMany: async () => rows.map(r => ({ ...r.program, media: r.media, _count: r.counts })) } });
  } });
});
test('rollback cannot open transaction with another plan receipt', async () => {
  const p = buildPlan(fixture(), evidence);
  await assert.rejects(runMerge({ $transaction: () => { throw new Error('must not connect'); } }, p, 'rollback', { mode: 'apply', planId: 'wrong' }), assert.AssertionError);
});
