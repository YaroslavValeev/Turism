// Read-only fingerprints: raw link pointers and audit entries are deliberately excluded.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { RELEASE, validatePlan } = require('./repair-source-run-links.cjs');
function stable(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
async function snapshot(prisma) {
  return prisma.$transaction(async tx => {
    const fingerprints = {};
    for (const model of ['program', 'programMedia', 'organizer', 'sourceRun', 'rawItem']) {
      const rows = await tx[model].findMany({ orderBy: { id: 'asc' } });
      if (model === 'rawItem') for (const row of rows) delete row.sourceRunId;
      fingerprints[model] = { count: rows.length, sha256: crypto.createHash('sha256').update(JSON.stringify(stable(rows))).digest('hex') };
    }
    const rawUnlinked = await tx.rawItem.count({ where: { sourceRunId: null } });
    const publicationTraceGaps = await tx.publishedProgram.count({ where: { candidate: { normalizedItem: { rawItem: { sourceRunId: null } } } } });
    return { checkedAt: new Date().toISOString(), fingerprints, rawUnlinked, publicationTraceGaps };
  }, { isolationLevel: 'RepeatableRead', timeout: 60000 });
}
function verify(before, after) {
  assert.deepEqual(after.fingerprints, before.fingerprints, 'CONTENT_OR_RUNS_CHANGED: inspect concurrent activity; do not restore the whole DB');
  assert.equal(after.rawUnlinked, before.rawUnlinked - 31, 'UNEXPECTED_RAW_LINK_DELTA');
  assert.equal(after.publicationTraceGaps, 0, 'PUBLICATION_TRACE_GAPS_REMAIN');
}
async function cli() {
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 || args.length === 2, 'INVALID_ARGUMENTS');
  const response = await fetch('http://127.0.0.1:3001/health', { signal: AbortSignal.timeout(15000) });
  assert.ok(response.ok); const health = await response.json();
  assert.equal(health.status, 'ok'); assert.equal(health.release?.releaseSha, RELEASE);
  const { prisma } = require(path.resolve(process.cwd(), 'dist/lib/prisma.js'));
  try {
    const result = await snapshot(prisma);
    if (args.length) {
      const plan = JSON.parse(fs.readFileSync(args[1], 'utf8')); validatePlan(plan);
      assert.equal(await prisma.rawItem.count({ where: { OR: plan.links.map(l => ({ id: l.rawId, sourceRunId: l.newValue })) } }), 31);
      verify(JSON.parse(fs.readFileSync(args[0], 'utf8')), result);
    }
    console.log(JSON.stringify(result, null, 2));
  } finally { await prisma.$disconnect(); }
}
module.exports = { snapshot, verify, stable };
if (require.main === module) cli().catch(() => { console.error('STOP: read-only verification failed. Inspect saved plan and repair audits; do not restart, retry blindly or restore the DB.'); process.exitCode = 1; });
