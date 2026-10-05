// ONLY disposable Docker DB. Refuses production names before importing Prisma.
const assert = require('node:assert/strict');
const path = require('node:path');
const { RUNS, CONFIRM, prepare, change } = require('./repair-source-run-links.cjs');
const { snapshot, verify } = require('./verify-source-run-link-repair.cjs');
const url = new URL(process.env.DATABASE_URL || 'file:///missing');
assert.equal(process.env.TRACE_REPAIR_TEST_CONFIRM, 'isolated-fixtures-only');
assert.equal(url.hostname, 'tourism-trace-repair-test-db');
assert.equal(url.pathname, '/trace_repair_test');
const { PrismaClient } = require(path.resolve(process.cwd(), 'node_modules/@prisma/client'));
const prisma = new PrismaClient();
async function main() {
  assert.equal(await prisma.rawItem.count(), 0, 'Refuses a nonempty DB');
  for (const [id, sourceId, count] of RUNS) {
    await prisma.source.create({ data: { id: sourceId, name: 'Isolated repair fixture', type: 'telegram', urlOrHandle: 'internal://repair-fixture' } });
    const startedAt = new Date('2026-09-25T01:00:00Z'), finishedAt = new Date('2026-09-25T01:00:10Z');
    await prisma.sourceRun.create({ data: { id, sourceId, runType: 'collect', status: 'success', startedAt, finishedAt, itemsCreated: count } });
    for (let i = 0; i < count; i++) {
      const rawId = `${id}-${i}`, fetchedAt = new Date('2026-09-25T01:00:01Z');
      await prisma.rawItem.create({ data: { id: rawId, sourceId, sourceType: 'telegram', contentHash: String(i), fetchedAt } });
      await prisma.auditLog.create({ data: { entityType: 'raw_item', entityId: rawId, changedField: 'created', oldValue: null, newValue: rawId, reason: 'ingestion collect from telegram', createdAt: fetchedAt } });
    }
  }
  const plan = await prepare(prisma);
  const before = await snapshot(prisma);
  assert.equal(plan.links.length, 31);
  assert.equal(await prisma.rawItem.count({ where: { sourceRunId: null } }), 31);
  await prisma.$executeRawUnsafe(`CREATE FUNCTION reject_repair_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."changedField" = 'source_run_link_reconstructed' THEN RAISE EXCEPTION 'isolated rollback test'; END IF; RETURN NEW; END; $$`);
  await prisma.$executeRawUnsafe('CREATE TRIGGER reject_repair_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_repair_audit()');
  await assert.rejects(change(prisma, plan, 'apply', CONFIRM));
  assert.equal(await prisma.rawItem.count({ where: { sourceRunId: null } }), 31);
  assert.equal(await prisma.auditLog.count(), 31);
  await prisma.$executeRawUnsafe('DROP TRIGGER reject_repair_audit ON audit_logs');
  await prisma.$executeRawUnsafe('DROP FUNCTION reject_repair_audit()');
  assert.equal((await change(prisma, plan, 'apply', CONFIRM)).changed, 31);
  assert.equal((await change(prisma, plan, 'apply', CONFIRM)).changed, 0);
  assert.equal(await prisma.rawItem.count({ where: { sourceRunId: null } }), 0);
  assert.equal(await prisma.auditLog.count(), 62);
  const after = await snapshot(prisma);
  verify(before, after);
  assert.equal((await change(prisma, plan, 'rollback', CONFIRM)).changed, 31);
  assert.equal((await change(prisma, plan, 'rollback', CONFIRM)).changed, 0);
  assert.equal(await prisma.rawItem.count({ where: { sourceRunId: null } }), 31);
  assert.equal(await prisma.auditLog.count(), 93);
  assert.equal(await prisma.sourceRun.count(), 4);
  assert.equal(await prisma.program.count(), 0);
  assert.deepEqual((await snapshot(prisma)).fingerprints, before.fingerprints);
  await assert.rejects(change(prisma, plan, 'apply', CONFIRM));
  console.log('PASS: real PostgreSQL prepare/apply/idempotence/rollback and audit-trigger failure atomicity');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
