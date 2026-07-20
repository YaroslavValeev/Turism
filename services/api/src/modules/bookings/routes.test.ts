import express from "express";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import type { Env } from "@mywave/config";
import { bookingsRoutes } from "./routes";

const env = {
  ADMIN_JWT_SECRET: "a".repeat(32),
  PUBLIC_RATE_LIMIT_WINDOW_MS: 60_000,
  PUBLIC_RATE_LIMIT_MAX: 2,
} as Env;

describe("public booking throttling", () => {
  it("rate-limits POST / before any database work", async () => {
    const app = express();
    app.use(express.json({ limit: "100kb" }));
    app.use("/bookings", bookingsRoutes(env));
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    const post = () => fetch(`http://127.0.0.1:${port}/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    try {
      expect((await post()).status).toBe(400);
      expect((await post()).status).toBe(400);
      const blocked = await post();
      expect(blocked.status).toBe(429);
      await expect(blocked.json()).resolves.toEqual({ error: "Too many requests" });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
