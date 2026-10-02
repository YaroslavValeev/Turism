import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SPOT_CATEGORIES,
  SPOT_GATES,
  auditReadiness,
  blockerLabel,
  criterionLabel,
  methodologyApproveConfirmText,
  parseCandidateTable,
  parseCoordinates,
  reviewerLabel,
  shortSha,
  yandexMapsUrl,
  type AuditForReadiness,
} from "./spotModel";

describe("methodology approval helpers", () => {
  const sha = "ab".repeat(32);

  it("shows the full sha256 and pinned assessments in the confirm text", () => {
    const text = methodologyApproveConfirmText({
      id: "spotmeth_wakesurf_v1_1",
      methodologyVersion: "v1.1",
      definitionSha256: sha,
      pinnedAudits: 2,
    });
    assert.match(text, /spotmeth_wakesurf_v1_1 \(v1\.1\)/);
    assert.ok(text.includes(sha));
    assert.match(text, /Закреплённых оценок: 2\./);
    assert.equal(shortSha(sha), sha.slice(0, 12));
  });
});

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

describe("parseCandidateTable", () => {
  it("parses a sheet with Russian headers and tab delimiter", () => {
    const text = "Название\tРегион\tКоординаты\tВодоём\nWake Park\tМосква\t55.75, 37.61\tозеро\nБез коорд\tТверь\t\t";
    const { items, errors } = parseCandidateTable(text);
    assert.deepEqual(errors, []);
    assert.deepEqual(items, [
      { name: "Wake Park", region: "Москва", latitude: 55.75, longitude: 37.61, waterBodyType: "lake" },
      { name: "Без коорд", region: "Тверь" },
    ]);
  });

  it("uses default column order without headers and reports bad rows", () => {
    const { items, errors } = parseCandidateTable("A;R;55 37\nB;;\nC;R;abc\nD;R;;;болото");
    assert.deepEqual(items, [{ name: "A", region: "R", latitude: 55, longitude: 37 }]);
    assert.equal(errors.length, 3);
    assert.match(errors[0], /Строка 2/);
  });

  it("accepts separate lat/lng columns and JSON", () => {
    const { items } = parseCandidateTable("name;region;lat;lng\nA;R;56.1;35.2");
    assert.deepEqual(items, [{ name: "A", region: "R", latitude: 56.1, longitude: 35.2 }]);
    assert.equal(parseCandidateTable('[{"name":"A","region":"R"}]').items.length, 1);
    assert.equal(parseCandidateTable("[oops").errors.length, 1);
  });
});

describe("reviewerLabel", () => {
  it("prefers the name and falls back to email", () => {
    assert.equal(reviewerLabel({ name: "Иван", email: "i@x.ru" }), "Иван (i@x.ru)");
    assert.equal(reviewerLabel({ name: "  ", email: "i@x.ru" }), "i@x.ru");
    assert.equal(reviewerLabel({ name: null, email: "i@x.ru" }), "i@x.ru");
  });
});
