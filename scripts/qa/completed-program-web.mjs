// Production Next server against a loopback-only fictional API; no DB or workers.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const repo = fileURLToPath(new URL('../../', import.meta.url));
const webRoot = path.join(repo, 'apps/web');
const requireWeb = createRequire(path.join(webRoot, 'package.json'));
const primary = 'cmulpo3li0011gghl5vz4oq96', alias = 'cmulpn7bz000rgghlvenfi7ln';
let state = 'completed', detailReads = 0, forbiddenMethods = 0, web, logs = '';
const fixture = {
  id: primary, title: 'Историческая поездка по горной долине', discipline: 'enduro', region: 'Камчатка', exactLocation: null,
  startDate: '2020-10-24T00:00:00Z', endDate: '2020-10-24T12:00:00Z', durationDays: 1, scheduleType: 'fixed',
  publishStatus: 'archived', publicView: 'completed', autoPublished: true, reviewStatus: 'ok', ingestedAt: '2020-10-01T00:00:00Z', levelRequired: 'all_levels', riskLevel: 'moderate', priceFromRub: null,
  currency: 'RUB', audienceFit: 'Описание прошедшего выезда.', organizerName: 'Команда маршрутов',
  organizer: { id: 'fictional-organizer', displayName: 'Команда маршрутов', verificationStatus: 'verified' },
  sourceUrl: 'https://t.me/raceenduro/2871', sourceType: 'telegram', mediaOrderPinned: true,
  media: [{ id: 'one', url: '/ingestion-media/fixture-one.jpg', mediaType: 'image', caption: null }, { id: 'two', url: '/ingestion-media/fixture-two.jpg', mediaType: 'image', caption: null }],
};
const api = createServer((req, res) => {
  res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store');
  if (req.method !== 'GET') { forbiddenMethods++; res.writeHead(405); res.end('{}'); return; }
  if (req.url === `/programs/${primary}`) {
    detailReads++;
    if (state === 'withdrawn') { res.writeHead(404); res.end('{"error":"Not found"}'); return; }
    res.end(JSON.stringify(fixture)); return;
  }
  res.end('[]');
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
try {
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  const reservation = createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  web = spawn(process.execPath, [requireWeb.resolve('next/dist/bin/next'), 'start', webRoot, '-p', String(port), '-H', '127.0.0.1'], {
    cwd: repo, env: { ...process.env, API_INTERNAL_BASE_URL: `http://127.0.0.1:${api.address().port}`, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  for (const stream of [web.stdout, web.stderr]) stream.on('data', data => { logs = (logs + data).slice(-12000); });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 90; i++) {
    if (web.exitCode != null) throw new Error('Isolated Next server exited');
    try { await fetch(base + '/robots.txt', { signal: AbortSignal.timeout(1000) }); ready = true; break; } catch { await sleep(500); }
  }
  assert.ok(ready, 'Next server did not become ready');
  const read = async url => {
    const response = await fetch(base + url, { headers: { 'user-agent': 'Googlebot' }, redirect: 'manual', signal: AbortSignal.timeout(30000) });
    return { status: response.status, location: response.headers.get('location'), html: await response.text() };
  };
  const completed = await read('/program/' + primary);
  assert.equal(completed.status, 200); assert.ok(completed.html.includes(fixture.title)); assert.ok(completed.html.includes('Выезд завершён'));
  assert.match(completed.html, /<button[^>]*disabled[^>]*>Выезд завершён<\/button>/);
  assert.match(completed.html, /<meta name="robots" content="noindex, follow"/);
  assert.ok(completed.html.includes('/ingestion-media/fixture-one.jpg') && completed.html.includes('/ingestion-media/fixture-two.jpg'));
  assert.ok(completed.html.includes('https://t.me/raceenduro/2878')); assert.ok(!completed.html.includes('__next_error__'));
  results.push({ name: 'fresh_completed_ssr_with_media_sources_closed_form_and_noindex', passed: true, http: completed.status });
  const redirect = await read('/program/' + alias + '?guestContact=fixture');
  assert.equal(redirect.status, 307); assert.equal(redirect.location, '/program/' + primary);
  results.push({ name: 'legacy_alias_keeps_canonical_without_query', passed: true, http: redirect.status });
  const readsBeforeWithdrawal = detailReads;
  state = 'withdrawn';
  const withdrawn = await read('/program/' + primary);
  assert.equal(withdrawn.status, 404); assert.ok(detailReads > readsBeforeWithdrawal, 'Must replace previous success with a fresh API read');
  assert.ok(!withdrawn.html.includes('<h1>' + fixture.title), 'Withdrawn content remains rendered');
  results.push({ name: 'same_url_manual_withdrawal_immediately_replaces_cached_success', passed: true, http: withdrawn.status });
  assert.equal(forbiddenMethods, 0);
  console.log(JSON.stringify({ results, detailReads, forbiddenMethods, scope: 'Built Next production server with fictional loopback API; no DB, forms or notifications.' }, null, 2));
  console.log('COMPLETED_PROGRAM_WEB_SSR_AND_CACHE_WITHDRAWAL_PASSED');
} catch (error) {
  console.error(error); console.error(logs); process.exitCode = 1;
} finally {
  api.closeAllConnections(); await new Promise(resolve => api.close(resolve));
  if (web && web.exitCode == null) {
    const exited = new Promise(resolve => web.once('exit', resolve)); web.kill();
    await Promise.race([exited, sleep(5000)]); if (web.exitCode == null) web.kill('SIGKILL');
  }
}
