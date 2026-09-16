import assert from "node:assert/strict";
import test from "node:test";

import { presentProgramMediaUrl } from "./programCardCover";

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
