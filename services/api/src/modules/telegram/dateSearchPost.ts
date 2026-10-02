/**
 * Закреплённый пост канала «Поиск по датам».
 * Кнопки ведут на витрину с относительными пресетами (`when=this-weekend`), даты считает сайт
 * в момент открытия — поэтому пост не устаревает и его не нужно переписывать каждую неделю.
 *
 * Сверху поста — крупное превью страницы /dates (OG-картинка с логотипом): тап по нему открывает сайт.
 * Кнопки web_app в группах/каналах Telegram запрещены, поэтому календарь внутри Telegram открывается
 * через direct link Mini App (`https://t.me/<bot>/<app>`), зарегистрированный в @BotFather.
 */

export type DateSearchButton = { text: string; url: string };

export type DateSearchMessage = {
  text: string;
  parse_mode: "HTML";
  link_preview_options: { url: string; prefer_large_media: true; show_above_text: true };
  reply_markup: { inline_keyboard: DateSearchButton[][] };
};

const UTM = { utm_source: "telegram_channel", utm_medium: "pinned", utm_campaign: "date_search" };

function siteUrl(siteBase: string, pathname: string, params: Record<string, string>, content: string, hash?: string): string {
  const url = new URL(pathname, `${siteBase.replace(/\/+$/, "")}/`);
  for (const [key, value] of Object.entries({ ...params, ...UTM, utm_content: content })) {
    url.searchParams.set(key, value);
  }
  if (hash) url.hash = hash;
  return url.toString();
}

export function dateSearchPageUrl(siteBase: string, content = "preview"): string {
  return siteUrl(siteBase, "/dates", {}, content);
}

export function isTelegramMiniAppLink(value: string | undefined): value is string {
  return Boolean(value && /^https:\/\/t\.me\/[A-Za-z0-9_]{5,}\/[A-Za-z0-9_]{3,}$/.test(value));
}

export function buildDateSearchKeyboard(
  siteBase: string,
  options: { miniAppUrl?: string } = {},
): { inline_keyboard: DateSearchButton[][] } {
  const calendarUrl = isTelegramMiniAppLink(options.miniAppUrl)
    ? `${options.miniAppUrl}?startapp=calendar`
    : dateSearchPageUrl(siteBase, "custom_dates");
  return {
    inline_keyboard: [
      [
        { text: "Эти выходные", url: siteUrl(siteBase, "/", { when: "this-weekend" }, "this_weekend", "programs") },
        { text: "Следующие выходные", url: siteUrl(siteBase, "/", { when: "next-weekend" }, "next_weekend", "programs") },
      ],
      [{ text: "Ближайшие 2 недели", url: siteUrl(siteBase, "/", { nearest: "1" }, "nearest_14d", "programs") }],
      [{ text: "🗓 Выбрать свои даты", url: calendarUrl }],
    ],
  };
}

export function buildDateSearchPostHtml(siteBase: string): string {
  return [
    `<b>🗓 <a href="${dateSearchPageUrl(siteBase, "title").replace(/&/g, "&amp;")}">Быстрый поиск по датам</a></b>`,
    "",
    "Когда хотите поехать? Нажмите кнопку — покажем старты на эти даты.",
    "",
    "• <b>Эти выходные</b> — ближайшие пт–сб–вс. Если сегодня уже выходные — текущие.",
    "• <b>Следующие выходные</b> — пт–сб–вс через неделю. В воскресенье это ближайшие будущие выходные.",
    "• <b>Ближайшие 2 недели</b> — всё, что стартует в течение 14 дней.",
    "• <b>Свои даты</b> — календарь: отметьте начало и конец поездки.",
    "",
    "Пост закреплён — возвращайтесь к нему в любой момент.",
  ].join("\n");
}

export function buildDateSearchMessage(siteBase: string, options: { miniAppUrl?: string } = {}): DateSearchMessage {
  return {
    text: buildDateSearchPostHtml(siteBase),
    parse_mode: "HTML",
    link_preview_options: { url: dateSearchPageUrl(siteBase), prefer_large_media: true, show_above_text: true },
    reply_markup: buildDateSearchKeyboard(siteBase, options),
  };
}
