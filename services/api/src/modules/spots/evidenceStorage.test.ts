import crypto from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  detectEvidence,
  readEvidenceFile,
  resolveEvidencePath,
  saveEvidenceFile,
  spotEvidenceDir,
} from "./evidenceStorage";

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)]);
const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");

let dir: string;
const previousEnv = process.env.SPOT_EVIDENCE_DIR;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "spot-evidence-"));
  process.env.SPOT_EVIDENCE_DIR = dir;
});

afterEach(async () => {
  if (previousEnv === undefined) delete process.env.SPOT_EVIDENCE_DIR;
  else process.env.SPOT_EVIDENCE_DIR = previousEnv;
  await fs.rm(dir, { recursive: true, force: true });
});

describe("detectEvidence", () => {
  it("detects photos, videos and pdf documents by signature", () => {
    expect(detectEvidence(JPEG)).toEqual({ extension: "jpg", mimeType: "image/jpeg", kind: "photo" });
    expect(detectEvidence(PDF)).toEqual({ extension: "pdf", mimeType: "application/pdf", kind: "document" });
  });

  it("rejects svg and html regardless of what the client claims", () => {
    expect(detectEvidence(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(detectEvidence(Buffer.from("<!doctype html><script>alert(1)</script>"))).toBeNull();
  });
});

describe("evidence storage", () => {
  it("uses SPOT_EVIDENCE_DIR and names files by sha256", async () => {
    expect(spotEvidenceDir()).toBe(dir);
    const stored = await saveEvidenceFile(JPEG, detectEvidence(JPEG)!);
    const sha = crypto.createHash("sha256").update(JPEG).digest("hex");
    expect(stored).toEqual({ storageKey: `${sha}.jpg`, sha256: sha, sizeBytes: JPEG.length });
    expect(await readEvidenceFile(stored.storageKey, sha)).toEqual(JPEG);
  });

  it("refuses path traversal and malformed keys", () => {
    expect(resolveEvidencePath("../../etc/passwd")).toBeNull();
    expect(resolveEvidencePath(`${"a".repeat(64)}.svg`)).toBeNull();
    expect(resolveEvidencePath(`${"a".repeat(64)}.jpg`)).toBe(path.join(dir, `${"a".repeat(64)}.jpg`));
  });

  it("detects tampering with a stored file", async () => {
    const stored = await saveEvidenceFile(JPEG, detectEvidence(JPEG)!);
    await fs.writeFile(path.join(dir, stored.storageKey), Buffer.from("tampered"));
    await expect(readEvidenceFile(stored.storageKey, stored.sha256)).rejects.toThrow(/integrity/);
  });

  it("returns null for a missing file", async () => {
    expect(await readEvidenceFile(`${"b".repeat(64)}.jpg`, "x")).toBeNull();
  });
});
