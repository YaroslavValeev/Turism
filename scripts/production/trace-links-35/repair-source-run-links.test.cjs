const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RUNS, CONFIRM, prepare, change, validatePlan } = require('./repair-source-run-links.cjs');
const { verify, stable } = require('./verify-source-run-link-repair.cjs');

function fixture() {
  let state = { runs: [], raw: [], audits: [] };
  for (const [id, sourceId, count, sourceType] of RUNS) {
    const startedAt = new Date('2026-09-25T01:00:00Z'), finishedAt = new Date('2026-09-25T01:00:10Z');
    state.runs.push({ id, sourceId, runType: 'collect', status: 'success', startedAt, finishedAt, itemsCreated: count });
    for (let i = 0; i < count; i++) {
      const rawId = `${id}-${i}`, fetchedAt = new Date('2026-09-25T01:00:01Z');
      state.raw.push({ id: rawId, sourceId, sourceType, fetchedAt, sourceRunId: null });
      state.audits.push({ entityType: 'raw_item', entityId: rawId, changedField: 'created', oldValue: null, newValue: rawId, reason: `ingestion collect from ${sourceType}`, createdAt: fetchedAt });
    }
  }
  let fault = null;
  const api = () => ({
    $queryRawUnsafe: async () => [],
    sourceRun: {
      findUnique: async q => { const r = state.runs.find(x => x.id === q.where.id); return r && { ...r, _count: { rawItems: state.raw.filter(x => x.sourceRunId === r.id).length } }; },
      count: async q => state.runs.filter(r => r.id !== q.where.id.not && r.sourceId === q.where.sourceId && ['collect', 'manual'].includes(r.runType) && r.startedAt <= q.where.startedAt.lte && (!r.finishedAt || r.finishedAt >= q.where.OR[0].finishedAt.gte)).length,
    },
    rawItem: {
      findMany: async q => state.raw.filter(r => r.sourceId === q.where.sourceId && r.fetchedAt >= q.where.fetchedAt.gte && r.fetchedAt <= q.where.fetchedAt.lte).sort((a,b) => a.id.localeCompare(b.id)).slice(0, q.take),
      updateMany: async q => {
        if (fault === 'update' && state.raw.filter(x => x.sourceRunId !== null).length === 10) return { count: 0 };
        const row = state.raw.find(r => r.id === q.where.id && r.sourceId === q.where.sourceId && r.sourceRunId === q.where.sourceRunId && +r.fetchedAt === +q.where.fetchedAt);
        if (!row) return { count: 0 }; row.sourceRunId = q.data.sourceRunId; return { count: 1 };
      },
    },
    auditLog: {
      findMany: async q => state.audits.filter(a => a.entityType === q.where.entityType && q.where.entityId.in.includes(a.entityId) && (typeof q.where.changedField === 'string' ? a.changedField === q.where.changedField : q.where.changedField.in.includes(a.changedField))),
      create: async q => { if (fault === 'audit') throw new Error('audit failed'); state.audits.push({ ...q.data, createdAt: new Date() }); return q.data; },
    },
  });
  const prisma = { $transaction: async cb => { const before = structuredClone(state); try { return await cb(api()); } catch (e) { state = before; throw e; } } };
  return { prisma, state: () => state, fault: f => { fault = f; } };
}
test('default plan contains 35 links and does not write', async () => {
  const f = fixture(), before = structuredClone(f.state()); const p = await prepare(f.prisma);
  validatePlan(p); assert.equal(p.links.length, 35); assert.deepEqual(f.state(), before);
});
test('apply is atomic, audited and idempotent; rollback is narrowly scoped and idempotent', async () => {
  const f = fixture(), p = await prepare(f.prisma);
  assert.equal((await change(f.prisma, p, 'apply', CONFIRM)).changed, 35);
  assert.equal(f.state().audits.length, 70);
  assert.equal((await change(f.prisma, p, 'apply', CONFIRM)).changed, 0);
  assert.equal((await change(f.prisma, p, 'rollback', CONFIRM)).changed, 35);
  assert.ok(f.state().raw.every(r => r.sourceRunId === null));
  assert.equal(f.state().audits.length, 105);
  assert.equal((await change(f.prisma, p, 'rollback', CONFIRM)).changed, 0);
  await assert.rejects(change(f.prisma, p, 'apply', CONFIRM), /HISTORY_CONFLICT/);
});
for (const mutation of ['count', 'overlap', 'missingAudit', 'duplicateAudit', 'wrongAudit', 'linkedElsewhere', 'source', 'failedRun', 'wrongType', 'wrongPlatformAudit', 'outsideAuditWindow']) {
  test(`rejects ${mutation} without writes`, async () => {
    const f = fixture(), p = await prepare(f.prisma), s = f.state();
    if (mutation === 'wrongType') s.raw[0].sourceType = 'telegram';
    if (mutation === 'wrongPlatformAudit') s.audits[0].reason = 'ingestion collect from telegram';
    if (mutation === 'outsideAuditWindow') s.audits[0].createdAt = new Date('2026-09-25T02:00:00Z');
    if (mutation === 'count') s.raw.pop();
    if (mutation === 'overlap') s.runs.push({ ...s.runs[0], id: 'overlap' });
    if (mutation === 'missingAudit') s.audits.shift();
    if (mutation === 'duplicateAudit') s.audits.push({ ...s.audits[0] });
    if (mutation === 'wrongAudit') s.audits[0].newValue = 'wrong';
    if (mutation === 'linkedElsewhere') s.raw[0].sourceRunId = 'other';
    if (mutation === 'source') s.runs[0].sourceId = 'other';
    if (mutation === 'failedRun') s.runs[0].status = 'failed';
    const before = structuredClone(s);
    await assert.rejects(change(f.prisma, p, 'apply', CONFIRM)); assert.deepEqual(f.state(), before);
  });
}
for (const fault of ['update', 'audit']) test(`rolls back all partial writes on ${fault} failure`, async () => {
  const f = fixture(), p = await prepare(f.prisma), before = structuredClone(f.state()); f.fault(fault);
  await assert.rejects(change(f.prisma, p, 'apply', CONFIRM)); assert.deepEqual(f.state(), before);
});
test('requires confirmation and untampered saved plan', async () => {
  const f = fixture(), p = await prepare(f.prisma);
  await assert.rejects(change(f.prisma, p, 'apply', 'yes'), /CONFIRMATION/);
  p.links[0].rawId = 'other'; await assert.rejects(change(f.prisma, p, 'apply', CONFIRM), /DIGEST/);
});
test('rollback refuses links changed by another writer', async () => {
  const f = fixture(), p = await prepare(f.prisma); await change(f.prisma, p, 'apply', CONFIRM);
  f.state().raw[0].sourceRunId = 'other'; const before = structuredClone(f.state());
  await assert.rejects(change(f.prisma, p, 'rollback', CONFIRM)); assert.deepEqual(f.state(), before);
});
test('rollback requires this repair audit, not just matching pointers', async () => {
  const f = fixture(), p = await prepare(f.prisma); await change(f.prisma, p, 'apply', CONFIRM);
  f.state().audits = f.state().audits.filter(a => a.changedField === 'created');
  await assert.rejects(change(f.prisma, p, 'rollback', CONFIRM), /REPAIR_NOT_OWNED/);
});

test('verification accepts only the exact pointer delta and unchanged content', () => {
  const before = { fingerprints: { program: { count: 148, sha256: 'same' } }, rawUnlinked: 35, publicationTraceGaps: 0 };
  const after = { ...structuredClone(before), rawUnlinked: 0, publicationTraceGaps: 0 };
  verify(before, after);
  assert.throws(() => verify(before, { ...after, rawUnlinked: 1 }), /RAW_LINK_DELTA/);
  assert.throws(() => verify(before, { ...after, publicationTraceGaps: 1 }), /TRACE_GAPS/);
  after.fingerprints.program.sha256 = 'changed';
  assert.throws(() => verify(before, after), /CONTENT_OR_RUNS_CHANGED/);
});

test('fingerprints canonicalize JSON keys and dates without changing array order', () => {
  assert.deepEqual(stable({ z: 2, a: { y: 1, x: new Date('2026-09-25T00:00:00Z') } }), { a: { x: '2026-09-25T00:00:00.000Z', y: 1 }, z: 2 });
  assert.deepEqual(stable([3, 1]), [3, 1]);
});

test('the old 31-record plan and confirmation cannot be used for the remaining repair', async () => {
  const f = fixture(), p = await prepare(f.prisma);
  await assert.rejects(change(f.prisma, p, 'apply', 'reconstruct-31-existing-source-run-links'), /CONFIRMATION/);
  assert.throws(() => validatePlan({ ...p, version: 1 }), /INVALID_PLAN/);
});

test('rehashing a broadened scope does not bypass the immutable eight-run allowlist', async () => {
  const f = fixture(), p = await prepare(f.prisma);
  p.runs[0].sourceType = 'telegram';
  p.id = require('node:crypto').createHash('sha256').update(JSON.stringify({ version: p.version, release: p.release, runs: p.runs, links: p.links })).digest('hex');
  assert.throws(() => validatePlan(p), /PLAN_SCOPE_CHANGED/);
});
