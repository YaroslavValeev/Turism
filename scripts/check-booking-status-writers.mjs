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
