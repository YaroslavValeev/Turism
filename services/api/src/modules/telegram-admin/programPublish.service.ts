/**
 * Очередь программ к публикации и текст предпросмотра для Telegram Admin.
 */
import { getProgramPublishStatusLabel } from "@mywave/shared-types";
import { prisma } from "../../lib/prisma";
import { canPublish, programIncludeForPublishGate } from "../programs/publishGate";

const QUEUE_STATUSES = ["draft", "internal_review", "needs_fix", "approved"] as const;
const QUEUE_LIMIT = 8;

export type ProgramPublishQueueItem = {
  id: string;
  title: string;
  publishStatus: string;
  startDate: Date;
  region: string;
  discipline: string;
};

export async function listProgramPublishQueue(limit = QUEUE_LIMIT): Promise<ProgramPublishQueueItem[]> {
  const now = new Date();
  return prisma.program.findMany({
    where: {
      publishStatus: { in: [...QUEUE_STATUSES] },
      endDate: { gte: now },
    },
    orderBy: [{ startDate: "asc" }, { updatedAt: "desc" }],
    take: Math.min(Math.max(limit, 1), 20),
    select: {
      id: true,
      title: true,
      publishStatus: true,
      startDate: true,
      region: true,
      discipline: true,
    },
  });
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function loadProgramPublishPreview(programId: string): Promise<{
  ok: true;
  text: string;
  gateOk: boolean;
  missing: string[];
  publishStatus: string;
  title: string;
} | { ok: false; error: "not_found" }> {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    include: {
      ...programIncludeForPublishGate,
      media: true,
    },
  });
  if (!program) return { ok: false, error: "not_found" };

  const gate = canPublish(program);
  const imageCount = program.media.filter((m) => m.mediaType === "image").length;
  const statusLabel = getProgramPublishStatusLabel(program.publishStatus);
  const lines = [
    "<b>Проверить и опубликовать</b>",
    "",
    `<b>${escapeHtml(program.title)}</b>`,
    `Статус: ${escapeHtml(statusLabel)} (<code>${escapeHtml(program.publishStatus)}</code>)`,
    `Дисциплина: ${escapeHtml(program.discipline)}`,
    `Регион: ${escapeHtml(program.region)}`,
    `Даты: ${fmtDate(program.startDate)} → ${fmtDate(program.endDate)}`,
    `Организатор: ${escapeHtml(program.organizerName ?? program.organizer?.displayName ?? "—")}`,
    `Медиа: всего ${program.media.length}, image ${imageCount}`,
    "",
  ];
  if (gate.ok) {
    lines.push("✅ Publish gate пройден.");
    lines.push("Нажмите «Опубликовать на сайте и в Telegram».");
    if (imageCount === 0) {
      lines.push("⚠️ Нет image-медиа: в канал уйдёт текстовая карточка без фото.");
    }
  } else {
    lines.push("❌ Publish gate не пройден. Не хватает:");
    for (const m of gate.missing) {
      lines.push(`• <code>${escapeHtml(m)}</code>`);
    }
  }
  lines.push("", `<code>id=${escapeHtml(program.id)}</code>`);

  return {
    ok: true,
    text: lines.join("\n"),
    gateOk: gate.ok,
    missing: gate.missing,
    publishStatus: program.publishStatus,
    title: program.title,
  };
}

export function formatProgramQueueMessage(items: ProgramPublishQueueItem[]): string {
  if (!items.length) {
    return [
      "<b>Очередь публикации пуста</b>",
      "",
      "Нет будущих программ в статусах draft / internal_review / needs_fix / approved.",
      "Финал: статус <b>published</b> («Опубликована») — сайт + Telegram.",
      "Статус <b>approved</b> только означает проверку, без публикации.",
    ].join("\n");
  }
  const lines = [
    "<b>Проверить и опубликовать</b>",
    "",
    "Только будущие программы. Финальный статус — <b>published</b>.",
    "<i>approved ≠ публикация на сайте и в канале.</i>",
    "",
  ];
  items.forEach((p, i) => {
    lines.push(
      `${i + 1}. ${escapeHtml(p.title)}`,
      `   ${escapeHtml(getProgramPublishStatusLabel(p.publishStatus))} · ${escapeHtml(p.region)} · ${fmtDate(p.startDate)}`,
    );
  });
  return lines.join("\n");
}
