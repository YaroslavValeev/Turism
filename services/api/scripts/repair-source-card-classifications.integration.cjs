'use strict';
// Never run against production: the same hostname/database/confirmation guard as admin QA.
const assert = require('node:assert/strict');
require('./admin-card-qa-guard.cjs').assertAdminCardQaTarget(process.env);
const { prisma } = require('../dist/lib/prisma.js');
const { SPECS, TAG, ACTOR, canonical, hash, planRepair, runRepair } = require('./repair-source-card-classifications.cjs');
global.fetch = async () => { throw new Error('No external I/O permitted'); };
const ids = SPECS.map(s => s.id);
const report = [];
async function scenario(name, fn) { await fn(); report.push({ name, passed: true }); }
async function rows() { return canonical(await prisma.program.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } })); }
const content = array => array.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'updatedAt')));
async function main() {
  assert.equal(await prisma.program.count({ where: { id: { in: ids } } }), 0, 'Fixture target IDs already exist');
  const organizer = await prisma.organizer.create({ data: { displayName: 'Isolated classification repair fixture', contactEmail: 'classification-qa@example.invalid', verificationStatus: 'listed' } });
  for (const spec of SPECS) {
    await prisma.source.upsert({ where: { id: spec.sourceId }, create: { id: spec.sourceId, type: spec.sourceType,
      name: spec.rule === 'enduro' ? 'Анонсы эндуро' : 'QA evidence', urlOrHandle: spec.sourceUrl }, update: {} });
    await prisma.program.create({ data: { id: spec.id, organizerId: organizer.id, title: `Fixture ${spec.id}`, discipline: 'kite', region: 'Кавказ и др.',
      [spec.field]: spec.before, sourceId: spec.sourceId, sourceUrl: spec.sourceUrl, sourceType: spec.sourceType,
      startDate: new Date('2026-10-29T12:00:00Z'), endDate: new Date('2026-11-08T12:00:00Z'), durationDays: 11, publishStatus: 'published',
      manualFields: ['title'], mediaOrderPinned: true } });
    await prisma.rawItem.create({ data: { sourceId: spec.sourceId, sourceUrl: spec.sourceUrl, sourceType: spec.sourceType, contentHash: hash(spec),
      rawText: 'Классы, Новороссийск. Кайт в Красном море. Школа скалолазания в Турции, Анталия.' } });
    await prisma.programMedia.create({ data: { programId: spec.id, url: 'https://example.invalid/documentary-fixture.webp', mediaType: 'image', position: 1 } });
  }
  const original = await rows();
  const plan = await planRepair(prisma);
  const auditCount = () => prisma.auditLog.count({ where: { changedBy: ACTOR } });
  await scenario('plan is read-only', async () => { assert.deepEqual(await rows(), original); assert.equal(await auditCount(), 0); });
  await scenario('manual edit after plan blocks all four updates', async () => {
    await prisma.program.update({ where: { id: ids[3] }, data: { title: 'Concurrent editor' } });
    const before = await rows(); await assert.rejects(runRepair(prisma, plan, 'apply')); assert.deepEqual(await rows(), before); assert.equal(await auditCount(), 0);
    await prisma.program.update({ where: { id: ids[3] }, data: { title: original.find(p => p.id === ids[3]).title } });
  });
  const freshPlan = await planRepair(prisma);
  await scenario('audit insertion failure aborts entire database transaction', async () => {
    // Inject at the Prisma call boundary, still using a real PostgreSQL transaction.
    const db = { $transaction: (fn, options) => prisma.$transaction(tx => fn(new Proxy(tx, {
      get(target, property) { if (property === 'auditLog') return { ...target.auditLog, create: async () => { throw new Error('Injected audit failure'); } }; return target[property]; },
    })), options) };
    const before = await rows(); await assert.rejects(runRepair(db, freshPlan, 'apply')); assert.deepEqual(await rows(), before); assert.equal(await auditCount(), 0);
  });
  let receipt;
  await scenario('exact apply changes four fields plus manual locks, audited atomically', async () => {
    receipt = await runRepair(prisma, freshPlan, 'apply'); assert.equal(receipt.changed, 4); assert.equal(await auditCount(), 4);
    for (const spec of SPECS) {
      const row = receipt.after.find(p => p.id === spec.id); assert.equal(row[spec.field], spec.value); assert.ok(row.manualFields.includes(spec.field));
      assert.equal(row.startDate, '2026-10-29T12:00:00.000Z'); assert.equal(row.endDate, '2026-11-08T12:00:00.000Z'); assert.equal(row.publishStatus, 'published');
    }
    assert.equal(receipt.protected.programMedia.count >= 4, true);
  });
  await scenario('repeated apply is a no-op without duplicate audit', async () => {
    const before = await rows(); assert.equal((await runRepair(prisma, freshPlan, 'apply')).changed, 0); assert.deepEqual(await rows(), before); assert.equal(await auditCount(), 4);
  });
  await scenario('tampered receipt cannot rollback', async () => {
    const bad = structuredClone(receipt); bad.after[0].title = 'Tampered'; const before = await rows();
    await assert.rejects(runRepair(prisma, freshPlan, 'rollback', bad)); assert.deepEqual(await rows(), before);
  });
  await scenario('post-apply operator change prevents destructive rollback', async () => {
    await prisma.program.update({ where: { id: ids[0] }, data: { title: 'Later operator edit' } });
    const before = await rows(); await assert.rejects(runRepair(prisma, freshPlan, 'rollback', receipt)); assert.deepEqual(await rows(), before);
    const saved = receipt.after.find(p => p.id === ids[0]);
    // Isolated fixture only: restore exact timestamp so remaining rollback tests use the committed receipt.
    await prisma.program.update({ where: { id: ids[0] }, data: { title: saved.title, updatedAt: new Date(saved.updatedAt) } });
  });
  await scenario('rollback restores only owned values and locks, appends four audits', async () => {
    const result = await runRepair(prisma, freshPlan, 'rollback', receipt); assert.equal(result.changed, 4); assert.equal(await auditCount(), 8);
    assert.deepEqual(content(await rows()), content(original));
  });
  await scenario('repeated rollback is a no-op', async () => {
    const before = await rows(); assert.equal((await runRepair(prisma, freshPlan, 'rollback', receipt)).changed, 0); assert.deepEqual(await rows(), before); assert.equal(await auditCount(), 8);
  });
  await scenario('applied-then-rolled-back plan cannot be applied again', async () => { await assert.rejects(runRepair(prisma, freshPlan, 'apply')); assert.equal(await auditCount(), 8); });
  assert.equal(await prisma.auditLog.count({ where: { changedBy: ACTOR, reason: { startsWith: TAG } } }), 8);
  console.log(JSON.stringify({ scenarios: report.length, report, productionChanged: false }, null, 2));
  console.log('ISOLATED_SOURCE_CLASSIFICATION_REPAIR_AND_ROLLBACK_PASSED');
}
main().catch(error => { console.error(`CLASSIFICATION_QA_STOP: ${error.name}`); console.log(JSON.stringify({ completed: report })); if (error.name === 'AssertionError') console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
