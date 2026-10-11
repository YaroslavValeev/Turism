// Real HTTP + PostgreSQL, fictional records only, no application entrypoint/schedulers.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { assertAdminCardQaTarget } = require('./admin-card-qa-guard.cjs');
assertAdminCardQaTarget(process.env);
for (const key of Object.keys(process.env)) {
  if (/^(SMTP_|TELEGRAM_|AI_|OPENAI_|INGESTION_|EMAIL_|CONTENT_PIPELINE_)/.test(key)) delete process.env[key];
}
Object.assign(process.env, {
  APP_ENV: 'staging', JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  ADMIN_JWT_SECRET: crypto.randomBytes(32).toString('hex'), ANALYTICS_ENABLED: 'false',
  TELEGRAM_PUBLIC_BOT_ENABLED: 'false', TELEGRAM_LONG_POLLING_ENABLED: 'false',
  REVIEW_REQUEST_EMAIL_DISABLED: 'true', PUBLIC_RATE_LIMIT_MAX: '200', AI_ENABLED: 'false',
});
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { loadEnv } = require('@mywave/config');
const env = loadEnv();
const { prisma } = require('../dist/lib/prisma.js');
const { authRoutes } = require('../dist/modules/auth/routes.js');
const { organizersRoutes } = require('../dist/modules/organizers/routes.js');
const { programsRoutes } = require('../dist/modules/programs/routes.js');
const nativeFetch = global.fetch;
let externalFetchesBlocked = 0;
global.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url || String(input));
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
    externalFetchesBlocked++;
    throw new Error('QA outbound fetch blocked');
  }
  return nativeFetch(input, init);
};
const report = [];
let server;

async function main() {
  for (const model of ['user', 'organizer', 'program', 'booking', 'updateSubscription']) {
    assert.equal(await prisma[model].count(), 0, 'QA database must be newly empty');
  }
  const password = crypto.randomBytes(24).toString('hex');
  const admin = await prisma.user.create({ data: {
    email: 'admin@example.invalid', role: 'admin', passwordHash: await bcrypt.hash(password, 10),
  } });
  const member = await prisma.user.create({ data: {
    email: 'member@example.invalid', role: 'user', passwordHash: await bcrypt.hash(password, 10),
  } });
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes(env));
  app.use('/organizers', organizersRoutes(env));
  app.use('/programs', programsRoutes(env));
  app.use((error, request, response, next) => response.status(500).json({ error: 'qa_internal_error' }));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let token;
  async function request(name, path, method, body, expected, credential = token, contentType = 'application/json') {
    const response = await fetch(base + path, {
      method, headers: { 'content-type': contentType, ...(credential ? { authorization: `Bearer ${credential}` } : {}) },
      ...(body === undefined ? {} : { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) }),
      signal: AbortSignal.timeout(25000),
    });
    const data = response.status === 204 ? null : await response.json();
    report.push({ name, status: response.status, expected, passed: response.status === expected });
    assert.equal(response.status, expected, name);
    return data;
  }
  await request('login_missing_fields', '/auth/login', 'POST', {}, 400, null);
  await request('login_wrong_password', '/auth/login', 'POST', { email: admin.email, password: 'incorrect-fixture-value' }, 401, null);
  await request('member_cannot_login_admin', '/auth/login', 'POST', { email: member.email, password }, 401, null);
  token = (await request('real_admin_login', '/auth/login', 'POST', { email: admin.email, password }, 200, null)).token;
  assert.equal(jwt.verify(token, env.ADMIN_JWT_SECRET).sub, admin.id);
  await request('program_create_anonymous', '/programs', 'POST', {}, 401, null);
  await request('program_create_nonadmin', '/programs', 'POST', {}, 403,
    jwt.sign({ sub: member.id, role: 'user' }, env.ADMIN_JWT_SECRET));
  await request('expired_session_private_endpoint', '/organizers/qa-expiry-probe', 'GET', undefined, 401,
    jwt.sign({ sub: admin.id, role: 'admin' }, env.ADMIN_JWT_SECRET, { expiresIn: -1 }));
  await request('expired_catalog_admin_scope_forbidden', '/programs?all=1', 'GET', undefined, 403,
    jwt.sign({ sub: admin.id, role: 'admin' }, env.ADMIN_JWT_SECRET, { expiresIn: -1 }));
  const organizer = await request('create_organizer', '/organizers', 'POST', {
    displayName: 'Группа сопровождения', contactEmail: 'owner@example.invalid', verificationStatus: 'listed',
  }, 201);
  const orgPath = `/organizers/${organizer.id}`;
  await request('private_organizer_requires_admin', orgPath, 'GET', undefined, 401, null);
  const publicOrganizers = await request('public_organizers_allowlist', '/organizers', 'GET', undefined, 200, null);
  assert.ok(publicOrganizers.every(item => !('contactEmail' in item) && !('contactPhone' in item)));
  await request('verification_step_skip_rejected', orgPath + '/verification-status', 'PATCH', { verificationStatus: 'verified' }, 400);
  await request('verification_without_evidence_rejected', orgPath + '/verification-status', 'PATCH', { verificationStatus: 'checked' }, 400);
  await request('verification_with_evidence', orgPath + '/verification-status', 'PATCH', {
    verificationStatus: 'checked', evidence: { notes: 'Изолированная проверка маршрута: вымышленные данные.' },
  }, 200);
  await request('organizer_verified', orgPath + '/verification-status', 'PATCH', { verificationStatus: 'verified' }, 200);
  const start = new Date(Date.now() + 30 * 86400000).toISOString();
  const end = new Date(Date.now() + 35 * 86400000).toISOString();
  const program = await request('create_draft', '/programs', 'POST', {
    organizerId: organizer.id, organizerName: organizer.displayName, title: 'Маршрут вдоль озера',
    discipline: 'trekking', region: 'Камчатка', startDate: start, endDate: end, durationDays: 6,
    levelRequired: 'beginner', riskLevel: 'moderate', priceFromRub: 15000, capacityTotal: 10,
    audienceFit: 'Пеший маршрут с сопровождающим.', itineraryDayByDay: 'Встреча, маршрут, возвращение.',
    gearRequirements: 'Подготовленное снаряжение по списку.', medicalLimitations: '',
    cancellationRules: 'Условия отмены согласуются до участия.', intakeSource: 'admin_manual',
  }, 201);
  const path = `/programs/${program.id}`;
  assert.equal(program.publishStatus, 'draft');
  await request('draft_hidden_public', path, 'GET', undefined, 404, null);
  const gate = await request('publish_without_media_rejected', path + '/publish-status', 'PATCH', { publishStatus: 'published' }, 400);
  assert.ok(gate.missing.includes('at least 1 media'));
  const beforeInvalid = await prisma.program.findUnique({ where: { id: program.id } });
  const auditsBeforeInvalid = await prisma.auditLog.count();
  for (const [name, body] of [
    ['empty_title', { title: '   ' }], ['reversed_dates', { endDate: '2000-01-01' }],
    ['negative_price', { priceFromRub: -1 }], ['over_capacity', { spotsAvailable: 11 }],
  ]) await request(name, path, 'PATCH', body, 400);
  assert.deepEqual(await prisma.program.findUnique({ where: { id: program.id } }), beforeInvalid);
  assert.equal(await prisma.auditLog.count(), auditsBeforeInvalid);
  const edited = await request('edit_text_price_capacity', path, 'PATCH', {
    title: 'Маршрут вдоль озера с сопровождением', inclusions: 'Сопровождение и согласованный маршрут.',
    priceFromRub: 18000, spotsAvailable: 8,
  }, 200);
  assert.equal(edited.priceFromRub, 18000);
  assert.ok(edited.manualFields.includes('title'));
  assert.ok(await prisma.auditLog.findFirst({ where: { entityId: program.id, changedField: 'title', changedBy: admin.id } }));
  await request('invalid_media_url', path + '/media', 'POST', { mediaType: 'image', url: 'javascript:invalid' }, 400);
  const first = await request('add_image_reference', path + '/media', 'POST', { mediaType: 'image', url: '/ingestion-media/fixture-one.png' }, 201);
  const second = await request('add_video_reference', path + '/media', 'POST', { mediaType: 'video', url: '/ingestion-media/fixture-video.mp4' }, 201);
  const png = await require('sharp')({ create: { width: 2, height: 2, channels: 4, background: '#ffffff' } }).png().toBuffer();
  const uploaded = await request('upload_png', path + '/media/upload', 'POST', png, 201, token, 'image/png');
  const repeated = await request('repeat_upload_same_cache_path', path + '/media/upload', 'POST', png, 201, token, 'image/png');
  assert.equal(uploaded.url, repeated.url);
  await request('reject_html_as_image', path + '/media/upload', 'POST', Buffer.from('<html>not an image</html>'), 400, token, 'image/png');
  const other = await prisma.program.create({ data: { organizerId: organizer.id, title: 'Другой маршрут', discipline: 'trekking', region: 'Камчатка', startDate: start, endDate: end, durationDays: 6, publishStatus: 'draft' } });
  await request('foreign_program_media_delete_rejected', `/programs/${other.id}/media/${first.id}`, 'DELETE', undefined, 404);
  await request('reorder_with_duplicates_rejected', path + '/media/order', 'PUT', { mediaIds: [first.id, first.id] }, 400);
  const order = [second.id, first.id, uploaded.id, repeated.id];
  const ordered = await request('set_video_cover', path + '/media/order', 'PUT', { mediaIds: order }, 200);
  assert.deepEqual(ordered.map(item => item.id), order);
  assert.equal((await prisma.program.findUnique({ where: { id: program.id } })).mediaOrderPinned, true);
  await request('publish_complete_card', path + '/publish-status', 'PATCH', { publishStatus: 'published' }, 200);
  const visible = await request('published_public_detail', path, 'GET', undefined, 200, null);
  assert.equal(visible.media[0].id, second.id);
  assert.equal(visible.title, edited.title);
  await request('pause_organizer', orgPath + '/verification-status', 'PATCH', { verificationStatus: 'paused' }, 200);
  await request('paused_organizer_hides_card', path, 'GET', undefined, 404, null);
  await request('return_organizer_to_catalog', orgPath + '/verification-status', 'PATCH', { verificationStatus: 'listed' }, 200);
  await request('returned_organizer_card_visible', path, 'GET', undefined, 200, null);
  await request('archive_card', path + '/publish-status', 'PATCH', { publishStatus: 'archived' }, 200);
  await request('archived_public_detail_hidden', path, 'GET', undefined, 404, null);
  const all = await request('archive_kept_in_admin', '/programs?all=1&publish_status=archived', 'GET', undefined, 200);
  assert.ok(all.some(item => item.id === program.id));
  await request('delete_own_media_reference', path + `/media/${uploaded.id}`, 'DELETE', undefined, 204);
  assert.equal(await prisma.programMedia.count({ where: { id: uploaded.id } }), 0);
  assert.ok(await prisma.auditLog.findFirst({ where: { entityId: uploaded.id, changedField: 'deleted', changedBy: admin.id } }));
  await request('rename_organizer', orgPath, 'PATCH', { displayName: 'Команда сопровождения маршрута' }, 200);
  assert.equal((await prisma.program.findUnique({ where: { id: program.id } })).organizerName, 'Команда сопровождения маршрута');
  assert.equal(await prisma.booking.count(), 0);
  assert.equal(await prisma.updateSubscription.count(), 0);
  assert.equal(await prisma.subscriptionDelivery.count(), 0);
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), scenarios: report.length, report,
    audits: await prisma.auditLog.count(), externalFetchesBlocked, productionChanged: false,
    limitations: 'Real router/DB acceptance, not authenticated browser or real Telegram WebView validation.' }, null, 2));
  console.log('ISOLATED_ADMIN_CARD_ACCEPTANCE_PASSED');
}

main().catch(error => { console.error('STOP:', error.code || error.name); console.log(JSON.stringify({ report })); process.exitCode = 1; })
  .finally(async () => { if (server) await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); });
