'use strict';
// Fictional fixtures in the existing disposable QA database; no workers or outbound traffic.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require('./admin-card-qa-guard.cjs').assertAdminCardQaTarget(process.env);
for (const key of Object.keys(process.env)) if (/^(SMTP_|TELEGRAM_|AI_|OPENAI_|INGESTION_|EMAIL_|CONTENT_PIPELINE_)/.test(key)) delete process.env[key];
Object.assign(process.env, { APP_ENV: 'staging', JWT_SECRET: crypto.randomBytes(32).toString('hex'), ADMIN_JWT_SECRET: crypto.randomBytes(32).toString('hex'), ANALYTICS_ENABLED: 'false', TELEGRAM_PUBLIC_BOT_ENABLED: 'false', TELEGRAM_LONG_POLLING_ENABLED: 'false', AI_ENABLED: 'false', PUBLIC_RATE_LIMIT_MAX: '200' });
const express = require('express');
const { loadEnv } = require('@mywave/config');
const { prisma } = require('../dist/lib/prisma.js');
const { programsRoutes } = require('../dist/modules/programs/routes.js');
const { bookingsRoutes } = require('../dist/modules/bookings/routes.js');
const nativeFetch = global.fetch;
let blockedOutbound = 0;
global.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url || String(input));
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) { blockedOutbound++; throw new Error('QA outbound blocked'); }
  return nativeFetch(input, init);
};
const report = [];
let server;
async function main() {
  const env = loadEnv(), run = crypto.randomBytes(6).toString('hex'), day = 86400000, now = Date.now();
  const organizer = await prisma.organizer.create({ data: { displayName: 'Сопровождение горных маршрутов', contactEmail: 'fixture@example.invalid', verificationStatus: 'verified' } });
  const hiddenOrganizer = await prisma.organizer.create({ data: { displayName: 'Приостановленные маршруты', contactEmail: 'hidden-fixture@example.invalid', verificationStatus: 'paused' } });
  const base = { organizerId: organizer.id, organizerName: organizer.displayName, title: 'Поездка по горной долине', discipline: 'trekking', region: 'Камчатка', startDate: new Date(now - 4 * day), endDate: new Date(now - 2 * day), durationDays: 3, publishStatus: 'archived', autoPublished: false, reviewStatus: 'ok', sourceUrl: 'https://t.me/mountain_trips/101', media: { create: [{ mediaType: 'image', url: '/ingestion-media/original-fixture.jpg', position: 0 }] } };
  const create = (name, patch = {}) => prisma.program.create({ data: { ...base, id: `completed-${run}-${name}`, ...patch } });
  const automatic = await create('automatic');
  const publishedPast = await create('published-past', { publishStatus: 'published' });
  const manual = await create('manual');
  const pending = await create('pending', { autoPublished: true, reviewStatus: 'auto_pending' });
  const hidden = await create('hidden', { organizerId: hiddenOrganizer.id });
  const draft = await create('draft', { publishStatus: 'draft' });
  const paused = await create('paused', { publishStatus: 'paused' });
  const current = await create('current', { publishStatus: 'published', startDate: new Date(now + day), endDate: new Date(now + 3 * day) });
  const autoAudit = p => prisma.auditLog.create({ data: { entityType: 'program', entityId: p.id, changedField: 'publish_status_change', oldValue: 'published', newValue: 'archived', changedBy: 'system:expired-program-archiver', reason: 'AUTO_ARCHIVED: program endDate is in the past', createdAt: new Date(now - 600000) } });
  for (const p of [automatic, pending, hidden]) await autoAudit(p);
  const app = express(); app.use(express.json()); app.use('/programs', programsRoutes(env)); app.use('/bookings', bookingsRoutes(env));
  app.use((_e, _req, res, _next) => res.status(500).json({ error: 'qa_internal_error' }));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function request(name, path, expected, body) {
    const response = await fetch(origin + path, { method: body ? 'POST' : 'GET', ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
    const json = await response.json(); report.push({ name, expected, status: response.status }); assert.equal(response.status, expected, name);
    if (path.startsWith('/programs/')) assert.equal(response.headers.get('cache-control'), 'no-store');
    return json;
  }
  const counts = async () => ({ bookings: await prisma.booking.count(), deals: await prisma.deal.count(), subscriptions: await prisma.updateSubscription.count(), audits: await prisma.auditLog.count(), media: await prisma.programMedia.count() });
  const before = await counts();
  const detail = await request('automatic_archive_readable_with_original_media', '/programs/' + automatic.id, 200);
  assert.equal(detail.publicView, 'completed'); assert.equal(detail.publishStatus, 'archived'); assert.equal(detail.media.length, 1); assert.equal(detail.media[0].url, '/ingestion-media/original-fixture.jpg'); assert.ok(!('intakeSource' in detail));
  assert.equal((await request('published_completed_before_archiver', '/programs/' + publishedPast.id, 200)).publicView, 'completed');
  assert.equal((await request('current_published_still_readable', '/programs/' + current.id, 200)).publicView, undefined);
  for (const [name, p] of [['manual_archive', manual], ['unreviewed_archive', pending], ['hidden_organizer_archive', hidden], ['draft', draft], ['paused', paused]]) await request(name + '_hidden', '/programs/' + p.id, 404);
  const catalogue = await request('catalogue_does_not_include_completed_details', '/programs', 200);
  assert.ok(catalogue.some(p => p.id === current.id));
  for (const p of [automatic, publishedPast, manual, pending, hidden, draft, paused]) assert.ok(!catalogue.some(row => row.id === p.id));
  for (const p of [automatic, publishedPast]) await request('completed_booking_denied_' + p.publishStatus, '/bookings', 404, { programId: p.id, guestContact: 'fixture@example.invalid', legalConsent: true });
  assert.deepEqual(await counts(), before, 'Read access/negative intake must not write records');
  await prisma.auditLog.create({ data: { entityType: 'program', entityId: automatic.id, changedField: 'publish_status_change', oldValue: 'archived', newValue: 'archived', changedBy: 'fixture-operator', reason: 'Manual withdrawal', createdAt: new Date(now - 300000) } });
  await request('later_manual_withdrawal_effective_without_cached_200', '/programs/' + automatic.id, 404);
  assert.equal(await prisma.booking.count(), before.bookings);
  console.log(JSON.stringify({ scenarios: report.length, report, blockedOutbound, before, after: await counts(), limitation: 'Isolated HTTP/PostgreSQL; fictional records only; one final audit is a deliberate withdrawal fixture.' }, null, 2));
  console.log('ISOLATED_COMPLETED_PUBLIC_DETAIL_AND_BOOKING_GUARDS_PASSED');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } await prisma.$disconnect(); });
