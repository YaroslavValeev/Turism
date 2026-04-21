# ADR-007 — lightweight guard (CI / локально)

Цель: **технический барьер** против «тихого» добавления записи `bookingStatus` в `prisma.booking.update|create|upsert` вне трёх канонических модулей, без тяжёлого validator layer.

## Allowlist (пути относительно `services/api/src`)

Файл должен совпадать с одним из суффиксов:

- `modules/status-engine/applyBookingStatusTransition.ts` — operational path
- `modules/billing/service.ts` — billing-derived
- `modules/bookings/routes.ts` — bootstrap `create` + маршруты (статус только через engine в `PATCH .../status`)

Файлы с `prisma.booking.update` **без** строки `bookingStatus` (например `ugc/rewardService.ts` только `appliedRewardId`) guard **не трогает**.

## Реализация

- Скрипт в репозитории: [scripts/check-booking-status-writers.mjs](../../scripts/check-booking-status-writers.mjs).
- Корневой `package.json`: `"check:booking-status-adr007": "node scripts/check-booking-status-writers.mjs"`.

Запуск из корня:

```bash
pnpm run check:booking-status-adr007
```

Рекомендуется вызывать перед релизом или в CI (при появлении workflow — шаг `pnpm run check:booking-status-adr007`).

**Расширение allowlist** — только через ADR и явное решение; не «по ходу PR».

**Статус (2026-04-23):** guard принят и зафиксирован в [`PROJECT_SOURCEBOOK.md`](../PROJECT_SOURCEBOOK.md) (версия документа) и [`STAGE4_1_START_EXECUTION_REPORT.md`](./STAGE4_1_START_EXECUTION_REPORT.md).

## Копия источника (синхронизировать при правке скрипта)

Ниже — дублирование для обзора; канон — файл в `scripts/`:

```javascript
#!/usr/bin/env node
/**
 * ADR-007 lightweight guard: любой файл под services/api/src, где встречаются
 * и prisma.booking.(update|create|upsert), и строка bookingStatus, должен быть в allowlist.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const API_SRC = join(__dirname, "..", "services", "api", "src");

const ALLOWLIST_SUFFIXES = [
  "modules/status-engine/applyBookingStatusTransition.ts",
  "modules/billing/service.ts",
  "modules/bookings/routes.ts",
];

function normalizeRel(p) {
  return relative(API_SRC, p).split("\\").join("/");
}

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (e.isFile() && e.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function isAllowlisted(relPath) {
  return ALLOWLIST_SUFFIXES.some((s) => relPath === s || relPath.endsWith("/" + s));
}

async function main() {
  const files = await walk(API_SRC);
  const violations = [];
  const prismaBooking = /prisma\.booking\.(update|create|upsert)/;
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (!prismaBooking.test(text) || !text.includes("bookingStatus")) continue;
    const rel = normalizeRel(file);
    if (!isAllowlisted(rel)) {
      violations.push(rel);
    }
  }
  if (violations.length > 0) {
    console.error("[ADR-007 guard] Запрещено: prisma.booking + bookingStatus вне allowlist:");
    for (const v of violations.sort()) {
      console.error("  -", v);
    }
    console.error("\nAllowlist:");
    for (const s of ALLOWLIST_SUFFIXES) {
      console.error("  ", s);
    }
    process.exit(1);
  }
  console.log("[ADR-007 guard] OK.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

## Связь с тестом

Регрессия в коде: [services/api/src/modules/status-engine/bookingStatusWriteCanonical.ts](../../services/api/src/modules/status-engine/bookingStatusWriteCanonical.ts) + [bookingStatusCanonical.test.ts](../../services/api/src/modules/status-engine/bookingStatusCanonical.test.ts) — проверка существования файлов allowlist; **скрипт** дополняет это проверкой «нет лишнего файла с обоими признаками».
