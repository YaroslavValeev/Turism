/**
 * Sprint 4: продуктовые шаблоны уведомлений о публикации программы (Telegram HTML + email HTML/text).
 * Fallback: пустые блоки не рендерятся; нейтральные фразы при отсутствии копирайта в БД.
 */

export type ProgramNotifySource = {
  id: string;
  title: string;
  discipline: string;
  region: string;
  startDate: Date;
  endDate?: Date | null;
  audienceFit?: string | null;
  inclusions?: string | null;
  organizerName?: string | null;
  organizerDisplayName?: string | null;
  levelRequired?: string | null;
  formatType?: string | null;
  cancellationRules?: string | null;
  whatHappensAfterBooking?: string | null;
  medicalLimitations?: string | null;
};

const FB = {
  forWho: "Подойдёт тем, кто ищет выезд под свои даты и уровень — детали на карточке.",
  benefits: "На карточке — формат, уровень и что включено в программу.",
  organizer: "Организатор указан на странице программы.",
  important: "Условия отмены и безопасность — на карточке перед заявкой.",
  contextLine: "Новый выезд в каталоге MyWaveTour.",
} as const;

function pickFirstNonempty(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) {
    const t = v?.trim();
    if (t) return t;
  }
  return null;
}

function truncateOneLine(s: string, max: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max - 1)}…`;
}

/** Разбить текст на буллеты (строки или фрагменты по `;`). */
export function bulletsFromFreeText(text: string | null | undefined, maxBullets: number, maxEach: number): string[] {
  if (!text?.trim()) return [];
  const parts = text
    .split(/\n+|;/g)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (out.length >= maxBullets) break;
    out.push(truncateOneLine(p, maxEach));
  }
  return out;
}

export function escapeTelegramHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatProgramContextLine(src: ProgramNotifySource, locale = "ru-RU"): string {
  const start = new Date(src.startDate).toLocaleDateString(locale);
  const end = src.endDate ? new Date(src.endDate).toLocaleDateString(locale) : null;
  const datePart = end && end !== start ? `${start} — ${end}` : start;
  return `${escapeTelegramHtml(src.discipline)} · ${escapeTelegramHtml(src.region)} · старт ${escapeTelegramHtml(datePart)}`;
}

function levelHint(src: ProgramNotifySource): string | null {
  const lv = src.levelRequired?.trim();
  if (!lv) return null;
  return `Уровень: ${lv}`;
}

function buildForWhoBullets(src: ProgramNotifySource): string[] {
  const fromAudience = bulletsFromFreeText(src.audienceFit, 3, 120);
  if (fromAudience.length) return fromAudience;
  const out: string[] = [];
  const fmt = src.formatType?.trim();
  if (fmt) out.push(`Формат: ${truncateOneLine(fmt, 100)}`);
  const lv = levelHint(src);
  if (lv) out.push(lv);
  if (out.length) return out.slice(0, 3);
  return [FB.forWho];
}

function buildBenefitBullets(src: ProgramNotifySource): string[] {
  const fromInc = bulletsFromFreeText(src.inclusions, 3, 120);
  if (fromInc.length) return fromInc;
  const wh = bulletsFromFreeText(src.whatHappensAfterBooking, 2, 120);
  if (wh.length) return wh;
  return [FB.benefits];
}

function buildImportantBlock(src: ProgramNotifySource): string | null {
  const parts = [
    ...bulletsFromFreeText(src.cancellationRules, 2, 140),
    ...bulletsFromFreeText(src.medicalLimitations, 2, 140),
  ].slice(0, 3);
  if (parts.length) return parts.map((p) => `• ${p}`).join("\n");
  return null;
}

function organizerLine(src: ProgramNotifySource): string | null {
  return pickFirstNonempty(src.organizerDisplayName, src.organizerName);
}

/** Telegram: HTML + короткая продуктовая структура. */
export function buildTelegramProgramNotifyHtml(src: ProgramNotifySource, programUrl: string | null): string {
  const title = escapeTelegramHtml(truncateOneLine(src.title, 180));
  const ctx = formatProgramContextLine(src);
  const forWho = buildForWhoBullets(src).map((b) => `• ${escapeTelegramHtml(b)}`).join("\n");
  const benefits = buildBenefitBullets(src).map((b) => `• ${escapeTelegramHtml(b)}`).join("\n");
  const org = organizerLine(src);
  const orgBlock = org
    ? `<b>Кто проводит</b>\n${escapeTelegramHtml(truncateOneLine(org, 120))}`
    : `<b>Кто проводит</b>\n${escapeTelegramHtml(FB.organizer)}`;
  const impRaw = buildImportantBlock(src);
  const impBlock = impRaw
    ? `<b>Что важно знать</b>\n${escapeTelegramHtml(impRaw)}`
    : `<b>Что важно знать</b>\n${escapeTelegramHtml(FB.important)}`;

  const urlLine =
    programUrl && /^https?:\/\//i.test(programUrl)
      ? `\n<a href="${escapeTelegramHtml(programUrl)}">Открыть программу и оставить заявку</a>`
      : `\n<i>Откройте программу в приложении MyWaveTour по ссылке из письма или сайта.</i>`;

  return (
    `<b>Рекомендуем выезд</b> — MyWaveTour\n` +
    `${title}\n` +
    `${ctx}\n\n` +
    `<b>Кому подойдёт</b>\n` +
    `${forWho}\n\n` +
    `<b>Что ты получишь</b>\n` +
    `${benefits}\n\n` +
    `${orgBlock}\n\n` +
    `${impBlock}` +
    urlLine
  );
}

function emailSection(title: string, bodyHtml: string): string {
  return `<div style="margin:16px 0 0 0;"><div style="font-size:13px;font-weight:600;color:#111;margin-bottom:6px;">${title}</div><div style="font-size:15px;line-height:1.45;color:#333;">${bodyHtml}</div></div>`;
}

function emailBulletsHtml(items: string[]): string {
  return `<ul style="margin:8px 0;padding-left:20px;">${items.map((t) => `<li style="margin:4px 0;">${escapeHtml(t)}</li>`).join("")}</ul>`;
}

export function buildEmailProgramNotifyHtml(
  src: ProgramNotifySource,
  programUrl: string,
  unsubscribeUrl: string,
): string {
  const title = escapeHtml(truncateOneLine(src.title, 200));
  const start = new Date(src.startDate).toLocaleDateString("ru-RU");
  const end = src.endDate ? new Date(src.endDate).toLocaleDateString("ru-RU") : null;
  const dateLine = end && end !== start ? `${start} — ${end}` : start;
  const sub = `${escapeHtml(src.discipline)} · ${escapeHtml(src.region)} · старт ${escapeHtml(dateLine)}`;

  const forWhoHtml = emailBulletsHtml(buildForWhoBullets(src));
  const benefitsHtml = emailBulletsHtml(buildBenefitBullets(src));
  const org = organizerLine(src);
  const orgHtml = org
    ? emailSection("Кто проводит", `<p style="margin:0;">${escapeHtml(truncateOneLine(org, 200))}</p>`)
    : emailSection("Кто проводит", `<p style="margin:0;">${escapeHtml(FB.organizer)}</p>`);

  const imp = buildImportantBlock(src);
  const importantHtml = imp
    ? emailSection("Что важно знать", `<p style="margin:0;white-space:pre-line;">${escapeHtml(imp)}</p>`)
    : emailSection("Что важно знать", `<p style="margin:0;">${escapeHtml(FB.important)}</p>`);

  const safeProgramUrl = escapeHtml(programUrl);
  const safeUnsub = escapeHtml(unsubscribeUrl);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f4f5f7;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
    <div style="background:#fff;border-radius:14px;padding:22px 20px;box-shadow:0 1px 3px rgba(0,0,0,.06);">
      <div style="font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#5b6472;">MyWaveTour</div>
      <h1 style="font-size:22px;line-height:1.25;margin:10px 0 6px;color:#111;">${title}</h1>
      <p style="margin:0 0 8px;font-size:15px;color:#444;">${sub}</p>
      <p style="margin:0 0 16px;font-size:14px;color:#666;">${escapeHtml(FB.contextLine)}</p>
      ${emailSection("Кому подойдёт", forWhoHtml)}
      ${emailSection("Что ты получишь", benefitsHtml)}
      ${orgHtml}
      ${importantHtml}
      <div style="margin:28px 0 8px;text-align:left;">
        <a href="${safeProgramUrl}" style="display:inline-block;padding:14px 22px;background:#0f6ab8;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;">Открыть программу</a>
      </div>
      <hr style="border:none;border-top:1px solid #e6e8ec;margin:24px 0;"/>
      <p style="margin:0;font-size:12px;line-height:1.5;color:#888;">
        <a href="${safeUnsub}" style="color:#5b6472;">Отписаться от рассылки</a>
      </p>
    </div>
  </div>
</body></html>`;
}

/** Plaintext для multipart/alternative и почтовых клиентов без HTML. */
export function buildEmailProgramNotifyText(
  src: ProgramNotifySource,
  programUrl: string,
  unsubscribeUrl: string,
): string {
  const start = new Date(src.startDate).toLocaleDateString("ru-RU");
  const lines = [
    "MyWaveTour — новый выезд",
    src.title,
    `${src.discipline} · ${src.region} · старт ${start}`,
    "",
    FB.contextLine,
    "",
    "Кому подойдёт",
    ...buildForWhoBullets(src).map((b) => `• ${b}`),
    "",
    "Что ты получишь",
    ...buildBenefitBullets(src).map((b) => `• ${b}`),
    "",
    "Кто проводит",
    organizerLine(src) ?? FB.organizer,
    "",
    "Что важно знать",
    buildImportantBlock(src) ?? FB.important,
    "",
    `Открыть программу: ${programUrl}`,
    "",
    `Отписаться: ${unsubscribeUrl}`,
  ];
  return lines.join("\n");
}

/** Маппинг строки Program (+ опциональный organizer) в источник шаблонов. */
export function programRowToNotifySource(
  row: {
    id: string;
    title: string;
    discipline: string;
    region: string;
    startDate: Date;
    endDate: Date;
    audienceFit?: string | null;
    inclusions?: string | null;
    organizerName?: string | null;
    levelRequired?: string | null;
    formatType?: string | null;
    cancellationRules?: string | null;
    whatHappensAfterBooking?: string | null;
    medicalLimitations?: string | null;
    organizer?: { displayName: string } | null;
  },
): ProgramNotifySource {
  return {
    id: row.id,
    title: row.title,
    discipline: row.discipline,
    region: row.region,
    startDate: row.startDate,
    endDate: row.endDate,
    audienceFit: row.audienceFit ?? null,
    inclusions: row.inclusions ?? null,
    organizerName: row.organizerName ?? null,
    organizerDisplayName: row.organizer?.displayName ?? null,
    levelRequired: row.levelRequired ?? null,
    formatType: row.formatType ?? null,
    cancellationRules: row.cancellationRules ?? null,
    whatHappensAfterBooking: row.whatHappensAfterBooking ?? null,
    medicalLimitations: row.medicalLimitations ?? null,
  };
}
