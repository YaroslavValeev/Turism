import jwt, { type SignOptions } from "jsonwebtoken";

/**
 * JWT для публичной UGC-формы: подписывает связку (request, booking, program).
 * Использует тот же секрет, что и уведомления (NOTIFICATIONS_TOKEN_SECRET или JWT_SECRET).
 */
export type UgcJwtPurpose = "ugc_submit";

export type UgcJwtPayload = {
  r: string;
  b: string;
  p: string;
  pr: UgcJwtPurpose;
};

export function signUgcSubmitToken(
  secret: string,
  params: { requestId: string; bookingId: string; programId: string },
): string {
  const payload: UgcJwtPayload = {
    r: params.requestId,
    b: params.bookingId,
    p: params.programId,
    pr: "ugc_submit",
  };
  return jwt.sign(payload, secret, { expiresIn: "365d" });
}

export function verifyUgcSubmitToken(
  secret: string,
  token: string,
): { requestId: string; bookingId: string; programId: string } | null {
  try {
    const v = jwt.verify(token, secret) as Partial<UgcJwtPayload>;
    if (!v.r || !v.b || !v.p || v.pr !== "ugc_submit") return null;
    return { requestId: v.r, bookingId: v.b, programId: v.p };
  } catch {
    return null;
  }
}

/**
 * JWT для публичной страницы «Мои бонусы» (read-only).
 * Payload содержит email (lowercased) и опционально userId. TTL ограничен (7 дней),
 * чтобы ссылка из старого письма не превращалась в долговременный канал доступа.
 */
export type MyRewardsJwtPayload = {
  e: string | null;
  u: string | null;
  pr: "my_rewards";
};

export function signMyRewardsToken(
  secret: string,
  params: { email: string | null; userId: string | null; expiresIn?: SignOptions["expiresIn"] },
): string {
  const e = params.email ? params.email.trim().toLowerCase() : null;
  const u = params.userId ?? null;
  if (!e && !u) {
    throw new Error("signMyRewardsToken: at least one of email/userId required");
  }
  const payload: MyRewardsJwtPayload = { e, u, pr: "my_rewards" };
  return jwt.sign(payload, secret, { expiresIn: params.expiresIn ?? "7d" });
}

export function verifyMyRewardsToken(
  secret: string,
  token: string,
): { email: string | null; userId: string | null } | null {
  try {
    const v = jwt.verify(token, secret) as Partial<MyRewardsJwtPayload>;
    if (v.pr !== "my_rewards") return null;
    const email = typeof v.e === "string" && v.e.includes("@") ? v.e : null;
    const userId = typeof v.u === "string" && v.u.length > 0 ? v.u : null;
    if (!email && !userId) return null;
    return { email, userId };
  } catch {
    return null;
  }
}
