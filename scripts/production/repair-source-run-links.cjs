/* One-off evidence-based reconstruction; default mode never writes to the DB. */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const RELEASE = 'cd8dd5c96bc818a0bcb85dc7a2bd3cd6ebe0f4c9';
const CONFIRM = 'reconstruct-31-existing-source-run-links';
const RUNS = [
  ['cmug9new20009yiim829kvihp', 'src_342994e87b56b25b88bce9746fb7cf8a', 11],
  ['cmug9nfi80025yiimwt6p06qy', 'src_e506d13fd6cf7bae126ff016ebf62974', 13],
  ['cmugz16oo0020yvlqjfzsxfzh', 'cmot577px003luf5gis5a4048', 3],
  ['cmugyzsxp000ayvlqjrab5c9l', 'cmolicqqm000bavu5zsj9wvc9', 4],
];
const ACTOR = 'maintenance:source-run-trace';
const APPLY = 'source_run_link_reconstructed';
const REVERT = 'source_run_link_reconstruction_reverted';
function insist(condition, code) { if (!condition) throw new Error(code); }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function identity(plan) { return { version: plan.version, release: plan.release, runs: plan.runs, links: plan.links }; }
function reason(plan) {
  return `trace-repair:${plan.id}; evidence-based reconstruction from existing run, source, complete cohort and original creation audits; not a claim about the historical stored link`;
}

async function collect(tx, linked = false) {
  const runs = [], links = [];
  for (const [id, sourceId, count] of RUNS) {
    const run = await tx.sourceRun.findUnique({ where: { id }, include: { _count: { select: { rawItems: true } } } });
    insist(run && run.sourceId === sourceId && run.runType === 'collect' && run.status === 'success' && run.finishedAt && run.itemsCreated === count, 'RUN_CHANGED');
    insist(run._count.rawItems === (linked ? count : 0), 'RUN_LINK_COUNT_CHANGED');
    const rows = await tx.rawItem.findMany({
      where: { sourceId, fetchedAt: { gte: run.startedAt, lte: run.finishedAt } },
      orderBy: { id: 'asc' }, take: count + 1,
      select: { id: true, sourceId: true, sourceType: true, fetchedAt: true, sourceRunId: true },
    });
    insist(rows.length === count, 'COHORT_COUNT_CHANGED');
    const overlaps = await tx.sourceRun.count({ where: {
      id: { not: id }, sourceId, runType: { in: ['collect', 'manual'] }, startedAt: { lte: run.finishedAt },
      OR: [{ finishedAt: { gte: run.startedAt } }, { finishedAt: null }],
    } });
    insist(overlaps === 0, 'OVERLAPPING_COLLECTION');
    const audits = await tx.auditLog.findMany({ where: { entityType: 'raw_item', entityId: { in: rows.map(r => r.id) }, changedField: 'created' } });
    runs.push({ id, sourceId, count, startedAt: run.startedAt.toISOString(), finishedAt: run.finishedAt.toISOString() });
    for (const row of rows) {
      insist(row.sourceType === 'telegram' && row.sourceRunId === (linked ? id : null), 'RAW_LINK_OR_TYPE_CHANGED');
      const matches = audits.filter(a => a.entityId === row.id);
      insist(matches.length === 1 && matches[0].oldValue === null && matches[0].newValue === row.id && matches[0].reason === 'ingestion collect from telegram' && matches[0].createdAt >= run.startedAt && matches[0].createdAt <= run.finishedAt, 'CREATION_AUDIT_MISMATCH');
      links.push({ rawId: row.id, sourceId, fetchedAt: row.fetchedAt.toISOString(), oldValue: null, newValue: id, creationAuditAt: matches[0].createdAt.toISOString() });
    }
  }
  insist(links.length === 31 && new Set(links.map(l => l.rawId)).size === 31, 'INVALID_SCOPE');
  return { version: 1, release: RELEASE, runs, links };
}
function validatePlan(plan) {
  insist(plan && plan.version === 1 && plan.release === RELEASE && Array.isArray(plan.links) && plan.links.length === 31 && Array.isArray(plan.runs) && plan.runs.length === 4, 'INVALID_PLAN');
  insist(plan.id === digest(identity(plan)), 'PLAN_DIGEST_MISMATCH');
}
async function prepare(prisma) {
  const data = await prisma.$transaction(tx => collect(tx), { isolationLevel: 'RepeatableRead', timeout: 60000 });
  return { ...data, id: digest(data), preparedAt: new Date().toISOString() };
}
async function lock(tx, plan) {
  // Parameterized SELECTs only. Lock ordering is the same for apply and rollback.
  for (const [table, ids] of [['source_runs', plan.runs.map(r => r.id)], ['raw_items', plan.links.map(l => l.rawId)]]) {
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    await tx.$queryRawUnsafe(`SELECT id FROM "${table}" WHERE id IN (${placeholders}) ORDER BY id FOR UPDATE`, ...ids);
  }
}
async function history(tx, plan) {
  return tx.auditLog.findMany({ where: { entityType: 'raw_item', entityId: { in: plan.links.map(l => l.rawId) }, changedField: { in: [APPLY, REVERT] } } });
}
function ownedHistory(rows, plan, action) {
  const selected = rows.filter(a => a.changedField === action);
  return selected.length === 31 && plan.links.every(l => {
    const matches = selected.filter(a => a.entityId === l.rawId);
    return matches.length === 1 && matches[0].changedBy === ACTOR && matches[0].reason === reason(plan) &&
      matches[0].oldValue === (action === APPLY ? null : l.newValue) && matches[0].newValue === (action === APPLY ? l.newValue : null);
  });
}
async function change(prisma, plan, mode, confirmation) {
  insist(confirmation === CONFIRM, 'EXPLICIT_CONFIRMATION_REQUIRED');
  insist(mode === 'apply' || mode === 'rollback', 'INVALID_MODE');
  validatePlan(plan);
  return prisma.$transaction(async tx => {
    await lock(tx, plan);
    const events = await history(tx, plan);
    const applied = ownedHistory(events, plan, APPLY), reverted = ownedHistory(events, plan, REVERT);
    if (mode === 'apply') {
      if (events.length) {
        insist(applied && !reverted && events.length === 31, 'REPAIR_HISTORY_CONFLICT');
        insist(digest(await collect(tx, true)) === plan.id, 'PLAN_STATE_CHANGED');
        return { mode, id: plan.id, changed: 0, alreadyApplied: true };
      }
      insist(digest(await collect(tx)) === plan.id, 'PLAN_STATE_CHANGED');
    } else {
      insist(applied && events.length === (reverted ? 62 : 31), 'REPAIR_NOT_OWNED');
      insist(digest(await collect(tx, !reverted)) === plan.id, 'PLAN_STATE_CHANGED');
      if (reverted) return { mode, id: plan.id, changed: 0, alreadyRolledBack: true };
    }
    for (const link of plan.links) {
      const oldValue = mode === 'apply' ? null : link.newValue;
      const newValue = mode === 'apply' ? link.newValue : null;
      const updated = await tx.rawItem.updateMany({
        where: { id: link.rawId, sourceId: link.sourceId, sourceRunId: oldValue, fetchedAt: new Date(link.fetchedAt) }, data: { sourceRunId: newValue },
      });
      insist(updated.count === 1, 'CONDITIONAL_UPDATE_FAILED');
      await tx.auditLog.create({ data: { entityType: 'raw_item', entityId: link.rawId, changedField: mode === 'apply' ? APPLY : REVERT, oldValue, newValue, changedBy: ACTOR, reason: reason(plan) } });
    }
    insist(digest(await collect(tx, mode === 'apply')) === plan.id, 'POST_WRITE_VALIDATION_FAILED');
    return { mode, id: plan.id, changed: 31 };
  }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 60000 });
}
async function cli() {
  const args = process.argv.slice(2);
  insist(args.length === 0 || (['--apply', '--rollback'].includes(args[0]) && args.length === 2), 'INVALID_ARGUMENTS');
  const r = await fetch('http://127.0.0.1:3001/health', { signal: AbortSignal.timeout(15000) });
  insist(r.ok, 'HEALTH_HTTP_FAILED');
  const h = await r.json();
  insist(h.status === 'ok' && h.release?.releaseSha === RELEASE, 'UNEXPECTED_RELEASE');
  const { prisma } = require(path.resolve(process.cwd(), 'dist/lib/prisma.js'));
  try {
    const result = args.length === 0 ? await prepare(prisma) : await change(prisma, JSON.parse(fs.readFileSync(args[1], 'utf8')), args[0].slice(2), process.env.TRACE_REPAIR_CONFIRM);
    console.log(JSON.stringify(result, null, 2));
  } finally { await prisma.$disconnect(); }
}
module.exports = { RUNS, RELEASE, CONFIRM, collect, prepare, change, validatePlan };
if (require.main === module) cli().catch(() => { console.error('STOP: trace repair refused or failed; inspect plan/state. No automatic retry or database restore.'); process.exitCode = 1; });
