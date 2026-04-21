import jwt from "jsonwebtoken";

export type NotificationJwtPurpose = "unsub";

export function signNotificationUnsubscribeToken(secret: string, subscriptionId: string): string {
  const purpose: NotificationJwtPurpose = "unsub";
  return jwt.sign({ sid: subscriptionId, p: purpose }, secret, { expiresIn: "365d" });
}

export function verifyNotificationUnsubscribeToken(
  secret: string,
  token: string,
): { subscriptionId: string } | null {
  try {
    const v = jwt.verify(token, secret) as { sid?: string; p?: string };
    if (!v.sid || v.p !== "unsub") return null;
    return { subscriptionId: v.sid };
  } catch {
    return null;
  }
}

export function notificationTokenSecret(env: { JWT_SECRET: string; NOTIFICATIONS_TOKEN_SECRET?: string }): string {
  return (env.NOTIFICATIONS_TOKEN_SECRET ?? env.JWT_SECRET).trim();
}
