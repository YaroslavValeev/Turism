import type { Request, Response, NextFunction } from "express";

const HEADER = "authorization";
const INVALID_CAMP_API_TOKEN = "INVALID_CAMP_API_TOKEN";
const CAMP_API_TOKEN = "CAMP_API_TOKEN";

export function campApiAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = (process.env.CAMP_API_TOKEN || "").trim();

  if (!expected) {
    res.status(503).json({ error: `${INVALID_CAMP_API_TOKEN}:${CAMP_API_TOKEN}` });
    return;
  }

  const raw = req.headers[HEADER];

  const value = Array.isArray(raw) ? raw[0] : raw || "";

  const match = value.match(/^Bearer\s+(.+)$/i);

  const token = match?.[1]?.trim() || "";

  if (!token) {
    res.status(401).json({ error: INVALID_CAMP_API_TOKEN });
    return;
  }

  if (token !== expected) {
    res.status(403).json({ error: INVALID_CAMP_API_TOKEN });
    return;
  }

  next();

}
