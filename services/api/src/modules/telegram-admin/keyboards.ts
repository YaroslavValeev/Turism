import { buildProgramAdminCallback } from "./contracts";

export function buildProgramQueueKeyboard(
  programs: Array<{ id: string }>,
): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
  return {
    inline_keyboard: programs.map((p, index) => [
      {
        text: `Проверить #${index + 1}`,
        callback_data: buildProgramAdminCallback({
          entity: "program",
          action: "preview",
          id: p.id,
        }),
      },
    ]),
  };
}

export function buildProgramPreviewKeyboard(input: {
  programId: string;
  canPublish: boolean;
}): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  if (input.canPublish) {
    rows.push([
      {
        text: "Опубликовать на сайте и в Telegram",
        callback_data: buildProgramAdminCallback({
          entity: "program",
          action: "publish",
          id: input.programId,
        }),
      },
    ]);
  } else {
    rows.push([
      {
        text: "Нужна доработка",
        callback_data: buildProgramAdminCallback({
          entity: "program",
          action: "needs_fix",
          id: input.programId,
        }),
      },
    ]);
  }
  rows.push([
    {
      text: "Закрыть",
      callback_data: buildProgramAdminCallback({
        entity: "program",
        action: "cancel",
        id: input.programId,
      }),
    },
  ]);
  return { inline_keyboard: rows };
}
