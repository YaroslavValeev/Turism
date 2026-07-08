import { Router } from "express";

import { campApiAuth } from "../middleware/campApiAuth";
import { getCampById, listCamps } from "../modules/camp-feed/service";

export const campsV1Router = Router();

campsV1Router.use(campApiAuth);

campsV1Router.get("/camps", async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || "100"), 10) || 100, 1), 100);
    const offset = Math.max(parseInt(String(req.query.offset || "0"), 10) || 0, 0);
    const status = String(req.query.status || "published");
    const sports = String(req.query.sports || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const audience = String(req.query.audience || "ru");
    const updatedSince = req.query.updated_since ? new Date(String(req.query.updated_since)) : null;

    const { items, nextOffset } = await listCamps({
      status,
      sports,
      audience,
      limit,
      offset,
      updatedSince,
    });

    res.json({ items, next_offset: nextOffset });
  } catch (err) {
    next(err);
  }
});

campsV1Router.get("/camps/:id", async (req, res, next) => {
  try {
    const camp = await getCampById(req.params.id);

    if (!camp) {
      res.status(404).json({ error: "camp_not_found" });
      return;
    }

    res.json(camp);
  } catch (err) {
    next(err);
  }
});
