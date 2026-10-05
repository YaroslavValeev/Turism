/* One-off evidence-based reconstruction; default mode never writes to the DB. */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const RELEASE = 'cd8dd5c96bc818a0bcb85dc7a2bd3cd6ebe0f4c9';
const CONFIRM = 'reconstruct-35-remaining-source-run-links';
const RUNS = [
  [
    "cmug9neii0001yiimhyc2d9hh",
    "src_8321e2ac8f32fde144fbe61ffb8f2f3f",
    1,
    "site"
  ],
  [
    "cmug9ngh2004dyiim5bakw3hg",
    "src_deb9c9c2af80fa637aed2f88456040c7",
    8,
    "telegram"
  ],
  [
    "cmugpdj1s001anzpp4v9q9j7c",
    "cmot577lm0017uf5gfrh4a4rn",
    1,
    "site"
  ],
  [
    "cmugro7tg0001133lus4wyi5f",
    "cmugrf3z3009knzppunypfp66",
    1,
    "instagram"
  ],
  [
    "cmugt99bh0001122u0votmxho",
    "cmolicqpn0001avu5jm77xevk",
    3,
    "telegram"
  ],
  [
    "cmugtebew0016122upombj3m5",
    "cmsepa73u0001i822f3w5x4ks",
    12,
    "site"
  ],
  [
    "cmugz17m7002kyvlqpb908spq",
    "cmot577pt003juf5g4csnorzw",
    7,
    "telegram"
  ],
  [
    "cmugz19pq003wyvlq7x94sn7s",
    "cmot577pf003buf5g5bo79ow6",
    2,
    "telegram"
  ]
];
const ACTOR = 'maintenance:source-run-trace';
const APPLY = 'source_run_link_reconstructed';
const REVERT = 'source_run_link_reconstruction_reverted';
function insist(condition, code) { if (!condition) throw new Error(code); }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function identity(plan) { return { version: plan.version, release: plan.release, runs: plan.runs, links: plan.links }; }
function reason(plan) {
  return `trace-repair-remaining35:${plan.id}; evidence-based reconstruction from existing run, source, complete cohort and original creation audits; not a claim about the historical stored link`;
}

async function collect(tx, linked = false) {
  const runs = [], links = [];
  for (const [id, sourceId, count, sourceType] of RUNS) {
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
    runs.push({ id, sourceId, count, sourceType, startedAt: run.startedAt.toISOString(), finishedAt: run.finishedAt.toISOString() });
    for (const row of rows) {
      insist(row.sourceType === sourceType && row.sourceRunId === (linked ? id : null), 'RAW_LINK_OR_TYPE_CHANGED');
      const matches = audits.filter(a => a.entityId === row.id);
      insist(matches.length === 1 && matches[0].oldValue === null && matches[0].newValue === row.id && matches[0].reason === `ingestion collect from ${sourceType}` && matches[0].createdAt >= run.startedAt && matches[0].createdAt <= run.finishedAt, 'CREATION_AUDIT_MISMATCH');
      links.push({ rawId: row.id, sourceId, sourceType, fetchedAt: row.fetchedAt.toISOString(), oldValue: null, newValue: id, creationAuditAt: matches[0].createdAt.toISOString() });
    }
  }
  insist(links.length === 35 && new Set(links.map(l => l.rawId)).size === 35, 'INVALID_SCOPE');
  return { version: 2, release: RELEASE, runs, links };
}
function validatePlan(plan) {
  insist(plan && plan.version === 2 && plan.release === RELEASE && Array.isArray(plan.links) && plan.links.length === 35 && Array.isArray(plan.runs) && plan.runs.length === 8, 'INVALID_PLAN');
  insist(plan.id === digest(identity(plan)), 'PLAN_DIGEST_MISMATCH');
  insist(new Set(plan.links.map(l => l.rawId)).size === 35, 'DUPLICATE_PLAN_LINK');
  for (let i = 0; i < RUNS.length; i++) {
    const [id, sourceId, count, sourceType] = RUNS[i], run = plan.runs[i];
    insist(run && run.id === id && run.sourceId === sourceId && run.count === count && run.sourceType === sourceType, 'PLAN_SCOPE_CHANGED');
    const links = plan.links.filter(l => l.newValue === id);
    insist(links.length === count && links.every(l => l.sourceId === sourceId && l.sourceType === sourceType && l.oldValue === null && typeof l.rawId === 'string' && l.rawId.length > 0), 'PLAN_LINK_SCOPE_CHANGED');
  }
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
  return selected.length === 35 && plan.links.every(l => {
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
        insist(applied && !reverted && events.length === 35, 'REPAIR_HISTORY_CONFLICT');
        insist(digest(await collect(tx, true)) === plan.id, 'PLAN_STATE_CHANGED');
        return { mode, id: plan.id, changed: 0, alreadyApplied: true };
      }
      insist(digest(await collect(tx)) === plan.id, 'PLAN_STATE_CHANGED');
    } else {
      insist(applied && events.length === (reverted ? 70 : 35), 'REPAIR_NOT_OWNED');
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
    return { mode, id: plan.id, changed: 35 };
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
