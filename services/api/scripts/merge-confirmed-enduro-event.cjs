'use strict';
const assert = require('node:assert/strict');
const { canonical, hash, parseArgs } = require('./repair-source-card-classifications.cjs');
const { isDeepStrictEqual } = require('node:util');
const TAG = 'owner-confirmed-enduro-merge-20261024';
const ACTOR = `data-fix:${TAG}`;
const PRIMARY = 'cmulpo3li0011gghl5vz4oq96';
const DUPLICATE = 'cmulpn7bz000rgghlvenfi7ln';
const IDS = [PRIMARY, DUPLICATE];
const SOURCE_ID = 'cmot577px003luf5gis5a4048';
const COUNTS = { bookings: true, leads: true, payments: true, refunds: true, reviews: true, incidents: true,
  commissions: true, contentItems: true, subscriptionDeliveries: true, telegramLeadAttempts: true, publishedPrograms: true };
const same = (a, b, message) => assert.ok(isDeepStrictEqual(canonical(a), canonical(b)), message);
const untimed = row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'updatedAt'));
async function snapshot(tx) {
  return canonical((await tx.program.findMany({ where: { id: { in: IDS } }, orderBy: { id: 'asc' },
    include: { media: { orderBy: [{ position: 'asc' }, { id: 'asc' }] }, _count: { select: COUNTS } },
  })).map(({ media, _count, ...program }) => ({ program, media, counts: _count })));
}
function buildPlan(before, evidence) {
  same(before.map(r => r.program.id).sort(), [...IDS].sort(), 'Exactly the confirmed pair required');
  const primary = before.find(r => r.program.id === PRIMARY), duplicate = before.find(r => r.program.id === DUPLICATE);
  for (const row of before) {
    const p = row.program;
    assert.equal(p.sourceId, SOURCE_ID); assert.equal(p.sourceType, 'telegram');
    assert.equal(p.sourceUrl, `https://t.me/raceenduro/${p.id === PRIMARY ? '2871' : '2878'}`);
    assert.equal(p.publishStatus, 'published'); assert.equal(p.discipline, 'enduro');
    assert.equal(p.exactLocation, 'Новороссийск'); assert.equal(p.durationDays, 1);
    assert.equal(canonical(p.startDate), '2026-10-24T12:00:00.000Z'); assert.equal(canonical(p.endDate), canonical(p.startDate));
    assert.ok(Array.isArray(p.manualFields) && p.manualFields.includes('discipline'));
    for (const [key, count] of Object.entries(row.counts)) if (key !== 'publishedPrograms') assert.equal(count, 0, `Related ${key} require a separate business merge`);
  }
  assert.equal(primary.program.organizerId, duplicate.program.organizerId);
  assert.equal(primary.program.region, duplicate.program.region);
  assert.equal(primary.media.length, 1); assert.equal(primary.media[0].position, 0); assert.equal(duplicate.media.length, 2);
  const media = before.flatMap(r => r.media);
  assert.equal(new Set(media.map(m => m.url)).size, 3);
  for (const m of media) { assert.equal(m.mediaType, 'image'); assert.match(m.url, /^\/ingestion-media\/tg-raceenduro-(2871|2878)-[^?#]+\.(jpg|jpeg|webp|png)$/); }
  for (const url of ['https://t.me/raceenduro/2871', 'https://t.me/raceenduro/2878']) assert.ok(evidence.some(e => e.sourceUrl === url), 'Missing stored source evidence');
  const payload = { version: 1, tag: TAG, primaryId: PRIMARY, duplicateId: DUPLICATE, before: canonical(before), evidence: canonical(evidence) };
  return { ...payload, id: hash(payload) };
}
function validatePlan(plan) {
  assert.equal(plan?.version, 1); assert.equal(plan.tag, TAG); assert.equal(plan.primaryId, PRIMARY); assert.equal(plan.duplicateId, DUPLICATE);
  same(buildPlan(plan.before, plan.evidence), plan, 'Plan integrity failed');
  return plan;
}
async function readPlan(tx) {
  const raw = await tx.rawItem.findMany({ where: { sourceId: SOURCE_ID, sourceType: 'telegram', sourceUrl: { in: ['https://t.me/raceenduro/2871', 'https://t.me/raceenduro/2878'] } }, orderBy: { id: 'asc' } });
  return buildPlan(await snapshot(tx), raw.map(r => ({ id: r.id, sourceUrl: r.sourceUrl, sha256: hash(r) })));
}
async function planMerge(prisma) {
  return prisma.$transaction(async tx => { await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY'); return readPlan(tx); }, { isolationLevel: 'RepeatableRead', timeout: 30000 });
}
async function invariants(tx) {
  const result = {};
  for (const model of ['program', 'programMedia', 'organizer', 'source', 'sourceRun', 'rawItem', 'normalizedItem', 'publishedProgram']) {
    const where = model === 'program' ? { id: { notIn: IDS } } : model === 'programMedia' ? { programId: { notIn: IDS } } : {};
    const rows = await tx[model].findMany({ where, orderBy: { id: 'asc' } }); result[model] = { count: rows.length, sha256: hash(rows) };
  }
  return result;
}
function expectedAfter(plan, after, addedMedia) {
  assert.equal(addedMedia.length, 2); assert.equal(new Set(addedMedia.map(m => m.id)).size, 2);
  const donor = plan.before.find(r => r.program.id === DUPLICATE);
  for (const [i, m] of addedMedia.entries()) {
    const { id: ignoredId, ...original } = donor.media[i];
    same({ ...m, id: undefined }, { ...original, programId: PRIMARY, position: i + 1, id: undefined }, 'Copied media mismatch');
  }
  const expected = plan.before.map(row => {
    const p = { ...row.program };
    if (p.id === PRIMARY) p.mediaOrderPinned = true; else p.publishStatus = 'archived';
    return { ...row, program: untimed(p), media: p.id === PRIMARY ? [...row.media, ...addedMedia] : row.media };
  });
  same(after.map(row => ({ ...row, program: untimed(row.program) })), expected, 'Unexpected target column/media/business change');
}
const auditWhere = (plan, mode) => ({ entityType: 'program_merge', entityId: DUPLICATE, changedBy: ACTOR, reason: `${TAG}:${plan.id}:${mode}` });
async function runMerge(prisma, plan, mode, receipt) {
  validatePlan(plan); assert.ok(['apply', 'rollback'].includes(mode));
  if (mode === 'rollback') { assert.equal(receipt?.planId, plan.id); assert.equal(receipt.mode, 'apply'); }
  return prisma.$transaction(async tx => {
    await tx.$queryRawUnsafe('SELECT id FROM programs WHERE id IN ($1,$2) ORDER BY id FOR UPDATE', ...IDS);
    await tx.$queryRawUnsafe('SELECT id FROM program_media WHERE "programId" IN ($1,$2) ORDER BY id FOR UPDATE', ...IDS);
    const current = await snapshot(tx);
    const applied = await tx.auditLog.findMany({ where: auditWhere(plan, 'apply') });
    const reversed = await tx.auditLog.findMany({ where: auditWhere(plan, 'rollback') });
    assert.ok(applied.length <= 1 && reversed.length <= 1, 'Ambiguous repair audits');
    if (applied.length) {
      same(JSON.parse(applied[0].oldValue), plan.before, 'Audit does not match approved plan');
      const committed = JSON.parse(applied[0].newValue);
      expectedAfter(plan, committed.after, committed.addedMedia);
      if (mode === 'apply') { assert.equal(reversed.length, 0, 'Already rolled back'); same(current, committed.after, 'Changed since apply'); return { ...committed, changed: 0 }; }
      same(receipt, committed, 'Receipt differs from committed audit');
      if (reversed.length) { same(current, JSON.parse(reversed[0].newValue).after, 'Changed since rollback'); return { mode, planId: plan.id, changed: 0 }; }
      same(current, receipt.after, 'Later operator/business edit prevents rollback');
    } else {
      assert.equal(mode, 'apply', 'No committed merge to rollback'); assert.equal(reversed.length, 0);
      assert.equal((await readPlan(tx)).id, plan.id, 'Plan/source/card/media/business drift');
    }
    const protectedBefore = await invariants(tx);
    const addedMedia = [];
    if (mode === 'apply') {
      for (const [i, m] of plan.before.find(r => r.program.id === DUPLICATE).media.entries()) {
        addedMedia.push(canonical(await tx.programMedia.create({ data: { programId: PRIMARY, mediaType: m.mediaType, url: m.url, caption: m.caption, position: i + 1 } })));
      }
    } else {
      // Only the two references this operation created; original references/files are never deleted.
      const removed = await tx.programMedia.deleteMany({ where: { id: { in: receipt.addedMedia.map(m => m.id) }, programId: PRIMARY } });
      assert.equal(removed.count, 2);
    }
    for (const id of IDS) {
      const before = current.find(r => r.program.id === id).program;
      const original = plan.before.find(r => r.program.id === id).program;
      const data = id === PRIMARY ? { mediaOrderPinned: mode === 'apply' ? true : original.mediaOrderPinned } : { publishStatus: mode === 'apply' ? 'archived' : original.publishStatus };
      const changed = await tx.program.updateMany({ where: { id, updatedAt: new Date(before.updatedAt), publishStatus: before.publishStatus }, data });
      assert.equal(changed.count, 1, 'Compare-and-swap failed');
    }
    const after = await snapshot(tx);
    if (mode === 'apply') expectedAfter(plan, after, addedMedia);
    else same(after.map(r => ({ ...r, program: untimed(r.program) })), plan.before.map(r => ({ ...r, program: untimed(r.program) })), 'Rollback changed unrelated target content');
    same(await invariants(tx), protectedBefore, 'Protected data changed');
    const result = { mode, planId: plan.id, changed: 2, after, addedMedia, protected: protectedBefore };
    await tx.auditLog.create({ data: { ...auditWhere(plan, mode), changedField: mode === 'apply' ? 'owner_confirmed_event_merge' : 'owner_confirmed_event_unmerge',
      oldValue: JSON.stringify(mode === 'apply' ? plan.before : current), newValue: JSON.stringify(result) } });
    return result;
  }, { isolationLevel: 'Serializable', timeout: 60000, maxWait: 10000 });
}
module.exports = { TAG, ACTOR, PRIMARY, DUPLICATE, IDS, buildPlan, validatePlan, planMerge, runMerge, snapshot };
if (require.main === module) {
  let prisma, fd;
  Promise.resolve().then(async () => {
    const fs = require('node:fs'), path = require('node:path'); const args = parseArgs(process.argv.slice(2));
    let plan, receipt;
    if (args.mode !== 'plan') {
      plan = validatePlan(JSON.parse(fs.readFileSync(args.planPath, 'utf8'))); assert.equal(args.confirm, plan.id);
      if (args.mode === 'rollback') receipt = JSON.parse(fs.readFileSync(args.receiptPath, 'utf8')); else fd = fs.openSync(args.receiptPath, 'wx', 0o600);
    }
    ({ prisma } = require(path.join(process.cwd(), 'dist/lib/prisma.js')));
    const result = args.mode === 'plan' ? await planMerge(prisma) : await runMerge(prisma, plan, args.mode, receipt);
    if (fd !== undefined) { fs.writeFileSync(fd, JSON.stringify(result, null, 2) + '\n'); fs.fsyncSync(fd); }
    console.log(JSON.stringify(result, null, 2));
  }).catch(error => { console.error(`CONFIRMED_MERGE_STOP: ${error.name}; preserve evidence, do not retry writes automatically`); process.exitCode = 1; })
    .finally(async () => { if (fd !== undefined) require('node:fs').closeSync(fd); await prisma?.$disconnect(); });
}
