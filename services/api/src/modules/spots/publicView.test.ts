import { describe, expect, it } from "vitest";
import { pickCurrentSnapshot, publicMethodology, sortPublicSpots, toPublicSpot, type SnapshotRow, type SpotRow } from "./publicView";

const now = new Date("2026-09-30T12:00:00Z");
const future = new Date("2027-06-01T00:00:00Z");

function snap(overrides: Partial<SnapshotRow> = {}): SnapshotRow {
  return {
    officialScore: "8.2",
    band: "premium",
    methodologyVersion: "v1.1",
    ratingVersion: "wakesurf-v1.1",
    publishedAt: new Date("2026-07-01T00:00:00Z"),
    revokedAt: null,
    expiresAt: future,
    ...overrides,
  };
}

function spot(overrides: Partial<SpotRow> = {}): SpotRow {
  return {
    id: "spot-1",
    name: "Wake Park",
    region: "Москва",
    address: null,
    latitude: "55.751244",
    longitude: "37.618423",
    waterBodyType: "lake",
    relatedToMyWave: false,
    serviceUnits: [
      {
        id: "unit-1",
        discipline: "wakesurf",
        serviceName: "Вейксерф",
        equipmentConfig: { boat: "Supra", model: "SE", secretNote: "internal" },
        isActive: true,
        snapshots: [snap()],
      },
    ],
    ...overrides,
  };
}

describe("pickCurrentSnapshot", () => {
  it("ignores unpublished, revoked and expired snapshots", () => {
    expect(pickCurrentSnapshot([snap({ publishedAt: null })], now)).toBeNull();
    expect(pickCurrentSnapshot([snap({ revokedAt: new Date() })], now)).toBeNull();
    expect(pickCurrentSnapshot([snap({ expiresAt: new Date("2026-09-01T00:00:00Z") })], now)).toBeNull();
  });

  it("returns the latest published snapshot with a Russian band label", () => {
    const rating = pickCurrentSnapshot(
      [snap({ officialScore: "7.0", band: "standard" }), snap({ officialScore: "9.1", band: "premium_plus", publishedAt: new Date("2026-08-01T00:00:00Z") })],
      now,
    );
    expect(rating).toMatchObject({ officialScore: 9.1, band: "premium_plus", bandLabelRu: "Премиум+" });
  });
});

describe("toPublicSpot", () => {
  it("exposes only public fields and a whitelist of equipment", () => {
    const result = toPublicSpot(spot(), now);
    expect(result.latitude).toBe(55.751244);
    expect(result.units[0].equipment).toEqual({ boat: "Supra", model: "SE" });
    expect(result.bestRating?.officialScore).toBe(8.2);
    const json = JSON.stringify(result);
    expect(json).not.toContain("blockers");
    expect(json).not.toContain("secretNote");
  });

  it("hides inactive units and leaves rating null without a current snapshot", () => {
    const result = toPublicSpot(
      spot({
        serviceUnits: [
          { id: "u1", discipline: "wakesurf", serviceName: "Off", equipmentConfig: {}, isActive: false, snapshots: [snap()] },
          { id: "u2", discipline: "wakesurf", serviceName: "On", equipmentConfig: {}, isActive: true, snapshots: [] },
        ],
      }),
      now,
    );
    expect(result.units.map((u) => u.id)).toEqual(["u2"]);
    expect(result.bestRating).toBeNull();
  });
});

describe("sortPublicSpots", () => {
  it("puts rated spots first by score, then by region and name", () => {
    const a = toPublicSpot(spot({ id: "a", name: "Б", region: "Казань", serviceUnits: [] }), now);
    const b = toPublicSpot(spot({ id: "b" }), now);
    const c = toPublicSpot(spot({ id: "c", name: "А", region: "Казань", serviceUnits: [] }), now);
    expect(sortPublicSpots([a, c, b]).map((s) => s.id)).toEqual(["b", "c", "a"]);
  });
});

describe("publicMethodology", () => {
  it("describes weights summing to 100 and all eight gates", () => {
    const m = publicMethodology();
    expect(m.categories.reduce((sum, c) => sum + c.weight, 0)).toBe(100);
    expect(m.mandatoryGates).toHaveLength(8);
  });
});
