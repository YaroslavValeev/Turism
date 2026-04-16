import type {
  BillingStatementStatus,
  BookingStatus,
  CommissionReconciliationStatus,
  IncidentStatus,
  LeadStatus,
  OrganizerBillingStatus,
  OrganizerContractStatus,
  OrganizerOnboardingStatus,
  OrganizerPrivilegeStatus,
  OrganizerVerificationStatus,
  PaymentStatus,
  ProgramPublishStatus,
  RefundStatus,
} from "./statuses";

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  created: "Создан заказ",
  new: "Новая",
  reviewed: "Проверена",
  sent_to_organizer: "Передана организатору",
  contacted: "Связались с гостем",
  offer_sent: "Предложение отправлено",
  booked: "Забронирована",
  paid_partial: "Частично оплачена",
  paid_full: "Полностью оплачена",
  paid_off_platform: "Оплачена вне платформы",
  completed: "Завершена",
  canceled: "Отменена",
  cancelled_user: "Отменена гостем",
  cancelled_organizer: "Отменена организатором",
  refunded_partial: "Частичный возврат",
  refunded_full: "Полный возврат",
  refund_pending: "Возврат в работе",
  refund_done: "Возврат выполнен",
  disputed: "Спорная сделка",
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Новый лид",
  contacted: "Связались",
  qualified: "Квалифицирован",
  rejected: "Отклонён",
};

export const ORGANIZER_VERIFICATION_STATUS_LABELS: Record<OrganizerVerificationStatus, string> = {
  listed: "В листинге",
  checked: "Проверен",
  verified: "Верифицирован",
  trusted_by_platform: "Доверенный",
  paused: "На паузе",
  rejected: "Отклонён",
};

export const PROGRAM_PUBLISH_STATUS_LABELS: Record<ProgramPublishStatus, string> = {
  draft: "Черновик",
  internal_review: "Внутренняя проверка",
  needs_fix: "Нужна доработка",
  approved: "Одобрена",
  published: "Опубликована",
  paused: "На паузе",
  archived: "В архиве",
};

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  open: "Открыт",
  triaged: "Триаж выполнен",
  investigating: "В расследовании",
  waiting_on_organizer: "Ждём организатора",
  waiting_on_user: "Ждём гостя",
  resolved: "Решён",
  escalated: "Эскалирован",
  closed: "Закрыт",
};

export const COMMISSION_RECONCILIATION_STATUS_LABELS_RU: Record<
  CommissionReconciliationStatus,
  string
> = {
  draft: "Черновик",
  pending_evidence: "Ждём подтверждения",
  accrued: "Начислена",
  approved: "Одобрена",
  invoiced: "Счёт выставлен",
  partially_paid: "Частично оплачена",
  paid: "Оплачена",
  reversed: "Сторнирована",
  disputed: "Спорная",
  written_off: "Списана",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  recorded: "Зафиксирована",
  confirmed: "Подтверждена",
  failed: "Ошибка",
  reversed: "Сторнирована",
};

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  recorded: "Зафиксирован",
  completed: "Выполнен",
  failed: "Ошибка",
  canceled: "Отменён",
};

export const ORGANIZER_ONBOARDING_STATUS_LABELS: Record<OrganizerOnboardingStatus, string> = {
  applied: "Заявка подана",
  under_review: "На проверке",
  approved: "Одобрен",
  contract_pending: "Ждём договор",
  contract_signed: "Договор подписан",
  billing_connected: "Биллинг подключён",
  active: "Активен",
  limited: "Ограничен",
  suspended: "Приостановлен",
};

export const ORGANIZER_CONTRACT_STATUS_LABELS: Record<OrganizerContractStatus, string> = {
  not_generated: "Не сформирован",
  generated: "Сформирован",
  sent: "Отправлен",
  signed: "Подписан",
  expired: "Истёк",
  rejected: "Отклонён",
};

export const ORGANIZER_PRIVILEGE_STATUS_LABELS: Record<OrganizerPrivilegeStatus, string> = {
  limited: "Ограниченный режим",
  active: "Полные привилегии",
  suspended: "Приостановлен",
};

export const ORGANIZER_BILLING_STATUS_LABELS: Record<OrganizerBillingStatus, string> = {
  not_connected: "Не подключён",
  billing_connected: "Подключён",
  suspended: "Приостановлен",
};

export const BILLING_STATEMENT_STATUS_LABELS: Record<BillingStatementStatus, string> = {
  draft: "Черновик",
  review: "На сверке",
  invoiced: "Счёт выставлен",
  paid: "Оплачен",
  disputed: "Спор",
  void: "Аннулирован",
};

const REVIEW_MODERATION_STATUS_LABELS: Record<string, string> = {
  pending: "На модерации",
  approved: "Одобрен",
  rejected: "Отклонён",
};

const SEVERITY_LABELS: Record<string, string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
  critical: "Критический",
};

const PROGRAM_LEVEL_LABELS: Record<string, string> = {
  beginner: "Начальный",
  intermediate: "Средний",
  advanced: "Продвинутый",
  expert: "Экспертный",
  all_levels: "Любой",
};

const INCIDENT_TYPE_LABELS: Record<string, string> = {
  complaint: "Жалоба",
  safety: "Безопасность",
  medical: "Медицина",
  logistics: "Логистика",
  payment: "Оплата",
  other: "Другое",
};

const SOURCE_CHANNEL_LABELS: Record<string, string> = {
  program_page: "Страница программы",
  admin_manual: "Вручную оператором",
  organizer_referral: "От организатора",
  inbound_message: "Входящее сообщение",
};

const MEDIA_TYPE_LABELS: Record<string, string> = {
  image: "Изображение",
  video: "Видео",
  document: "Документ",
};

const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  document: "Документ",
  review_batch: "Пакет проверки",
  media_report: "Медиапроверка",
  certificate: "Сертификат",
  license: "Лицензия",
  insurance: "Страховка",
  agreement: "Договор",
  identity: "Подтверждение личности",
  other: "Другое",
};

function getLabel(value: string | null | undefined, labels: Record<string, string>) {
  if (!value) return "—";
  return labels[value] ?? value;
}

export function getBookingStatusLabel(value: string | null | undefined) {
  return getLabel(value, BOOKING_STATUS_LABELS);
}

export function getOrganizerVerificationStatusLabel(value: string | null | undefined) {
  return getLabel(value, ORGANIZER_VERIFICATION_STATUS_LABELS);
}

export function getProgramPublishStatusLabel(value: string | null | undefined) {
  return getLabel(value, PROGRAM_PUBLISH_STATUS_LABELS);
}

export function getIncidentStatusLabel(value: string | null | undefined) {
  return getLabel(value, INCIDENT_STATUS_LABELS);
}

export function getCommissionReconciliationStatusLabel(value: string | null | undefined) {
  return getLabel(value, COMMISSION_RECONCILIATION_STATUS_LABELS_RU);
}

export function getLeadStatusLabel(value: string | null | undefined) {
  return getLabel(value, LEAD_STATUS_LABELS);
}

export function getPaymentStatusLabel(value: string | null | undefined) {
  return getLabel(value, PAYMENT_STATUS_LABELS);
}

export function getRefundStatusLabel(value: string | null | undefined) {
  return getLabel(value, REFUND_STATUS_LABELS);
}

export function getOrganizerOnboardingStatusLabel(value: string | null | undefined) {
  return getLabel(value, ORGANIZER_ONBOARDING_STATUS_LABELS);
}

export function getOrganizerContractStatusLabel(value: string | null | undefined) {
  return getLabel(value, ORGANIZER_CONTRACT_STATUS_LABELS);
}

export function getOrganizerPrivilegeStatusLabel(value: string | null | undefined) {
  return getLabel(value, ORGANIZER_PRIVILEGE_STATUS_LABELS);
}

export function getOrganizerBillingStatusLabel(value: string | null | undefined) {
  return getLabel(value, ORGANIZER_BILLING_STATUS_LABELS);
}

export function getBillingStatementStatusLabel(value: string | null | undefined) {
  return getLabel(value, BILLING_STATEMENT_STATUS_LABELS);
}

export function getReviewModerationStatusLabel(value: string | null | undefined) {
  return getLabel(value, REVIEW_MODERATION_STATUS_LABELS);
}

export function getSeverityLabel(value: string | null | undefined) {
  return getLabel(value, SEVERITY_LABELS);
}

export function getProgramLevelLabel(value: string | null | undefined) {
  return getLabel(value, PROGRAM_LEVEL_LABELS);
}

export function getIncidentTypeLabel(value: string | null | undefined) {
  return getLabel(value, INCIDENT_TYPE_LABELS);
}

export function getSourceChannelLabel(value: string | null | undefined) {
  return getLabel(value, SOURCE_CHANNEL_LABELS);
}

export function getMediaTypeLabel(value: string | null | undefined) {
  return getLabel(value, MEDIA_TYPE_LABELS);
}

export function getEvidenceTypeLabel(value: string | null | undefined) {
  return getLabel(value, EVIDENCE_TYPE_LABELS);
}
