/* Disposable PostgreSQL HTTP acceptance. Never point this runner at production. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

function assertIsolatedDatabase() {
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(process.env.BOOKING_DEDUP_QA_CONFIRM, 'isolated-no-outbound-network');
  assert.match(url.hostname, /^tourism-booking-dedup-[a-f0-9]+-db$/);
  assert.equal(url.pathname, '/qa');
  for (const key of Object.keys(process.env)) {
    if (/^(SMTP_|TELEGRAM_|AI_|INGESTION_|EMAIL_)/.test(key)) delete process.env[key];
  }
  Object.assign(process.env, {
    APP_ENV: 'staging', ANALYTICS_ENABLED: 'false', TELEGRAM_PUBLIC_BOT_ENABLED: 'false',
    TELEGRAM_LONG_POLLING_ENABLED: 'false', REVIEW_REQUEST_EMAIL_DISABLED: 'true', PUBLIC_RATE_LIMIT_MAX: '100',
  });
}

async function worker() {
  assertIsolatedDatabase();
  const express = require('express');
  const { loadEnv } = require('@mywave/config');
  const { bookingsRoutes } = require('../dist/modules/bookings/routes.js');
  const { prisma } = require('../dist/lib/prisma.js');
  const app = express();
  app.use(express.json({ strict: false }));
  app.use('/bookings', bookingsRoutes(loadEnv()));
  app.use((_error, _req, res, _next) => res.status(500).json({ error: 'internal' }));
  const server = app.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));
  process.on('message', async (message) => {
    if (message === 'stop') {
      await new Promise(resolve => server.close(resolve));
      await prisma.$disconnect();
      process.exit(0);
    }
  });
}

async function inside() {
  assertIsolatedDatabase();
  const { prisma } = require('../dist/lib/prisma.js');
  const { PrismaClient } = require('@prisma/client');
  const workers = [];
  const results = [];
  let releaseLock;
  let heldTransaction;
  let blocker;
  const check = (name, detail = {}) => results.push({ name, passed: true, ...detail });
  try {
    assert.equal(await prisma.booking.count(), 0, 'database must be empty');
    const org = await prisma.organizer.create({ data: { displayName: 'Isolated intake QA', contactEmail: 'qa-org@example.invalid', verificationStatus: 'verified' } });
    const data = { organizerId: org.id, title: 'Isolated intake QA', discipline: 'trekking', region: 'QA', startDate: new Date(Date.now() + 86400000), endDate: new Date(Date.now() + 172800000), durationDays: 2, publishStatus: 'published', reviewStatus: 'ok' };
    const program = await prisma.program.create({ data });
    const other = await prisma.program.create({ data });
    const hidden = await prisma.program.create({ data: { ...data, publishStatus: 'draft' } });
    for (let i = 0; i < 2; i++) {
      const child = cp.fork(__filename, ['--worker'], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
      // Do not forward request payloads, contacts or Prisma errors to CI logs.
      child.stdout.resume(); child.stderr.resume(); workers.push(child);
      const port = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('worker startup timeout')), 20000);
        child.once('message', message => { clearTimeout(timer); resolve(message.port); });
        child.once('exit', () => { clearTimeout(timer); reject(Error('worker exited during startup')); });
      });
      child.qaBase = `http://127.0.0.1:${port}`;
    }
    const post = async (body, index = 0) => {
      const response = await fetch(workers[index].qaBase + '/bookings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
      return { status: response.status, data: await response.json() };
    };
    const body = { programId: program.id, guestContact: 'qa-concurrent@example.invalid', legalConsent: true, sourceChannel: 'isolated-qa', utmSource: 'qa', entryType: 'program', entryId: program.id };
    for (const input of [null, {}, { ...body, guestContact: '  ' }, { ...body, legalConsent: false }, { ...body, legalConsent: 'true' }]) assert.equal((await post(input)).status, 400);
    assert.equal((await post({ ...body, programId: hidden.id })).status, 404);
    assert.equal((await fetch(workers[0].qaBase + '/bookings')).status, 401);
    assert.equal(await prisma.booking.count(), 0);
    check('validation_consent_availability_admin_unchanged');

    const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => post({ ...body, guestContact: i % 2 ? ` ${body.guestContact} ` : body.guestContact }, i % 2)));
    const created = responses.filter(r => r.status === 201);
    const duplicates = responses.filter(r => r.status === 409);
    assert.equal(created.length, 1); assert.equal(duplicates.length, 7);
    assert.ok(duplicates.every(r => r.data.bookingId === created[0].data.id));
    assert.equal(await prisma.booking.count(), 1);
    const saved = await prisma.booking.findUnique({ where: { id: created[0].data.id } });
    assert.ok(saved.legalConsentAt); assert.ok(saved.legalConsentPolicyVersion);
    assert.equal(saved.utmSource, 'qa'); assert.equal(saved.organizerId, org.id); assert.equal(saved.guestContact, body.guestContact);
    check('eight_concurrent_requests_across_two_workers', { requests: 8, created: 1, duplicates: 7, bookingRows: 1, sameBookingId: true });
    const sequential = await post(body);
    assert.equal(sequential.status, 409); assert.equal(sequential.data.bookingId, saved.id);
    check('sequential_duplicate_returns_existing_id');

    // A deliberately held key must block its own request while other identities progress.
    const blockedContact = 'qa-held-key@example.invalid';
    const digest = crypto.createHash('sha256').update(JSON.stringify([program.id, blockedContact])).digest();
    blocker = new PrismaClient();
    let locked;
    const acquired = new Promise(resolve => { locked = resolve; });
    const release = new Promise(resolve => { releaseLock = resolve; });
    heldTransaction = blocker.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${digest.readInt32BE(0)}::int, ${digest.readInt32BE(4)}::int)`;
      locked(); await release;
    }, { timeout: 25000 });
    await acquired;
    let blockedFinished = false;
    const blocked = post({ ...body, guestContact: blockedContact }).then(r => { blockedFinished = true; return r; });
    let waiting = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      const rows = await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event = 'advisory'`;
      if (rows[0].count > 0) { waiting = true; break; }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(waiting, 'same-key request must wait on PostgreSQL, not a process mutex');
    assert.equal((await post({ ...body, guestContact: 'qa-independent@example.invalid' }, 1)).status, 201);
    assert.equal(blockedFinished, false, 'different contact must progress while held key waits');
    assert.equal((await post({ ...body, programId: other.id, guestContact: blockedContact }, 1)).status, 201);
    assert.equal(blockedFinished, false, 'different program must progress while held key waits');
    releaseLock(); await heldTransaction; heldTransaction = null;
    assert.equal((await blocked).status, 201);
    check('independent_contacts_and_programs_progress_during_held_lock', { postgresWaitObserved: true });

    await prisma.booking.update({ where: { id: saved.id }, data: { createdAt: new Date(Date.now() - 121000) } });
    assert.equal((await post(body)).status, 201);
    assert.equal(await prisma.booking.count({ where: { programId: program.id, guestContact: body.guestContact } }), 2);
    check('two_minute_window_remains_a_window_not_permanent_idempotency');
    assert.equal((await post({ ...body, guestContact: body.guestContact.toUpperCase() })).status, 201);
    check('existing_contact_case_semantics_unchanged');
    assert.equal(await prisma.subscriptionDelivery.count(), 0);
    console.log('BOOKING_DEDUP_EVIDENCE_START' + JSON.stringify({ checkedAt: new Date().toISOString(), source: process.env.BOOKING_DEDUP_QA_SOURCE, results, workers: 2, outboundNetwork: 'blocked', publishedPorts: [], productionChanged: false }) + 'BOOKING_DEDUP_EVIDENCE_END');
  } finally {
    releaseLock?.(); await heldTransaction?.catch(() => {});
    for (const child of workers) {
      if (child.exitCode !== null) continue;
      child.send('stop');
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(() => { child.kill(); resolve(); }, 5000))]);
    }
    await blocker?.$disconnect(); await prisma.$disconnect();
  }
}

async function outside() {
  const option = name => process.argv[process.argv.indexOf(name) + 1];
  assert.ok(process.argv.includes('--image') && process.argv.includes('--source') && process.argv.includes('--out'), 'Usage: node services/api/scripts/booking-intake-dedup.qa.cjs --image <build-image> --source <40-sha> --out <directory>');
  const image = option('--image'), source = option('--source'), out = path.resolve(option('--out'));
  assert.match(source, /^[a-f0-9]{40}$/); fs.mkdirSync(out, { recursive: true });
  const owner = crypto.randomBytes(6).toString('hex'), prefix = 'tourism-booking-dedup-' + owner;
  const db = prefix + '-db', api = prefix + '-api', migrate = prefix + '-migrate', secret = crypto.randomBytes(24).toString('hex');
  const evidence = { source, image, owner, startedAt: new Date().toISOString(), productionChanged: false, steps: [] };
  function run(args, name, allowFailure = false, timeout = 180000) {
    const result = cp.spawnSync('docker', args, { encoding: 'utf8', timeout, maxBuffer: 12 * 1024 * 1024 });
    const output = ((result.stdout || '') + (result.stderr || '')).replaceAll(secret, '[QA_PASSWORD]');
    fs.appendFileSync(path.join(out, name.replace(/[^a-zA-Z0-9_.-]/g, '_') + '.log'), output);
    evidence.steps.push({ name, exitCode: result.status });
    if (!allowFailure && result.status !== 0) throw Error(name + ' failed; see sanitized log');
    return { code: result.status, output };
  }
  const inspect = (kind, name) => {
    const r = run([kind, 'inspect', name], 'inspect-' + name, true);
    if (r.code !== 0) return null;
    return JSON.parse(r.output)[0];
  };
  let protectedBefore = [];
  try {
    protectedBefore = run(['ps', '--format', '{{.Names}}|{{.ID}}'], 'protected-before').output.trim().split('\n').filter(s => /^(mywave-knowledge-|mywave_ai_team_presets_v1_1-)/.test(s));
    const img = inspect('image', image); assert.ok(img);
    assert.equal(img.Config.Labels['org.opencontainers.image.revision'], source); evidence.imageId = img.Id;
    run(['network', 'create', '--internal', '--label', 'codex.qa.owner=' + owner, prefix], 'network-create');
    assert.equal(inspect('network', prefix).Internal, true);
    run(['run', '-d', '--name', db, '--network', prefix, '--label', 'codex.qa.owner=' + owner, '--memory', '384m', '--tmpfs', '/var/lib/postgresql/data:rw,size=256m', '-e', 'POSTGRES_USER=qa', '-e', 'POSTGRES_DB=qa', '-e', 'POSTGRES_PASSWORD=' + secret, 'postgres:16-alpine', 'postgres', '-c', 'shared_buffers=16MB'], 'database-start');
    let ready = false;
    for (let i = 0; i < 40; i++) {
      if (run(['exec', db, 'pg_isready', '-U', 'qa', '-d', 'qa'], 'database-ready', true, 15000).code === 0) { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready);
    const dbi = inspect('container', db); assert.deepEqual(dbi.HostConfig.PortBindings, {});
    const databaseUrl = 'postgresql://qa:' + secret + '@' + db + ':5432/qa';
    const common = ['--rm', '--network', prefix, '--label', 'codex.qa.owner=' + owner, '--memory', '1g', '-w', '/app/services/api', '-e', 'DATABASE_URL=' + databaseUrl];
    run(['run', ...common, '--name', migrate, '--entrypoint', 'node', image, 'node_modules/prisma/build/index.js', 'migrate', 'deploy'], 'migrations');
    const report = run(['run', ...common, '--name', api, '-e', 'BOOKING_DEDUP_QA_CONFIRM=isolated-no-outbound-network', '-e', 'BOOKING_DEDUP_QA_SOURCE=' + source, '-e', 'JWT_SECRET=' + secret, '-e', 'ADMIN_JWT_SECRET=' + secret, '--entrypoint', 'node', image, 'scripts/booking-intake-dedup.qa.cjs', '--inside'], 'http-postgres', false, 180000);
    const block = report.output.split('BOOKING_DEDUP_EVIDENCE_START')[1]?.split('BOOKING_DEDUP_EVIDENCE_END')[0];
    assert.ok(block, 'HTTP/Postgres evidence missing'); evidence.integration = JSON.parse(block);
  } catch (error) {
    evidence.failure = error.message; process.exitCode = 1;
  } finally {
    const cleanupErrors = [];
    for (const name of [api, migrate, db]) {
      try {
        const item = inspect('container', name);
        if (item) { assert.equal(item.Config.Labels['codex.qa.owner'], owner); run(['rm', '-f', name], 'cleanup-container'); }
      } catch { cleanupErrors.push(name); }
    }
    try {
      const network = inspect('network', prefix);
      if (network) { assert.equal(network.Labels['codex.qa.owner'], owner); run(['network', 'rm', prefix], 'cleanup-network'); }
    } catch { cleanupErrors.push(prefix); }
    evidence.cleanupErrors = cleanupErrors;
    if (cleanupErrors.length) process.exitCode = 1;
    const after = run(['ps', '--format', '{{.Names}}|{{.ID}}'], 'protected-after', true);
    evidence.protectedContainersUnchanged = after.code === 0 && protectedBefore.every(line => after.output.trim().split('\n').includes(line));
    if (!evidence.protectedContainersUnchanged) process.exitCode = 1;
    evidence.completedAt = new Date().toISOString(); evidence.exitCode = process.exitCode || 0;
    fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log('BOOKING_DEDUP_QA_EXIT=' + evidence.exitCode);
  }
}

const run = process.argv.includes('--worker') ? worker : process.argv.includes('--inside') ? inside : outside;
run().catch(error => { console.error('BOOKING_DEDUP_QA_FAILED:', error.name); process.exitCode = 1; });
