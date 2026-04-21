import { z } from "zod";
import {
  PROGRAM_ECONOMICS_OVERRIDE_MODES,
  REFERRAL_ECONOMICS_OVERRIDE_MODES,
} from "./economicsOverride";

const programModeEnum = z.enum(PROGRAM_ECONOMICS_OVERRIDE_MODES);
const referralModeEnum = z.enum(REFERRAL_ECONOMICS_OVERRIDE_MODES);

/** ISO-строка даты или пусто (клиент может слать datetime-local → нормализуем на сервере как Date). */
const isoDateString = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: "invalid_iso_date" });

/**
 * Preview: только согласованные поля, без мусора (strict).
 * reason опционален — для apply обязателен отдельной схемой.
 */
export const programOverridePreviewBodySchema = z
  .object({
    mode: programModeEnum,
    reason: z.string().max(4000).optional(),
    until: z.union([isoDateString, z.null()]).optional(),
    indefinite: z.boolean().optional(),
  })
  .strict();

export const referralOverridePreviewBodySchema = z
  .object({
    mode: referralModeEnum,
    until: z.union([isoDateString, z.null()]).optional(),
    indefinite: z.boolean().optional(),
  })
  .strict();

/** POST override программы: reason обязателен. */
export const programOverrideApplyBodySchema = z
  .object({
    mode: programModeEnum,
    reason: z.string().min(1).max(4000),
    until: z.union([isoDateString, z.null()]).optional(),
    indefinite: z.boolean().optional(),
  })
  .strict();

/** POST override реферала. */
export const referralOverrideApplyBodySchema = z
  .object({
    mode: referralModeEnum,
    reason: z.string().min(1).max(4000),
    until: z.union([isoDateString, z.null()]).optional(),
    indefinite: z.boolean().optional(),
  })
  .strict();

export function zodErrorPayload(err: z.ZodError) {
  return {
    error: "invalid_body" as const,
    issues: err.flatten(),
  };
}
