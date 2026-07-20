/**
 * Admin/internal auth only. POST /auth/login. No register, no public auth.
 * Source of truth: config_and_secrets_map (ADMIN_JWT_SECRET), handoff_to_dev_team.
 */
import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import type { AdminPayload } from "../../middleware/auth";

function hashPasswordSha256(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export function authRoutes(env: Env): Router {
  const router = Router();

  router.post("/login", async (req: Request, res: Response) => {
    const body = req.body as { email?: unknown; password?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!email || !password || email.length > 254 || password.length > 1_024) {
      res.status(400).json({ error: "email and password required" });
      return;
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.role !== "admin") {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const passwordHash = user.passwordHash;
    if (!passwordHash) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const isBcryptHash = passwordHash.startsWith("$2");
    const isValid = isBcryptHash ? await bcrypt.compare(password, passwordHash) : hashPasswordSha256(password) === passwordHash;
    if (!isValid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    if (!isBcryptHash) {
      const upgradedHash = await bcrypt.hash(password, 12);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: upgradedHash },
      });
    }
    const payload: AdminPayload = { sub: user.id, role: "admin" };
    const token = jwt.sign(payload, env.ADMIN_JWT_SECRET, { expiresIn: "8h" });
    res.json({ token, userId: user.id });
  });

  return router;
}
