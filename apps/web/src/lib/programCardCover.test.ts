import assert from "node:assert/strict";
import test from "node:test";

import {
  orderProgramMediaForDisplay,
  pickBestProgramCoverImageUrl,
  presentProgramMediaUrl,
} from "./programCardCover";

const CLIMATE_HINT = "Средняя температура воды по месяцам, таблица на первом слайде";
const gallery = [
  { id: "a", url: "/ingestion-media/brand-logo.jpg", mediaType: "image" },
  { id: "b", url: "/ingestion-media/b.jpg", mediaType: "image" },
  { id: "c", url: "/ingestion-media/c.jpg", mediaType: "image" },
];

test("heuristics skip promo graphics and reverse climate galleries when order is not pinned", () => {
  assert.equal(pickBestProgramCoverImageUrl(gallery, null), "/ingestion-media/b.jpg");
  assert.equal(pickBestProgramCoverImageUrl(gallery, CLIMATE_HINT), "/ingestion-media/c.jpg");
  assert.deepEqual(orderProgramMediaForDisplay(gallery, CLIMATE_HINT).map((m) => m.id), ["c", "b", "a"]);
});

test("admin-pinned media order wins over cover heuristics", () => {
  const pinned = { mediaOrderPinned: true };
  assert.equal(pickBestProgramCoverImageUrl(gallery, CLIMATE_HINT, pinned), "/ingestion-media/brand-logo.jpg");
  assert.deepEqual(orderProgramMediaForDisplay(gallery, CLIMATE_HINT, pinned).map((m) => m.id), ["a", "b", "c"]);
});

test("presentProgramMediaUrl loads Telegram CDN directly instead of proxying it", () => {
  const telegramUrl = "https://cdn4.telesco.pe/file/example-photo.jpg";

  assert.equal(presentProgramMediaUrl(telegramUrl), telegramUrl);
});

test("presentProgramMediaUrl still proxies ordinary remote images", () => {
  const remoteUrl = "https://images.example.test/photo.jpg";

  assert.equal(
    presentProgramMediaUrl(remoteUrl),
    `/api/media?url=${encodeURIComponent(remoteUrl)}`,
  );
});
