/**
 * Контент-конвейер: enum-строки синхронизированы с `services/api/prisma/schema.prisma`.
 * Для API приоритет — типы из `@prisma/client`; здесь — для фронта/админки без Prisma.
 */

export const CONTENT_WORKFLOW_STATUSES = [
  "ingest_collected",
  "draft",
  "pending_owner_review",
  "rewrite_requested",
  "approved",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "rejected",
  "skipped",
  "archived",
] as const;
export type ContentWorkflowStatus = (typeof CONTENT_WORKFLOW_STATUSES)[number];

export const RAW_ITEM_PARSE_STATUSES = ["pending", "ok", "partial", "failed", "skipped_duplicate"] as const;
export type RawItemParseStatus = (typeof RAW_ITEM_PARSE_STATUSES)[number];

export const CONTENT_DRAFT_TYPES = [
  "telegram_post",
  "vk_post",
  "facebook_post",
  "site_announce",
  "blog_post",
  "program_card_structured",
] as const;
export type ContentDraftType = (typeof CONTENT_DRAFT_TYPES)[number];

export const CONTENT_DRAFT_STATUSES = ["draft", "pending_owner_review", "ready", "superseded", "failed"] as const;
export type ContentDraftStatus = (typeof CONTENT_DRAFT_STATUSES)[number];

export const CONTENT_OWNER_DECISIONS = ["pending", "approved", "rewrite_requested", "rejected", "deferred", "skipped"] as const;
export type ContentOwnerDecision = (typeof CONTENT_OWNER_DECISIONS)[number];

export const CONTENT_PUBLICATION_CHANNELS = [
  "telegram_channel",
  "vk",
  "facebook",
  "site_blog",
  "site_landing",
] as const;
export type ContentPublicationChannel = (typeof CONTENT_PUBLICATION_CHANNELS)[number];

export const CONTENT_PUBLISH_STATES = [
  "pending",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "cancelled",
  "skipped",
] as const;
export type ContentPublishState = (typeof CONTENT_PUBLISH_STATES)[number];
