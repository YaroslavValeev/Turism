import type { OutreachMetrics } from "./metrics.js";

const SUBJECT: Record<"A_soft" | "B_leads" | "C_deals", string> = {
  A_soft: "Результаты размещения на MyWave и следующий шаг",
  B_leads: "По твоим программам уже есть интерес и заявки на MyWave",
  C_deals: "Мы уже привели клиентов — давай закрепим партнёрство",
};

function fmt(n: number): string {
  return String(n);
}

function buildBodyA(vars: {
  displayName: string;
  viewsCount: number;
  clicksCount: number;
  leadsCount: number;
  dealsCount: number;
}): string {
  return `Привет!

За последние недели мы протестировали размещение твоих программ на MyWave и собрали первые данные по взаимодействию пользователей.

Статистика за период:

— просмотры: ${fmt(vars.viewsCount)}
— переходы в программы: ${fmt(vars.clicksCount)}
— заявки: ${fmt(vars.leadsCount)}
— подтверждённые брони: ${fmt(vars.dealsCount)}

Даже если заявок пока немного, уже видно, что пользователи взаимодействуют с твоими программами и направлением.

Сейчас мы переходим к следующему этапу развития платформы — формату верифицированных партнёров.

Верификация позволит:

— продолжить размещение программ;
— участвовать в подборках и рекомендациях;
— получать аналитику по интересу пользователей;
— усиливать поток заявок через MyWave.

Условия на первый год:

— комиссия только с подтверждённых клиентов;
— ставка — 3%;
— без фиксированных платежей;
— без подписки на старте.

Если тебе интересно продолжить работу в этом формате — ответь на это письмо, и мы пришлём детали и договор.`;
}

function buildBodyB(vars: {
  viewsCount: number;
  clicksCount: number;
  leadsCount: number;
  dealsCount: number;
}): string {
  return `Привет!

Хочу поделиться результатами размещения твоих программ на MyWave.

За период:

— просмотры: ${fmt(vars.viewsCount)}
— переходы: ${fmt(vars.clicksCount)}
— заявки: ${fmt(vars.leadsCount)}
— подтверждённые брони: ${fmt(vars.dealsCount)}

Пользователи уже не просто смотрят программы — они переходят и оставляют заявки.

Сейчас мы формируем пул верифицированных партнёров, с которыми будем продолжать работу на прозрачных условиях.

Что даёт верификация:

— подтверждённый партнёрский статус;
— дальнейшее участие в выдаче, подборках и рекомендациях;
— прозрачную аналитику по заявкам;
— возможность масштабировать поток клиентов через MyWave.

Условия на первый год:

— комиссия только за подтверждённого клиента;
— ставка — 3%;
— без фиксированных платежей;
— без подписки.

Если всё ок — ответь на это письмо, и мы отправим договор для подключения.`;
}

function buildBodyC(vars: {
  viewsCount: number;
  clicksCount: number;
  leadsCount: number;
  dealsCount: number;
  dealAmountTotal: number;
}): string {
  return `Привет!

По твоим программам на MyWave уже есть реальные результаты.

За период:

— просмотры: ${fmt(vars.viewsCount)}
— переходы: ${fmt(vars.clicksCount)}
— заявки: ${fmt(vars.leadsCount)}
— подтверждённые брони: ${fmt(vars.dealsCount)}
— сумма подтверждённых сделок: ${fmt(vars.dealAmountTotal)}

Фактически MyWave уже начал приводить тебе клиентов.

Сейчас логичный следующий шаг — закрепить сотрудничество в формате верифицированного партнёрства.

Условия на первый год:

— комиссия только с подтверждённых клиентов;
— ставка — 3%;
— без фиксированных платежей;
— прозрачная аналитика;
— участие в подборках и рекомендациях.

Если готов продолжить — ответь на это письмо, и мы пришлём договор.`;
}

export function buildEmailForTemplate(
  type: "A_soft" | "B_leads" | "C_deals",
  orgName: string,
  m: OutreachMetrics
): { subject: string; body: string } {
  const sub = SUBJECT[type];
  let body: string;
  if (type === "A_soft") {
    body = buildBodyA({
      displayName: orgName,
      viewsCount: m.viewsCount,
      clicksCount: m.clicksCount,
      leadsCount: m.leadsCount,
      dealsCount: m.dealsCount,
    });
  } else if (type === "B_leads") {
    body = buildBodyB(m);
  } else {
    body = buildBodyC(m);
  }
  return { subject: sub, body };
}

/**
 * Бизнес-правило: комиссия 3% в первый год, только с подтверждённых сделок при verified-организаторе
 * (реализуется в движке комиссий и статусах брони; не подставляйте цифры в письмах извне).
 */
export const ORGANIZER_OUTREACH_COMMISSION_BPS = 300;
