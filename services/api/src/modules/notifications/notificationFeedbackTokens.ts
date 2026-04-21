import jwt from "jsonwebtoken";

export const NOTIFICATION_FEEDBACK_JWT_TYP = "nfb";

/** Короткие ключи JWT — меньше длина ссылки в письме. */
export type NotificationFeedbackJwtPayload = {
  j: string;
  s: string;
  p: string;
  e: string;
  d: string;
  f: "positive" | "negative";
};

export function signNotificationFeedbackToken(secret: string, payload: NotificationFeedbackJwtPayload): string {
  return jwt.sign({ ...payload, typ: NOTIFICATION_FEEDBACK_JWT_TYP }, secret, { expiresIn: "120d" });
}

export function verifyNotificationFeedbackToken(secret: string, token: string): NotificationFeedbackJwtPayload | null {
  try {
    const v = jwt.verify(token, secret) as Record<string, unknown>;
    if (v.typ !== NOTIFICATION_FEEDBACK_JWT_TYP) return null;
    if (typeof v.j !== "string" || !v.j) return null;
    if (typeof v.s !== "string" || !v.s) return null;
    if (typeof v.p !== "string" || !v.p) return null;
    if (typeof v.e !== "string" || !v.e) return null;
    if (typeof v.d !== "string" || !v.d) return null;
    if (v.f !== "positive" && v.f !== "negative") return null;
    return { j: v.j, s: v.s, p: v.p, e: v.e, d: v.d, f: v.f };
  } catch {
    return null;
  }
}
