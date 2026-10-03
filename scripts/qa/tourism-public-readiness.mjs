// Read-only public checks. Does not create bookings, subscriptions or Telegram messages.
const base = process.argv[2];
if (!base || !/^https?:\/\//.test(base)) throw new Error("Usage: node scripts/qa/tourism-public-readiness.mjs <base-url>");
const root = new URL(base);
const checks = [];
async function check(path, expected = 200) {
  const start = Date.now();
  try {
    const r = await fetch(new URL(path, root), { signal: AbortSignal.timeout(20000) });
    const text = await r.text();
    checks.push({ path, status: r.status, expected, pass: r.status === expected, ms: Date.now() - start });
    return { response: r, text };
  } catch (e) {
    checks.push({ path, pass: false, error: e.name });
    return null;
  }
}
for (const path of ["/", "/dates", "/explore", "/collections", "/spots", "/blog", "/organizers/program", "/organizers/verification", "/privacy-and-consent", "/robots.txt", "/sitemap.xml"]) await check(path);
const health = await check("/api/health");
const catalog = await check("/api/programs");
let summary = null;
if (catalog?.response.ok) {
  const programs = JSON.parse(catalog.text);
  if (!Array.isArray(programs)) throw new Error("Catalog is not an array");
  const today = new Date().toISOString().slice(0, 10);
  summary = {
    programs: programs.length,
    organizers: new Set(programs.map((p) => p.organizer?.id || p.organizer?.displayName).filter(Boolean)).size,
    onRequest: programs.filter((p) => p.scheduleType === "on_request").length,
    expiredDated: programs.filter((p) => p.scheduleType !== "on_request" && p.endDate?.slice(0, 10) < today).map((p) => p.id),
    withoutImages: programs.filter((p) => !p.media?.some((m) => m.mediaType === "image")).length,
    invalidDates: programs.filter((p) => !Number.isFinite(Date.parse(p.startDate)) || !Number.isFinite(Date.parse(p.endDate)) || p.endDate < p.startDate).map((p) => p.id),
    disciplines: [...new Set(programs.map((p) => p.discipline))].sort(),
  };
  const sample = [...new Set([programs.find((p) => p.scheduleType !== "on_request" && p.startDate.slice(0, 10) >= today)?.id,
    programs.find((p) => p.scheduleType === "on_request")?.id, ...programs.slice(0, 3).map((p) => p.id)].filter(Boolean))];
  for (const id of sample) {
    await check(`/api/programs/${encodeURIComponent(id)}`);
    await check(`/program/${encodeURIComponent(id)}`);
  }
}
await check("/api/programs/not-a-real-qa-program", 404);
await check("/api/public/subscriptions/admin/export", 401);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), base: root.origin,
  release: health ? JSON.parse(health.text).release : null, checks, summary }, null, 2));
if (checks.some((c) => !c.pass)) process.exitCode = 1;
