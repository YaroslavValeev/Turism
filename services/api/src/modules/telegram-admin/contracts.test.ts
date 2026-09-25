import { describe, expect, it } from "vitest";
import {
  buildCampAdminCallback,
  buildProgramAdminCallback,
  CAMP_CONTENT_RIGHTS_STATUSES,
  CAMP_MODERATION_STATUSES,
  parseCampAdminCallback,
  parseProgramAdminCallback,
  parseTelegramAdminCallback,
} from "./contracts";

describe("MyWaveTour Telegram Admin contracts", () => {
  it("keeps the moderation and rights status contracts explicit", () => {
    expect(CAMP_MODERATION_STATUSES).toEqual([
      "new",
      "needs_review",
      "approved",
      "published",
      "hidden",
      "archived",
    ]);
    expect(CAMP_CONTENT_RIGHTS_STATUSES).toEqual(["partner_allowed", "unknown", "restricted"]);
  });

  it("serializes camp callback_data under the Telegram 64 byte limit", () => {
    const callback = buildCampAdminCallback({
      entity: "camp",
      action: "rights_request",
      id: "tour_prog_123",
    });

    expect(Buffer.byteLength(callback, "utf8")).toBeLessThanOrEqual(64);
    expect(parseCampAdminCallback(callback)).toEqual({
      entity: "camp",
      action: "rights_request",
      id: "tour_prog_123",
    });
  });

  it("serializes program preview/publish callbacks under 64 bytes", () => {
    const id = "clxxxxxxxxxxxxxxxxxxxxxxxx";
    const preview = buildProgramAdminCallback({ entity: "program", action: "preview", id });
    const publish = buildProgramAdminCallback({ entity: "program", action: "publish", id });
    expect(Buffer.byteLength(preview, "utf8")).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(publish, "utf8")).toBeLessThanOrEqual(64);
    expect(parseProgramAdminCallback(preview)).toEqual({
      entity: "program",
      action: "preview",
      id,
    });
    expect(parseTelegramAdminCallback(publish)).toEqual({
      entity: "program",
      action: "publish",
      id,
    });
  });

  it("rejects callbacks from other bots or malformed payloads", () => {
    expect(parseCampAdminCallback("P|draft1")).toBeNull();
    expect(parseCampAdminCallback("MTA1|C|BAD|tour_prog_123")).toBeNull();
    expect(parseCampAdminCallback("MTA1|C|APP|")).toBeNull();
    expect(parseProgramAdminCallback("MTA1|C|PUB|x")).toBeNull();
    expect(parseProgramAdminCallback("MTA1|P|BAD|x")).toBeNull();
  });
});
