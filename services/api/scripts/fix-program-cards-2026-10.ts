/**
 * Разовое исправление 7 опубликованных карточек туров (ошибки импорта каталога: ссылка, даты, регион, цена).
 * По умолчанию dry-run (только печатает дифф); запись — только с --apply.
 * При --apply: одна транзакция на карточку, guard по ожидаемым значениям перечитывается внутри транзакции,
 * изменённые поля добавляются в manualFields (повторный сбор их не перезапишет), по каждому полю — запись в audit_logs.
 * publishStatus не меняется. Повторный запуск ничего не меняет.
 *
 *   pnpm --filter api db:fix:program-cards-2026-10
 *   pnpm --filter api db:fix:program-cards-2026-10 -- --apply
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import {
  CARD_FIX_FIELDS,
  cardFixAuditReason,
  comparableFixValue,
  planCardFix,
  type CardFixOutcome,
  type CardFixSpec,
  type ProgramFixSnapshot,
} from "../src/modules/programs/cardFixPlan";
import {
  PROGRAM_CARD_FIX_ACTOR,
  PROGRAM_CARD_FIX_TAG,
  PROGRAM_CARD_FIXES_2026_10,
} from "../src/modules/programs/programCardFixes202610";

const apply = process.argv.includes("--apply");

const programSelect = {
  id: true,
  title: true,
  publishStatus: true,
  manualFields: true,
  ...Object.fromEntries(CARD_FIX_FIELDS.map((field) => [field, true])),
} as Prisma.ProgramSelect;

type Db = Pick<typeof prisma, "program" | "auditLog">;

async function loadSnapshot(db: Db, programId: string): Promise<(ProgramFixSnapshot & { title?: string; publishStatus?: string }) | null> {
  return (await db.program.findUnique({ where: { id: programId }, select: programSelect })) as
    | (ProgramFixSnapshot & { title?: string; publishStatus?: string })
    | null;
}

function show(value: unknown): string {
  return comparableFixValue(value as never) ?? "∅";
}

function report(spec: CardFixSpec, outcome: CardFixOutcome, meta: { title?: string; publishStatus?: string } | null): void {
  console.log(`\n=== ${spec.label} [${spec.programId}]`);
  if (meta) console.log(`    в БД: «${meta.title}», publishStatus=${meta.publishStatus} (не меняется)`);
  switch (outcome.status) {
    case "missing":
      console.warn("    ⚠ ПРОПУСК: карточка не найдена");
      return;
    case "noop":
      console.log("    ✓ уже исправлено, изменений нет");
      return;
    case "guard_mismatch":
      console.warn("    ⚠ ПРОПУСК: текущие значения в БД отличаются от ожидаемых (карточку правили после снятия снимка):");
      for (const m of outcome.mismatches) console.warn(`      ${m.field}: ожидалось ${show(m.expected)} | сейчас ${show(m.actual)}`);
      return;
    case "update":
      for (const c of outcome.changes) console.log(`    ${c.field.padEnd(14)} ${show(c.from)}  →  ${show(c.to)}`);
      if (outcome.data.manualFields) {
        console.log(`    ${"manualFields".padEnd(14)} [${outcome.manualFieldsBefore.join(", ")}]  →  [${outcome.manualFieldsAfter.join(", ")}]`);
      }
      console.log(`    причина: ${cardFixAuditReason(PROGRAM_CARD_FIX_TAG, spec)}`);
      console.log(`    источники: ${spec.evidence.join(" , ")}`);
  }
}

async function applyOne(spec: CardFixSpec): Promise<CardFixOutcome> {
  return prisma.$transaction(async (tx) => {
    const fresh = await loadSnapshot(tx, spec.programId);
    const outcome = planCardFix(spec, fresh);
    if (outcome.status !== "update") return outcome;
    await tx.program.update({ where: { id: spec.programId }, data: outcome.data as Prisma.ProgramUpdateInput });
    const reason = cardFixAuditReason(PROGRAM_CARD_FIX_TAG, spec);
    const entries = outcome.changes.map((c) => ({ field: c.field as string, oldValue: comparableFixValue(c.from), newValue: comparableFixValue(c.to) }));
    if (outcome.data.manualFields) {
      entries.push({ field: "manualFields", oldValue: outcome.manualFieldsBefore.join(","), newValue: outcome.manualFieldsAfter.join(",") });
    }
    for (const entry of entries) {
      await tx.auditLog.create({
        data: {
          entityType: "program",
          entityId: spec.programId,
          changedField: entry.field,
          oldValue: entry.oldValue,
          newValue: entry.newValue,
          changedBy: PROGRAM_CARD_FIX_ACTOR,
          reason,
        },
      });
    }
    return outcome;
  });
}

async function main(): Promise<void> {
  console.log(apply ? "РЕЖИМ: --apply (запись в БД)" : "РЕЖИМ: dry-run (БД не меняется; для записи добавьте --apply)");
  const summary: Record<CardFixOutcome["status"], string[]> = { update: [], noop: [], guard_mismatch: [], missing: [] };
  for (const spec of PROGRAM_CARD_FIXES_2026_10) {
    const current = await loadSnapshot(prisma, spec.programId);
    const planned = planCardFix(spec, current);
    report(spec, planned, current);
    const outcome = apply && planned.status === "update" ? await applyOne(spec) : planned;
    if (apply && outcome.status !== planned.status) console.warn(`    ⚠ внутри транзакции статус изменился: ${outcome.status}`);
    summary[outcome.status].push(spec.programId);
  }
  const { update, ...rest } = summary;
  console.log(`\n${JSON.stringify({ ok: true, apply, [apply ? "updated" : "wouldUpdate"]: update, ...rest }, null, 2)}`);
  if (summary.guard_mismatch.length || summary.missing.length) {
    console.warn("Есть пропущенные карточки — проверьте их вручную в админке.");
  }
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "unknown error" }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
