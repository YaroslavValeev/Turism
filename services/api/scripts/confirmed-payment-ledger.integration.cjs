const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { createRequire } = require('node:module');
const { fork } = require('node:child_process');

const target = new URL(process.env.DATABASE_URL);
assert.equal(process.env.CONFIRMED_PAYMENT_QA_CONFIRM, 'isolated-no-outbound-network');
assert.equal(target.protocol, 'postgresql:');
assert.match(target.hostname, /^tourism-payments-qa-[0-9a-f]{8}-db$/);
assert.equal(target.pathname, '/qa_payments');
assert.equal(target.username, 'qa_payments');
const workerMode = process.argv.includes('--worker');
for (const key of Object.keys(process.env)) if (/^(SMTP_|TELEGRAM_|AI_|INGESTION_|EMAIL_)/.test(key)) delete process.env[key];
Object.assign(process.env, {
  APP_ENV: 'staging', ANALYTICS_ENABLED: 'false', TELEGRAM_PUBLIC_BOT_ENABLED: 'false',
  TELEGRAM_LONG_POLLING_ENABLED: 'false', REVIEW_REQUEST_EMAIL_DISABLED: 'true',
  ...(!workerMode ? { JWT_SECRET: crypto.randomBytes(32).toString('hex'), ADMIN_JWT_SECRET: crypto.randomBytes(32).toString('hex') } : {}),
});
const apiRequire = createRequire(path.resolve(__dirname, '../package.json'));
const express = apiRequire('express');
const jwt = apiRequire('jsonwebtoken');
const { loadEnv } = apiRequire('@mywave/config');
const env = loadEnv();
const { prisma } = apiRequire('./dist/lib/prisma.js');
const analytics = apiRequire('./dist/modules/analytics/service.js');
const events = [];
const visibilityChecks = [];
// Instrument only the analytics boundary; no external recipient or background worker.
analytics.emitBackendAnalyticsEventBestEffort = (event) => {
  events.push(event);
  if (event.payment_id) visibilityChecks.push(prisma.payment.findUnique({ where: { id: event.payment_id } }).then(Boolean));
};
const { paymentsRoutes } = apiRequire('./dist/modules/payments/routes.js');
let server;
let worker;
const report = [];

async function startServer() {
  const app = express(); app.use(express.json()); app.use('/payments', paymentsRoutes(env));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  return 'http://127.0.0.1:' + server.address().port;
}

async function main() {
  if (workerMode) {
    const base = await startServer(); process.send({ base });
    process.on('message', async message => {
      if (message === 'stop') { await shutdown(); process.exit(0); }
    });
    return;
  }
  assert.equal(await prisma.booking.count(), 0, 'fresh disposable database required');
  const base = await startServer();
  const token = jwt.sign({ sub: 'qa-admin', role: 'admin' }, env.ADMIN_JWT_SECRET, { expiresIn: '10m' });
  const org = await prisma.organizer.create({ data: { displayName: 'QA Payment Organizer', contactEmail: 'qa@example.invalid', verificationStatus: 'verified' } });
  const program = await prisma.program.create({ data: { organizerId: org.id, title: 'QA Payment Trip', discipline: 'trekking', region: 'QA', startDate: new Date(Date.now() + 30 * 86400000), endDate: new Date(Date.now() + 35 * 86400000), durationDays: 5, publishStatus: 'published', reviewStatus: 'ok' } });
  async function fixture(status = 'booked') {
    return prisma.booking.create({ data: { organizerId: org.id, programId: program.id, guestContact: 'qa@example.invalid', bookingStatus: status, legalConsentAt: new Date(), legalConsentPolicyVersion: 'isolated-qa', ...(status === 'completed' ? { completedAt: new Date() } : {}) } });
  }
  async function post(bookingId, data, destination = base, admin = true) {
    const response = await fetch(destination + '/payments', { method: 'POST', headers: { 'content-type': 'application/json', ...(admin ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ bookingId, ...data }), signal: AbortSignal.timeout(30000) });
    return { status: response.status, body: await response.json() };
  }
  async function state(id) {
    return { booking: await prisma.booking.findUnique({ where: { id } }), deal: await prisma.deal.findUnique({ where: { bookingId: id } }), commission: await prisma.commission.findUnique({ where: { bookingId: id } }) };
  }
  const denied = await post('missing', { amountRub: 10000 }, base, false);
  assert.equal(denied.status, 401); report.push('payment_requires_admin');
  for (const status of ['recorded', 'failed', 'reversed']) {
    const b = await fixture(); const before = await state(b.id);
    const response = await post(b.id, { amountRub: 10000, status }); assert.equal(response.status, 201);
    assert.equal(response.body.payment.status, status); assert.equal(response.body.commission, null);
    assert.deepEqual(await state(b.id), before);
    assert.equal(await prisma.payment.count({ where: { bookingId: b.id } }), 1);
    assert.equal(await prisma.auditLog.count({ where: { entityId: response.body.payment.id, entityType: 'payment' } }), 1);
    report.push('non_confirmed_' + status + '_no_financial_change');
  }
  const partial = await fixture();
  assert.equal((await post(partial.id, { amountRub: 3000, paymentKind: 'partial' })).status, 201);
  assert.equal((await state(partial.id)).booking.bookingStatus, 'paid_partial');
  const existing = await state(partial.id);
  assert.equal((await post(partial.id, { amountRub: 5000, status: 'failed' })).status, 201);
  assert.deepEqual(await state(partial.id), existing); report.push('non_confirmed_preserves_existing_commission');
  assert.equal((await post(partial.id, { amountRub: 7000, paymentKind: 'full' })).status, 201);
  assert.equal((await state(partial.id)).booking.bookingStatus, 'paid_full');
  assert.equal((await state(partial.id)).booking.paidAmountRub, 10000); report.push('partial_then_final_full');
  for (const status of ['completed', 'disputed']) {
    const b = await fixture(status);
    assert.equal((await post(b.id, { amountRub: 3000, paymentKind: 'partial' })).status, 201);
    assert.equal((await state(b.id)).booking.bookingStatus, status); report.push('preserves_' + status);
  }

  // Inject a later write failure through the transaction client, after ledger/booking/audit/deal writes.
  const failed = await fixture(); const beforeFailure = await state(failed.id); const eventCount = events.length;
  const auditCountBefore = await prisma.auditLog.count();
  const originalTransaction = prisma.$transaction;
  prisma.$transaction = function(callback, options) {
    return originalTransaction.call(prisma, async tx => callback(new Proxy(tx, {
      get(target, key) {
        if (key === 'commission') return new Proxy(target.commission, { get(model, operation) { if (operation === 'upsert') return async () => { throw new Error('QA_COMMISSION_FAULT'); }; const value = Reflect.get(model, operation); return typeof value === 'function' ? value.bind(model) : value; } });
        const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
      },
    })), options);
  };
  try {
    const response = await post(failed.id, { amountRub: 10000 }); assert.equal(response.status, 400); assert.match(response.body.error, /QA_COMMISSION_FAULT/);
  } finally { prisma.$transaction = originalTransaction; }
  assert.deepEqual(await state(failed.id), beforeFailure);
  assert.equal(await prisma.payment.count({ where: { bookingId: failed.id } }), 0);
  assert.equal(await prisma.auditLog.count(), auditCountBefore);
  assert.equal(events.length, eventCount); report.push('later_failure_rolls_back_all_writes_and_events');

  worker = fork(__filename, ['--worker'], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'], env: process.env });
  const otherBase = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('QA worker timeout')), 30000);
    worker.once('message', message => { clearTimeout(timer); resolve(message.base); });
    worker.once('error', error => { clearTimeout(timer); reject(error); });
    worker.once('exit', code => { clearTimeout(timer); reject(new Error('QA worker exited early: ' + code)); });
  });
  const concurrent = await fixture();
  let release;
  let entered;
  let paused = false;
  const held = new Promise(resolve => { release = resolve; });
  const firstRead = new Promise(resolve => { entered = resolve; });
  prisma.$transaction = function(callback, options) {
    return originalTransaction.call(prisma, async tx => callback(new Proxy(tx, {
      get(target, key) {
        if (key === 'booking') return new Proxy(target.booking, { get(model, operation) {
          if (operation === 'findUnique') return async (...args) => {
            const result = await model.findUnique(...args);
            if (!paused && result?.id === concurrent.id) { paused = true; entered(); await held; }
            return result;
          };
          const value = Reflect.get(model, operation); return typeof value === 'function' ? value.bind(model) : value;
        } });
        const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
      },
    })), options);
  };
  let responses;
  let second;
  const first = post(concurrent.id, { amountRub: 3000, paymentKind: 'partial', externalReference: 'QA-DISTINCT-A' });
  try {
    await Promise.race([firstRead, first.then(() => { throw new Error('First payment did not reach the transaction barrier'); })]);
    second = post(concurrent.id, { amountRub: 7000, paymentKind: 'partial', externalReference: 'QA-DISTINCT-B' }, otherBase);
    const { Prisma } = apiRequire('@prisma/client');
    let lockObserved = false;
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const rows = await prisma.$queryRaw(Prisma.sql`SELECT count(*)::int AS "count" FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FOR UPDATE%' AND query LIKE '%bookings%'`);
      if (rows[0].count > 0) { lockObserved = true; break; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(lockObserved, 'The other API process must wait on the booking row lock');
    report.push('row_lock_blocks_other_api_process_until_commit');
    release();
    responses = await Promise.all([first, second]);
  } finally { release(); prisma.$transaction = originalTransaction; await Promise.allSettled([first, second].filter(Boolean)); }
  assert.deepEqual(responses.map(r => r.status), [201, 201]);
  const concurrentState = await state(concurrent.id);
  assert.equal(concurrentState.booking.paidAmountRub, 10000); assert.equal(concurrentState.booking.netAmountRub, 10000);
  assert.equal(concurrentState.booking.bookingStatus, 'paid_partial'); assert.equal(concurrentState.commission.commissionAmountRub, 300);
  assert.equal(await prisma.payment.count({ where: { bookingId: concurrent.id } }), 2);
  report.push('two_api_processes_concurrent_distinct_payments_no_lost_update');
  assert.ok((await Promise.all(visibilityChecks)).every(Boolean), 'payment events must observe committed rows'); report.push('analytics_observe_committed_payment_rows');
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), scenarios: report.length, report, disposableDatabase: true, realTransfer: false, productionChanged: false, externalMessagesSent: false, idempotencyCovered: false, historicalRepairPerformed: false }, null, 2));
  console.log('CONFIRMED_PAYMENT_LEDGER_PASSED');
}

async function shutdown() {
  if (worker) { const child = worker; worker = null; const exited = new Promise(resolve => child.once('exit', resolve)); child.send('stop'); const timer = setTimeout(() => child.kill('SIGTERM'), 5000); await exited; clearTimeout(timer); }
  if (server) { await new Promise(resolve => server.close(resolve)); server = null; }
  await prisma.$disconnect();
}
main().catch(error => { console.error('STOP:', error.message); process.exitCode = 1; }).finally(async () => { if (!workerMode) await shutdown(); });
