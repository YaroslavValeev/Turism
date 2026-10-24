'use strict';
const assert = require('node:assert/strict');
require('./admin-card-qa-guard.cjs').assertAdminCardQaTarget(process.env);
const { prisma } = require('../dist/lib/prisma.js');
const { PRIMARY, DUPLICATE, IDS, ACTOR, planMerge, runMerge, snapshot } = require('./merge-confirmed-enduro-event.cjs');
global.fetch = async () => { throw new Error('No outbound I/O'); };
const report = [];
const content = rows => rows.map(r => ({ ...r, program: Object.fromEntries(Object.entries(r.program).filter(([k]) => k !== 'updatedAt')) }));
async function scenario(name, fn) { await fn(); report.push({ name, passed: true }); }
async function main() {
  // Fixtures from the preceding classification suite; the target guard above runs before any I/O.
  for (const id of IDS) {
    await prisma.program.update({ where: { id }, data: { discipline: 'enduro', region: 'Краснодарский край', exactLocation: 'Новороссийск', durationDays: 1,
      startDate: new Date('2026-10-24T12:00:00Z'), endDate: new Date('2026-10-24T12:00:00Z'), manualFields: ['discipline', 'title'], mediaOrderPinned: false } });
    const media = await prisma.programMedia.findMany({ where: { programId: id } }); assert.equal(media.length, 1);
    await prisma.programMedia.update({ where: { id: media[0].id }, data: { position: 0, url: `/ingestion-media/tg-raceenduro-${id === PRIMARY ? '2871' : '2878'}-0-qa.jpg` } });
  }
  await prisma.programMedia.create({ data: { programId: DUPLICATE, mediaType: 'image', position: 1, url: '/ingestion-media/tg-raceenduro-2878-1-qa.jpg' } });
  let plan = await planMerge(prisma); const original = await snapshot(prisma);
  await scenario('plan leaves originals intact', async () => assert.deepEqual(await snapshot(prisma), original));
  await scenario('fresh business relation prevents merge', async () => {
    const p = original.find(r => r.program.id === PRIMARY).program;
    const lead = await prisma.lead.create({ data: { programId: PRIMARY, organizerId: p.organizerId, guestContact: 'fixture@example.invalid' } });
    const before = await snapshot(prisma); await assert.rejects(runMerge(prisma, plan, 'apply')); assert.deepEqual(await snapshot(prisma), before);
    await prisma.lead.delete({ where: { id: lead.id } });
  });
  await scenario('audit failure rolls back media copies and archive atomically', async () => {
    const db = { $transaction: (fn, opts) => prisma.$transaction(tx => fn(new Proxy(tx, { get(target, key) {
      if (key === 'auditLog') return { ...target.auditLog, create: async () => { throw new Error('Audit failure'); } }; return target[key];
    } })), opts) };
    const before = await snapshot(prisma); await assert.rejects(runMerge(db, plan, 'apply')); assert.deepEqual(await snapshot(prisma), before);
  });
  let receipt;
  await scenario('canonical cover plus all three images; duplicate archived not deleted', async () => {
    receipt = await runMerge(prisma, plan, 'apply'); assert.equal(receipt.changed, 2); assert.equal(receipt.addedMedia.length, 2);
    const primary = receipt.after.find(r => r.program.id === PRIMARY), duplicate = receipt.after.find(r => r.program.id === DUPLICATE);
    assert.equal(primary.media.length, 3); assert.equal(duplicate.media.length, 2); assert.equal(duplicate.program.publishStatus, 'archived');
    assert.equal(primary.media[0].id, original.find(r => r.program.id === PRIMARY).media[0].id);
    assert.equal(primary.program.mediaOrderPinned, true); assert.equal(primary.program.sourceUrl, 'https://t.me/raceenduro/2871');
    assert.equal(duplicate.program.sourceUrl, 'https://t.me/raceenduro/2878');
    assert.equal(await prisma.auditLog.count({ where: { changedBy: ACTOR } }), 1);
  });
  await scenario('reapply creates neither extra copies nor audits', async () => {
    assert.equal((await runMerge(prisma, plan, 'apply')).changed, 0); assert.equal(await prisma.auditLog.count({ where: { changedBy: ACTOR } }), 1);
  });
  await scenario('new media edit blocks rollback even without touching program updatedAt', async () => {
    const media = await prisma.programMedia.create({ data: { programId: PRIMARY, mediaType: 'image', position: 4, url: '/ingestion-media/qa-later-image.jpg' } });
    const before = await snapshot(prisma); await assert.rejects(runMerge(prisma, plan, 'rollback', receipt)); assert.deepEqual(await snapshot(prisma), before);
    await prisma.programMedia.delete({ where: { id: media.id } });
  });
  await scenario('tampered receipt cannot remove arbitrary media', async () => {
    const bad = structuredClone(receipt); bad.addedMedia[0].id = original[0].media[0].id;
    await assert.rejects(runMerge(prisma, plan, 'rollback', bad)); assert.deepEqual(await snapshot(prisma), receipt.after);
  });
  await scenario('rollback removes only two created references and restores prior status/cover pin', async () => {
    assert.equal((await runMerge(prisma, plan, 'rollback', receipt)).changed, 2);
    assert.deepEqual(content(await snapshot(prisma)), content(original)); assert.equal(await prisma.auditLog.count({ where: { changedBy: ACTOR } }), 2);
  });
  await scenario('repeated rollback is a no-op and rolled-back plan cannot be reapplied', async () => {
    assert.equal((await runMerge(prisma, plan, 'rollback', receipt)).changed, 0); await assert.rejects(runMerge(prisma, plan, 'apply'));
  });
  console.log(JSON.stringify({ scenarios: report.length, report, productionChanged: false }, null, 2)); console.log('ISOLATED_CONFIRMED_EVENT_MERGE_AND_ROLLBACK_PASSED');
}
main().catch(error => { console.error(`CONFIRMED_MERGE_QA_STOP: ${error.name}`); console.log(JSON.stringify({ report })); if (error.name === 'AssertionError') console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
