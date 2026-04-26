import { describe, expect, it } from "vitest";
import {
  classifyLinkageRow,
  extractMetaChannelId,
  markChannelAlreadyLinkedElsewhere,
  markDuplicateWouldLink,
  type LinkageBackfillRow,
} from "./sourceLinkageBackfill";

describe("extractMetaChannelId", () => {
  it("читает channelId и channel_id", () => {
    expect(extractMetaChannelId({ channelId: " ch1 " })).toBe("ch1");
    expect(extractMetaChannelId({ channel_id: "x" })).toBe("x");
  });

  it("возвращает null для пустых / неверных типов", () => {
    expect(extractMetaChannelId(null)).toBeNull();
    expect(extractMetaChannelId({ channelId: "" })).toBeNull();
    expect(extractMetaChannelId({ channelId: 1 })).toBeNull();
    expect(extractMetaChannelId([])).toBeNull();
  });
});

describe("classifyLinkageRow", () => {
  const chMap = new Map([
    ["c1", { id: "c1", organizerId: "org-a" }],
    ["c2", { id: "c2", organizerId: "org-b" }],
  ]);

  it("would_link при совпадении организатора", () => {
    expect(classifyLinkageRow({ id: "s1", organizerId: "org-a", metaJson: { channelId: "c1" } }, chMap)).toMatchObject({
      status: "would_link",
      proposedExternalChannelId: "c1",
    });
  });

  it("would_link если organizerId у source null (legacy)", () => {
    expect(classifyLinkageRow({ id: "s1", organizerId: null, metaJson: { channelId: "c1" } }, chMap)).toMatchObject({
      status: "would_link",
      proposedExternalChannelId: "c1",
    });
  });

  it("organizer_mismatch", () => {
    expect(classifyLinkageRow({ id: "s1", organizerId: "org-b", metaJson: { channelId: "c1" } }, chMap)).toMatchObject({
      status: "organizer_mismatch",
    });
  });

  it("channel_not_found", () => {
    expect(classifyLinkageRow({ id: "s1", organizerId: "org-a", metaJson: { channelId: "missing" } }, chMap)).toMatchObject({
      status: "channel_not_found",
    });
  });
});

describe("markDuplicateWouldLink", () => {
  it("помечает дубликаты на один канал", () => {
    const rows: LinkageBackfillRow[] = [
      { sourceId: "a", organizerId: "o", metaChannelId: "c1", proposedExternalChannelId: "c1", status: "would_link" },
      { sourceId: "b", organizerId: "o", metaChannelId: "c1", proposedExternalChannelId: "c1", status: "would_link" },
      { sourceId: "c", organizerId: "o", metaChannelId: "c2", proposedExternalChannelId: "c2", status: "would_link" },
    ];
    const out = markDuplicateWouldLink(rows);
    expect(out[0].status).toBe("duplicate_would_link");
    expect(out[1].status).toBe("duplicate_would_link");
    expect(out[2].status).toBe("would_link");
  });
});

describe("markChannelAlreadyLinkedElsewhere", () => {
  it("конфликт если FK уже у другого source", () => {
    const rows: LinkageBackfillRow[] = [
      { sourceId: "new", organizerId: "o", metaChannelId: "c1", proposedExternalChannelId: "c1", status: "would_link" },
    ];
    const holders = new Map<string, string[]>([["c1", ["existing"]]]);
    const out = markChannelAlreadyLinkedElsewhere(rows, holders);
    expect(out[0].status).toBe("channel_already_linked_elsewhere");
  });

  it("не трогает если держатель — тот же sourceId", () => {
    const rows: LinkageBackfillRow[] = [
      { sourceId: "same", organizerId: "o", metaChannelId: "c1", proposedExternalChannelId: "c1", status: "would_link" },
    ];
    const holders = new Map<string, string[]>([["c1", ["same"]]]);
    const out = markChannelAlreadyLinkedElsewhere(rows, holders);
    expect(out[0].status).toBe("would_link");
  });
});
