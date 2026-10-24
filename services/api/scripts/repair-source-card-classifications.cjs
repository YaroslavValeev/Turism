'use strict';

// One bounded data repair, not a parser or a general-purpose update interface.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const TAG = 'source-card-classifications-20261024';
const ACTOR = `data-fix:${TAG}`;
// These URLs identify documentary evidence, not service configuration.
const SPECS = Object.freeze([
  { id: 'cmulpn7bz000rgghlvenfi7ln', sourceId: 'cmot577px003luf5gis5a4048', sourceUrl: 'https://t.me/raceenduro/2878', sourceType: 'telegram', field: 'discipline', before: 'Unknown', value: 'enduro', rule: 'enduro' },
  { id: 'cmulpo3li0011gghl5vz4oq96', sourceId: 'cmot577px003luf5gis5a4048', sourceUrl: 'https://t.me/raceenduro/2871', sourceType: 'telegram', field: 'discipline', before: 'Unknown', value: 'enduro', rule: 'enduro' },
  { id: 'cmuf9vok500wgl57wmf0k34fc', sourceId: 'cmot577q0003nuf5gu4pozt0w', sourceUrl: 'https://t.me/RusKiteNews/1004', sourceType: 'telegram', field: 'region', before: 'Chile', value: 'Красное море', rule: 'red-sea' },
  { id: 'cmuf9pvx300upl57w5hhv36e3', sourceId: 'cmot577n90023uf5g8bageell', sourceUrl: 'https://mountainguru.ru/climb/0_64/', sourceType: 'site', field: 'region', before: 'Кавказ и др.', value: 'Турция', rule: 'turkey' },
].map(Object.freeze));
const IDS = SPECS.map(s => s.id);
const rawSelect = { id: true, sourceId: true, sourceType: true, sourceUrl: true, sourceRunId: true,
  rawTitle: true, rawText: true, fetchedAt: true, source: { select: { name: true } } };

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const same = (a, b, message) => assert.ok(isDeepStrictEqual(canonical(a), canonical(b)), message);
const withoutTimestamp = row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'updatedAt'));
function supports(spec, raw) {
  if (raw.sourceId !== spec.sourceId || raw.sourceUrl !== spec.sourceUrl || raw.sourceType !== spec.sourceType) return false;
  const text = [raw.rawTitle, raw.rawText].filter(Boolean).join(' ');
  if (spec.rule === 'enduro') return /эндуро/i.test(raw.source?.name || '') && /Классы/i.test(text) && /Новороссийск/i.test(text);
  if (spec.rule === 'red-sea') return /кайт|wing/i.test(text) && /Красном море/i.test(text);
  return /скалолазания в Турции/i.test(text) && /Антали[ия]/i.test(text);
}
function assertBefore(spec, row) {
  assert.ok(row && row.id === spec.id, 'Missing target');
  for (const key of ['sourceId', 'sourceUrl', 'sourceType']) assert.equal(row[key], spec[key], 'Source identity changed');
  assert.equal(row.publishStatus, 'published', 'Publication state changed');
  assert.equal(row[spec.field], spec.before, 'Classification changed');
  assert.ok(Array.isArray(row.manualFields) && !row.manualFields.includes(spec.field), 'Manual field is locked');
}
function expectedAfter(spec, before) {
  return { ...before, [spec.field]: spec.value, manualFields: [...new Set([...before.manualFields, spec.field])].sort() };
}
function buildPlan(programs, raws) {
  same(programs.map(p => p.id).sort(), [...IDS].sort(), 'Exactly four unique targets required');
  const items = SPECS.map(spec => {
    const before = canonical(programs.find(p => p.id === spec.id));
    assertBefore(spec, before);
    const evidence = raws.filter(r => supports(spec, r)).map(r => ({ id: r.id, sha256: hash(r) })).sort((a, b) => a.id.localeCompare(b.id));
    assert.ok(evidence.length && new Set(evidence.map(e => e.id)).size === evidence.length, 'Missing or duplicate source evidence');
    return { programId: spec.id, field: spec.field, before, after: expectedAfter(spec, before), evidence };
  });
  const payload = { version: 1, tag: TAG, items };
  return { ...payload, id: hash(payload) };
}
function validatePlan(plan) {
  assert.equal(plan?.version, 1); assert.equal(plan.tag, TAG);
  assert.equal(plan.items?.length, 4);
  for (const [index, spec] of SPECS.entries()) {
    const item = plan.items[index];
    assert.equal(item.programId, spec.id); assert.equal(item.field, spec.field);
    assertBefore(spec, item.before);
    same(item.after, expectedAfter(spec, item.before), 'Repair expands beyond approved fields');
    assert.ok(Array.isArray(item.evidence) && item.evidence.length);
    for (const evidence of item.evidence) {
      assert.equal(typeof evidence.id, 'string'); assert.match(evidence.sha256, /^[a-f0-9]{64}$/);
    }
  }
  assert.equal(plan.id, hash({ version: 1, tag: TAG, items: plan.items }), 'Plan integrity failed');
  return plan;
}
async function readPlan(tx) {
  const programs = await tx.program.findMany({ where: { id: { in: IDS } }, orderBy: { id: 'asc' } });
  const raws = await tx.rawItem.findMany({ where: { OR: SPECS.map(s => ({ sourceId: s.sourceId, sourceUrl: s.sourceUrl, sourceType: s.sourceType })) }, select: rawSelect });
  return buildPlan(programs, raws);
}
async function planRepair(prisma) {
  return prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    return readPlan(tx);
  }, { isolationLevel: 'RepeatableRead', timeout: 30000 });
}
async function invariants(tx) {
  const result = {};
  // Only scalar rows: no contact credentials or record bodies are printed.
  for (const model of ['program', 'programMedia', 'organizer', 'source', 'sourceRun', 'rawItem', 'normalizedItem', 'publishedProgram']) {
    const rows = await tx[model].findMany({ ...(model === 'program' ? { where: { id: { notIn: IDS } } } : {}), orderBy: { id: 'asc' } });
    result[model] = { count: rows.length, sha256: hash(rows) };
  }
  return result;
}
const reason = (plan, mode) => `${TAG}:${plan.id}:${mode}`;
async function auditRows(tx, plan, mode) {
  return tx.auditLog.findMany({ where: { changedBy: ACTOR, reason: reason(plan, mode), entityType: 'program' }, orderBy: { entityId: 'asc' } });
}
function validateAuditSet(rows, plan) {
  same(rows.map(r => r.entityId).sort(), [...IDS].sort(), 'Incomplete or duplicate repair audits');
  for (const row of rows) {
    const item = plan.items.find(i => i.programId === row.entityId);
    assert.equal(row.changedField, 'source_classification_repair');
    same(JSON.parse(row.oldValue), item.before, 'Audit before snapshot mismatch');
    same(withoutTimestamp(JSON.parse(row.newValue)), withoutTimestamp(item.after), 'Audit after snapshot mismatch');
  }
}
async function runRepair(prisma, plan, mode, receipt) {
  validatePlan(plan); assert.ok(['apply', 'rollback'].includes(mode));
  if (mode === 'rollback') {
    assert.equal(receipt?.planId, plan.id); assert.equal(receipt.mode, 'apply');
    assert.equal(receipt.after?.length, 4);
  }
  return prisma.$transaction(async tx => {
    // Fixed SQL with bound parameters. Row locks and Serializable both fail closed.
    await tx.$queryRawUnsafe('SELECT id FROM programs WHERE id IN ($1,$2,$3,$4) ORDER BY id FOR UPDATE', ...IDS);
    const current = canonical(await tx.program.findMany({ where: { id: { in: IDS } }, orderBy: { id: 'asc' } }));
    same(current.map(p => p.id).sort(), [...IDS].sort(), 'Missing target');
    const applied = await auditRows(tx, plan, 'apply');
    const rolledBack = await auditRows(tx, plan, 'rollback');
    if (mode === 'apply' && applied.length) {
      assert.equal(rolledBack.length, 0, 'Repair already rolled back; a new review is required');
      validateAuditSet(applied, plan);
      const after = applied.map(a => JSON.parse(a.newValue)).sort((a, b) => a.id.localeCompare(b.id));
      same(current, after, 'Card changed after apply; refuse replay');
      return { mode, planId: plan.id, changed: 0, after };
    }
    if (mode === 'rollback') {
      validateAuditSet(applied, plan);
      same(receipt.after, applied.map(a => JSON.parse(a.newValue)).sort((a, b) => a.id.localeCompare(b.id)), 'Receipt does not match committed audits');
      if (rolledBack.length) {
        same(rolledBack.map(a => a.entityId).sort(), [...IDS].sort(), 'Incomplete rollback audits');
        same(current, rolledBack.map(a => JSON.parse(a.newValue)).sort((a, b) => a.id.localeCompare(b.id)), 'Card changed after rollback');
        return { mode, planId: plan.id, changed: 0 };
      }
      same(current, receipt.after, 'Card changed after apply; refuse rollback');
    } else {
      assert.equal(rolledBack.length, 0, 'Unexpected rollback audit');
      same((await readPlan(tx)).id, plan.id, 'Plan/source/card snapshot drift');
    }
    const protectedBefore = await invariants(tx);
    const after = [];
    for (const spec of SPECS) {
      const item = plan.items.find(i => i.programId === spec.id);
      const before = current.find(p => p.id === spec.id);
      const target = mode === 'apply' ? item.after : item.before;
      const changed = await tx.program.updateMany({
        where: { id: spec.id, updatedAt: new Date(before.updatedAt), [spec.field]: before[spec.field], manualFields: { equals: before.manualFields } },
        data: { [spec.field]: target[spec.field], manualFields: target.manualFields },
      });
      assert.equal(changed.count, 1, 'Compare-and-swap failed');
      const row = canonical(await tx.program.findUniqueOrThrow({ where: { id: spec.id } }));
      same(withoutTimestamp(row), withoutTimestamp(target), 'Unexpected target column changed');
      await tx.auditLog.create({ data: { entityType: 'program', entityId: spec.id, changedField: 'source_classification_repair',
        changedBy: ACTOR, reason: reason(plan, mode), oldValue: JSON.stringify(before), newValue: JSON.stringify(row) } });
      after.push(row);
    }
    same(await invariants(tx), protectedBefore, 'Protected content changed during repair');
    return { mode, planId: plan.id, changed: 4, after: after.sort((a, b) => a.id.localeCompare(b.id)), protected: protectedBefore };
  }, { isolationLevel: 'Serializable', timeout: 60000, maxWait: 10000 });
}
function parseArgs(args) {
  if (args.length === 1 && args[0] === '--plan') return { mode: 'plan' };
  const mode = args[0] === '--apply' ? 'apply' : args[0] === '--rollback' ? 'rollback' : null;
  assert.ok(mode, 'Use --plan or an explicitly confirmed apply/rollback');
  assert.equal(args.length, 6);
  assert.equal(args[2], '--confirm'); assert.match(args[3], /^[a-f0-9]{64}$/);
  assert.equal(args[4], '--receipt'); assert.ok(args[1] && args[5]);
  return { mode, planPath: args[1], confirm: args[3], receiptPath: args[5] };
}
module.exports = { TAG, ACTOR, SPECS, canonical, hash, supports, buildPlan, validatePlan, planRepair, runRepair, parseArgs };

if (require.main === module) {
  let prisma, fd;
  Promise.resolve().then(async () => {
    const fs = require('node:fs'); const path = require('node:path');
    const args = parseArgs(process.argv.slice(2));
    let plan, receipt;
    if (args.mode !== 'plan') {
      plan = validatePlan(JSON.parse(fs.readFileSync(args.planPath, 'utf8')));
      assert.equal(args.confirm, plan.id, 'Explicit plan confirmation missing');
      if (args.mode === 'rollback') receipt = JSON.parse(fs.readFileSync(args.receiptPath, 'utf8'));
      else fd = fs.openSync(args.receiptPath, 'wx', 0o600); // Reserve before any DB write; never overwrite.
    }
    ({ prisma } = require(path.join(process.cwd(), 'dist/lib/prisma.js')));
    const result = args.mode === 'plan' ? await planRepair(prisma) : await runRepair(prisma, plan, args.mode, receipt);
    if (fd !== undefined) { fs.writeFileSync(fd, JSON.stringify(result, null, 2) + '\n'); fs.fsyncSync(fd); }
    console.log(JSON.stringify(result, null, 2));
  }).catch(error => {
    console.error(`SOURCE_CLASSIFICATION_REPAIR_STOP: ${error.name}. Preserve evidence; do not retry writes or restore automatically.`);
    process.exitCode = 1;
  }).finally(async () => { if (fd !== undefined) require('node:fs').closeSync(fd); await prisma?.$disconnect(); });
}
