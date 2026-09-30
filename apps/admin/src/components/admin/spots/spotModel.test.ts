import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SPOT_CATEGORIES,
  SPOT_GATES,
  auditReadiness,
  blockerLabel,
  criterionLabel,
  parseCoordinates,
  yandexMapsUrl,
  type AuditForReadiness,
} from "./spotModel";

function completeAudit(overrides: Partial<AuditForReadiness> = {}): AuditForReadiness {
  return {
    status: "signed",
    expertUserId: "admin-1",
    externalExpertConfirmed: false,
    independentEditorUserId: null,
    categoryScores: SPOT_CATEGORIES.map((c) => ({ category: c.id })),
    gateResults: SPOT_GATES.map((g) => ({ gateId: g.id, status: "pass" })),
    evidence: SPOT_CATEGORIES.map((c) => ({ criterion: c.id, isGenerated: false, integrityConfirmedAt: "2026-06-01" })),
    remediations: [],
    ...overrides,
  };
}

describe("parseCoordinates", () => {
  it("accepts the Yandex Maps copy format and spaces", () => {
    assert.deepEqual(parseCoordinates("55.751244, 37.618423"), { latitude: 55.751244, longitude: 37.618423 });
    assert.deepEqual(parseCoordinates(" 44.5 38.1 "), { latitude: 44.5, longitude: 38.1 });
  });

  it("returns null for empty input and invalid for garbage or out-of-range", () => {
    assert.equal(parseCoordinates(""), null);
    assert.equal(parseCoordinates("55.7"), "invalid");
    assert.equal(parseCoordinates("abc, def"), "invalid");
    assert.equal(parseCoordinates("95, 37"), "invalid");
  });

  it("builds a Yandex Maps link with longitude first", () => {
    assert.equal(yandexMapsUrl("55.7", "37.6"), "https://yandex.ru/maps/?pt=37.6,55.7&z=15&l=map");
  });
});

describe("labels", () => {
  it("translates blockers including gate codes", () => {
    assert.equal(blockerLabel("expert_signature_missing"), "Нет подписи эксперта");
    assert.equal(blockerLabel("mandatory_gate_unknown:G05"), "G05 «Горячий душ»: не проверено");
    assert.equal(blockerLabel("something_new"), "something_new");
  });

  it("names criteria for evidence", () => {
    assert.equal(criterionLabel("safety"), "Безопасность");
    assert.equal(criterionLabel("G03"), "G03 Закрытая раздевалка");
    assert.equal(criterionLabel(null), "Общее");
  });
});

describe("auditReadiness", () => {
  it("is all green for a complete signed audit", () => {
    assert.ok(auditReadiness(completeAudit(), false).every((i) => i.ok));
  });

  it("lists what is missing", () => {
    const items = auditReadiness(
      completeAudit({
        status: "draft",
        categoryScores: [],
        gateResults: [{ gateId: "G01", status: "fail" }],
        evidence: [{ criterion: "safety", isGenerated: true, integrityConfirmedAt: null }],
      }),
      false,
    );
    assert.equal(items.filter((i) => !i.ok).length, 5);
    assert.match(items[1].label, /G01, G02/);
  });

  it("counts an accepted G05 remediation as a passed gate", () => {
    const gateResults = SPOT_GATES.map((g) => ({ gateId: g.id, status: g.id === "G05" ? "unknown" : "pass" }));
    assert.equal(auditReadiness(completeAudit({ gateResults }), false)[1].ok, false);
    const remediated = completeAudit({ gateResults, remediations: [{ gateId: "G05", accepted: true }] });
    assert.equal(auditReadiness(remediated, false)[1].ok, true);
  });

  it("adds external expert and independent editor checks for related spots", () => {
    const items = auditReadiness(completeAudit({ independentEditorUserId: "admin-1" }), true);
    assert.equal(items.length, 7);
    assert.equal(items[5].ok, false);
    assert.equal(items[6].ok, false);
  });
});
