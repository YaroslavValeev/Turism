'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SPECS, buildReview, readReview, validateArgs } = require('./source-card-review.cjs');

function fixture() {
  const programs = SPECS.map(s => ({
    id: s.id, title: 'fixture', discipline: 'kite', region: 'fixture', exactLocation: null,
    startDate: new Date('2026-10-24T12:00:00Z'), endDate: new Date('2026-10-24T12:00:00Z'),
    durationDays: 1, manualFields: [], updatedAt: new Date('2026-10-01T00:00:00Z'),
    sourceId: s.sourceId, sourceUrl: s.sourceUrl, sourceType: s.sourceType, publishStatus: 'published', [s.field]: s.before,
  }));
  const rawItems = SPECS.map((s, i) => ({
    id: `raw-${i}`, sourceId: s.sourceId, sourceUrl: s.sourceUrl, sourceType: s.sourceType,
    rawText: s.rule === 'enduro' ? 'Классы Золото Серебро Новороссийск' : s.rule === 'red-sea' ? 'Кайт и WING в Красном море' : 'Школа скалолазания в Турции. Скалы Анталии.',
    source: { name: 'Анонсы эндуро гонок' }, normalizedItem: null,
  }));
  return { programs, rawItems };
}

test('four source-backed proposals never authorize writes or change input', () => {
  const f = fixture(); const before = structuredClone(f);
  const result = buildReview(f.programs, f.rawItems);
  assert.equal(result.items.length, 4);
  assert.ok(result.items.every(i => i.status === 'proposed' && !i.datesWillChange));
  assert.equal(result.executionAllowed, false);
  assert.equal(result.items[3].dateReviewRequired, true);
  assert.deepEqual(f, before);
});

for (const field of ['sourceId', 'sourceUrl', 'sourceType']) {
  test(`rejects program ${field} mismatch`, () => {
    const f = fixture(); f.programs[0][field] = 'different';
    assert.equal(buildReview(f.programs, f.rawItems).items[0].status, 'source_mismatch');
  });
  test(`does not accept raw evidence with mismatched ${field}`, () => {
    const f = fixture(); f.rawItems[0][field] = 'different';
    assert.equal(buildReview(f.programs, f.rawItems).items[0].status, 'evidence_missing');
  });
}
test('manual fields are not overwritten even if the old value matches', () => {
  const f = fixture(); f.programs[0].manualFields = ['discipline'];
  assert.equal(buildReview(f.programs, f.rawItems).items[0].status, 'manual_review');
});
test('preserves unrelated manual fields and accepts already-correct values', () => {
  const f = fixture(); f.programs[0].manualFields = ['title']; f.programs[0].discipline = 'enduro';
  assert.equal(buildReview(f.programs, f.rawItems).items[0].status, 'already_matches');
});
test('unknown current values and missing programs require review', () => {
  const f = fixture(); f.programs[0].discipline = 'owner-value'; f.programs.pop();
  const result = buildReview(f.programs, f.rawItems);
  assert.equal(result.items[0].status, 'value_mismatch'); assert.equal(result.items[3].status, 'missing');
});
test('source title alone without raw content is not sufficient evidence', () => {
  const f = fixture(); f.rawItems[0].rawText = 'No event evidence';
  assert.equal(buildReview(f.programs, f.rawItems).items[0].status, 'evidence_missing');
});
test('date differences are flagged but dates are not proposed for replacement', () => {
  const f = fixture(); f.rawItems[0].normalizedItem = { startDate: new Date('2026-11-01'), endDate: null };
  const item = buildReview(f.programs, f.rawItems).items[0];
  assert.equal(item.dateReviewRequired, true); assert.equal(item.field, 'discipline'); assert.equal(item.datesWillChange, false);
});
test('rejects extra or duplicate program identities', () => {
  const f = fixture();
  assert.throws(() => buildReview([...f.programs, f.programs[0]], f.rawItems), /duplicate/);
  assert.throws(() => buildReview([{ ...f.programs[0], id: 'other' }], f.rawItems), /Unexpected/);
});
test('stable snapshot hash changes when a protected field changes', () => {
  const f = fixture(); const a = buildReview(f.programs, f.rawItems).items[0].snapshotSha256;
  f.programs[0].manualFields.push('title');
  assert.notEqual(buildReview(f.programs, f.rawItems).items[0].snapshotSha256, a);
});
test('rejects write flags before a database client can be loaded', () => {
  assert.doesNotThrow(() => validateArgs([]));
  for (const arg of ['--apply', '--rollback', '--help', 'other']) assert.throws(() => validateArgs([arg]), /read-only/);
});
test('sets a read-only repeatable-read transaction before either SELECT', async () => {
  const f = fixture(); const calls = [];
  const prisma = { $transaction: async (fn, options) => {
    assert.equal(options.isolationLevel, 'RepeatableRead');
    return fn({
      $executeRawUnsafe: async sql => { assert.equal(sql, 'SET TRANSACTION READ ONLY'); calls.push('read-only'); },
      program: { findMany: async () => { assert.deepEqual(calls, ['read-only']); calls.push('program'); return f.programs; } },
      rawItem: { findMany: async () => { assert.deepEqual(calls, ['read-only', 'program']); return f.rawItems; } },
    });
  } };
  assert.equal((await readReview(prisma)).executionAllowed, false);
});
test('read-only failure aborts before any data query', async () => {
  await assert.rejects(() => readReview({ $transaction: fn => fn({
    $executeRawUnsafe: async () => { throw new Error('read-only unavailable'); },
    program: { findMany: () => assert.fail('must not query') },
  }) }), /read-only unavailable/);
});
