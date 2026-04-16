/**
 * Admin/internal auth only. POST /auth/login. No register, no public auth.
 * Source of truth: config_and_secrets_map (ADMIN_JWT_SECRET), handoff_to_dev_team.
 */
import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import type { AdminPayload } from "../../middleware/auth";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export function authRoutes(env: Env): Router {
  const router = Router();

  router.post("/login", async (req: Request, res: Response) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: "email and password required" });
      return;
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.role !== "admin") {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const passwordHash = user.passwordHash;
    if (!passwordHash || hashPassword(password) !== passwordHash) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const payload: AdminPayload = { sub: user.id, role: "admin" };
    const token = jwt.sign(payload, env.ADMIN_JWT_SECRET, { expiresIn: "24h" });
    res.json({ token, userId: user.id });
  });

  return router;
}
