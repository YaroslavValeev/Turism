#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const targets = [
  "apps/web/.next",
  ".turbo",
  "node_modules/.cache",
];

for (const rel of targets) {
  const abs = path.join(root, rel);
  if (fs.existsSync(abs)) {
    fs.rmSync(abs, { recursive: true, force: true });
    console.log(`[clean:web-cache] removed ${rel}`);
  } else {
    console.log(`[clean:web-cache] skip ${rel} (not found)`);
  }
}

console.log("[clean:web-cache] done");
