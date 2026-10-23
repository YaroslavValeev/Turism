'use strict';

// Deliberately has no apply mode. Source URL equality is corroboration, not a
// replacement for the canonical candidate -> published program relationship.
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

const SPECS = Object.freeze([
  { id: 'cmulpn7bz000rgghlvenfi7ln', sourceId: 'cmot577px003luf5gis5a4048', sourceUrl: 'https://t.me/raceenduro/2878', sourceType: 'telegram', field: 'discipline', before: 'Unknown', proposed: 'enduro', rule: 'enduro' },
  { id: 'cmulpo3li0011gghl5vz4oq96', sourceId: 'cmot577px003luf5gis5a4048', sourceUrl: 'https://t.me/raceenduro/2871', sourceType: 'telegram', field: 'discipline', before: 'Unknown', proposed: 'enduro', rule: 'enduro' },
  { id: 'cmuf9vok500wgl57wmf0k34fc', sourceId: 'cmot577q0003nuf5gu4pozt0w', sourceUrl: 'https://t.me/RusKiteNews/1004', sourceType: 'telegram', field: 'region', before: 'Chile', proposed: 'Красное море', rule: 'red-sea' },
  { id: 'cmuf9pvx300upl57w5hhv36e3', sourceId: 'cmot577n90023uf5g8bageell', sourceUrl: 'https://mountainguru.ru/climb/0_64/', sourceType: 'site', field: 'region', before: 'Кавказ и др.', proposed: 'Турция', rule: 'turkey' },
].map(Object.freeze));

const programSelect = {
  id: true, title: true, discipline: true, region: true, exactLocation: true,
  startDate: true, endDate: true, durationDays: true, manualFields: true,
  updatedAt: true, sourceId: true, sourceUrl: true, sourceType: true, publishStatus: true,
};
const rawSelect = {
  id: true, sourceId: true, sourceUrl: true, sourceType: true,
  sourceRunId: true, rawTitle: true, rawText: true, fetchedAt: true,
  source: { select: { name: true } },
  normalizedItem: { select: { discipline: true, country: true, region: true, startDate: true, endDate: true } },
};

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}

function supports(spec, raw) {
  const text = [raw.rawTitle, raw.rawText].filter(Boolean).join(' ');
  if (spec.rule === 'enduro') {
    return /эндуро/i.test(raw.source?.name || '') && /Классы/i.test(text) && /Новороссийск/i.test(text);
  }
  if (spec.rule === 'red-sea') return /кайт|wing/i.test(text) && /Красном море/i.test(text);
  return /скалолазания в Турции/i.test(text) && /Антали[ия]/i.test(text);
}

function buildReview(programs, rawItems, checkedAt = new Date()) {
  const ids = new Set(SPECS.map(s => s.id));
  if (new Set(programs.map(p => p.id)).size !== programs.length || programs.some(p => !ids.has(p.id))) {
    throw new Error('Unexpected or duplicate program IDs');
  }
  const items = SPECS.map(spec => {
    const program = programs.find(p => p.id === spec.id);
    const base = { programId: spec.id, field: spec.field, expectedBefore: spec.before, proposedValue: spec.proposed };
    if (!program) return { ...base, status: 'missing', evidenceRawIds: [] };
    const before = canonical(Object.fromEntries(Object.keys(programSelect).map(k => [k, program[k]])));
    const snapshotSha256 = createHash('sha256').update(JSON.stringify(before)).digest('hex');
    const evidence = rawItems.filter(r => r.sourceId === spec.sourceId && r.sourceUrl === spec.sourceUrl && r.sourceType === spec.sourceType);
    const supported = evidence.filter(r => supports(spec, r));
    let status = 'proposed';
    if (program.sourceId !== spec.sourceId || program.sourceUrl !== spec.sourceUrl || program.sourceType !== spec.sourceType) status = 'source_mismatch';
    else if (!Array.isArray(program.manualFields) || program.manualFields.includes(spec.field)) status = 'manual_review';
    else if (program[spec.field] === spec.proposed) status = 'already_matches';
    else if (program[spec.field] !== spec.before) status = 'value_mismatch';
    else if (!supported.length) status = 'evidence_missing';
    const normalizedDatesDiffer = evidence.some(r => r.normalizedItem && (
      !isDeepStrictEqual(canonical(r.normalizedItem.startDate), canonical(program.startDate)) ||
      !isDeepStrictEqual(canonical(r.normalizedItem.endDate), canonical(program.endDate))
    ));
    return {
      ...base, status, before, snapshotSha256,
      evidenceRawIds: supported.map(r => r.id).sort(),
      dateReviewRequired: spec.rule === 'turkey' || normalizedDatesDiffer,
      datesWillChange: false,
      provenance: 'sourceId+sourceUrl+sourceType corroboration; no lineage pointers will change',
    };
  });
  return {
    checkedAt: checkedAt.toISOString(), mode: 'READ_ONLY_REVIEW', executionAllowed: false,
    items, limitation: 'Proposals only. No write mode, publishing, parsing, media fetch or messaging. Dates and media require separate review.',
  };
}

async function readReview(prisma) {
  return prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const programs = await tx.program.findMany({ where: { id: { in: SPECS.map(s => s.id) } }, select: programSelect });
    const rawItems = await tx.rawItem.findMany({
      where: { OR: SPECS.map(s => ({ sourceId: s.sourceId, sourceUrl: s.sourceUrl, sourceType: s.sourceType })) },
      select: rawSelect, orderBy: [{ fetchedAt: 'desc' }, { id: 'asc' }],
    });
    return buildReview(programs, rawItems);
  }, { isolationLevel: 'RepeatableRead', timeout: 15000 });
}

function validateArgs(args) {
  if (args.length) throw new Error('No options supported; this tool is read-only (no --apply)');
}

module.exports = { SPECS, buildReview, readReview, validateArgs };

if (require.main === module) {
  let prisma;
  Promise.resolve().then(() => {
    validateArgs(process.argv.slice(2));
    ({ prisma } = require('../dist/lib/prisma.js'));
    return readReview(prisma);
  }).then(result => {
    console.log(JSON.stringify(result, null, 2));
    if (result.items.some(i => !['proposed', 'already_matches'].includes(i.status))) process.exitCode = 2;
  }).catch(error => {
    // Error bodies from database clients can contain connection details.
    console.error(`SOURCE_CARD_REVIEW_FAILED: ${error.name}`);
    process.exitCode = 1;
  }).finally(() => prisma?.$disconnect());
}
