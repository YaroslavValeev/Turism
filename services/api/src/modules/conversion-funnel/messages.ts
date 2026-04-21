function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type StageMessageContext = {
  programTitle: string;
  commissionPctLabel: string;
  metrics: { views: number; clicks: number; leads: number; deals: number };
  discussUrl: string;
  unsubscribeUrl?: string;
  /** Глобальный режим платформы: в launch не обещаем выставление комиссии и счета как текущий процесс. */
  launchMode?: boolean;
};

export function buildPlainTextForStage(stage: number, ctx: StageMessageContext): string {
  const { programTitle, commissionPctLabel, metrics: m, discussUrl, unsubscribeUrl } = ctx;
  const lines: string[] = [`Программа: ${programTitle}`, ""];
  switch (stage) {
    case 0:
      lines.push(
        "Программа добавлена.",
        "",
        "Мы начинаем привлекать к ней внимание.",
        "Первые результаты появятся в ближайшие дни — пришлём тебе цифры.",
      );
      break;
    case 1:
      lines.push(
        "По твоей программе уже есть активность:",
        "",
        `— просмотры: ${m.views}`,
        `— переходы: ${m.clicks}`,
        "",
        "Это значит, что люди реально интересуются.",
        "Дальше будем усиливать поток.",
      );
      break;
    case 2:
      lines.push(
        "Появились первые заявки:",
        "",
        `— заявки: ${m.leads}`,
        "",
        "Это уже не просто интерес, а реальные люди, которые хотят участвовать.",
        "Пока мы просто собираем статистику и усиливаем поток.",
      );
      break;
    case 3:
      lines.push(
        "У тебя уже есть стабильные результаты:",
        "",
        `— просмотры: ${m.views}`,
        `— переходы: ${m.clicks}`,
        `— заявки: ${m.leads}`,
        "",
        "Это значит, что программа зашла аудитории.",
        "Сейчас это происходит без платного продвижения.",
      );
      break;
    case 4:
      if (ctx.launchMode) {
        lines.push(
          "Сейчас платформа в режиме запуска: размещение и сопровождение для тебя без оплаты комиссии.",
          "Счета за комиссию не выставляются — фиксируем ценность (трафик, лиды, брони) для будущего договора.",
          "",
          "Когда перейдём к монетизации, типичная модель — процент с подтверждённой сделки;",
          `ориентир по ставке в системе — около ${commissionPctLabel} (без обязательств до отдельного согласования).`,
          "",
          "Если хочешь заранее обсудить рамки — напиши.",
          discussUrl ? `Связь: ${discussUrl}` : "",
        );
      } else {
        lines.push(
          "Модель сотрудничества прозрачная:",
          "мы приводим клиентов → комиссия платформы — с подтверждённой сделки.",
          `Ориентир по ставке в системе — около ${commissionPctLabel}.`,
          "",
          "Если хочешь, можем заранее зафиксировать условия.",
          discussUrl ? `Обсудить: ${discussUrl}` : "",
        );
      }
      break;
    case 5:
      if (ctx.launchMode) {
        lines.push(
          "По твоей программе уже есть устойчивые сигналы:",
          "",
          `— заявки: ${m.leads}`,
          `— подтверждённые брони: ${m.deals}`,
          "",
          "В режиме запуска комиссия в системе считается для прозрачности; к оплате не выставляется.",
          "Когда подключим монетизацию, можно будет зафиксировать условия под твой поток — напиши, если хочешь обсудить заранее.",
          discussUrl ? `Связь: ${discussUrl}` : "",
        );
      } else {
        lines.push(
          "По твоей программе уже есть реальные результаты:",
          "",
          `— заявки: ${m.leads}`,
          `— подтверждённые брони: ${m.deals}`,
          "",
          "Это уже поток, а не тест.",
          "Дальше мы будем масштабировать, и можно закрепить условия сейчас:",
          `работа по модели % от сделки (около ${commissionPctLabel}).`,
          discussUrl ? `Закрепить условия: ${discussUrl}` : "",
        );
      }
      break;
    default:
      lines.push("Сообщение MyWave Travel.");
  }
  if (unsubscribeUrl) {
    lines.push("", `Отписаться от сервисных сообщений по программе: ${unsubscribeUrl}`);
  }
  return lines.filter(Boolean).join("\n");
}

export function buildHtmlForStage(stage: number, ctx: StageMessageContext): string {
  const plain = buildPlainTextForStage(stage, { ...ctx, unsubscribeUrl: undefined });
  const body = escapeHtml(plain).replace(/\n/g, "<br/>");
  const unsub = ctx.unsubscribeUrl
    ? `<p style="margin-top:16px;font-size:12px;color:#666;"><a href="${escapeHtml(ctx.unsubscribeUrl)}">Отписаться от сервисных сообщений</a></p>`
    : "";
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5">${body}${unsub}</body></html>`;
}

export function subjectForStage(stage: number, programTitle: string, launchMode?: boolean): string {
  const short = programTitle.length > 60 ? `${programTitle.slice(0, 57)}…` : programTitle;
  switch (stage) {
    case 0:
      return `MyWave: программа «${short}» в каталоге`;
    case 1:
      return `MyWave: активность по программе «${short}»`;
    case 2:
      return `MyWave: первые заявки — «${short}»`;
    case 3:
      return `MyWave: стабильные результаты — «${short}»`;
    case 4:
      return launchMode
        ? `MyWave: следующий шаг после запуска — «${short}»`
        : `MyWave: модель сотрудничества — «${short}»`;
    case 5:
      return launchMode ? `MyWave: результаты по программе — «${short}»` : `MyWave: закрепить условия — «${short}»`;
    default:
      return `MyWave Travel — «${short}»`;
  }
}

export function buildFollowUpPlain(ctx: StageMessageContext): string {
  const lines = [
    `Программа: ${ctx.programTitle}`,
    "",
    "Удалось обработать заявки?",
    "Есть ощущение по качеству аудитории?",
    "",
    "Если нужно — напиши нам, разберём загрузку и следующий шаг.",
    ctx.discussUrl ? `Связь: ${ctx.discussUrl}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}
