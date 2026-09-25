import { describe, expect, it } from "vitest";
import { formatProgramQueueMessage, type ProgramPublishQueueItem } from "./programPublish.service";
import { buildProgramPreviewKeyboard, buildProgramQueueKeyboard } from "./keyboards";
import { parseProgramAdminCallback } from "./contracts";
import { isProgramPublishCommand } from "./handler";

describe("telegram-admin program publish helpers", () => {
  it("formats empty queue with published vs approved hint", () => {
    const text = formatProgramQueueMessage([]);
    expect(text).toContain("Очередь публикации пуста");
    expect(text).toContain("published");
    expect(text).toContain("approved");
  });

  it("formats queue items and builds preview callbacks", () => {
    const items: ProgramPublishQueueItem[] = [
      {
        id: "prog_1",
        title: "Алтай трек",
        publishStatus: "approved",
        startDate: new Date("2026-10-01T00:00:00.000Z"),
        region: "Алтай",
        discipline: "треккинг",
      },
    ];
    const text = formatProgramQueueMessage(items);
    expect(text).toContain("Алтай трек");
    expect(text).toContain("Одобрена");

    const kb = buildProgramQueueKeyboard(items);
    expect(kb.inline_keyboard).toHaveLength(1);
    const data = kb.inline_keyboard[0]?.[0]?.callback_data ?? "";
    expect(parseProgramAdminCallback(data)?.action).toBe("preview");
  });

  it("shows publish button only when gate passes", () => {
    const okKb = buildProgramPreviewKeyboard({ programId: "prog_1", canPublish: true });
    const failKb = buildProgramPreviewKeyboard({ programId: "prog_1", canPublish: false });
    expect(okKb.inline_keyboard.some((row) => row.some((b) => b.text.includes("Опубликовать")))).toBe(
      true,
    );
    expect(failKb.inline_keyboard.some((row) => row.some((b) => b.text.includes("доработ")))).toBe(
      true,
    );
    expect(
      parseProgramAdminCallback(okKb.inline_keyboard[0]?.[0]?.callback_data)?.action,
    ).toBe("publish");
  });

  it("recognizes operator commands", () => {
    expect(isProgramPublishCommand("/check_publish")).toBe(true);
    expect(isProgramPublishCommand("/check_publish@MyWaveTourBot")).toBe(true);
    expect(isProgramPublishCommand("/programs_review")).toBe(true);
    expect(isProgramPublishCommand("/start")).toBe(false);
  });
});
