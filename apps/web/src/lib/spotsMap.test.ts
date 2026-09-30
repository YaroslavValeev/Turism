import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SPOT_MAP_MAX_POINTS, yandexMapWidgetUrl } from "./spotsMap";

describe("yandexMapWidgetUrl", () => {
  it("returns null without points", () => {
    assert.equal(yandexMapWidgetUrl([]), null);
  });

  it("centers a single point with a plain marker", () => {
    assert.equal(
      yandexMapWidgetUrl([{ latitude: 55.751244, longitude: 37.618423 }]),
      "https://yandex.ru/map-widget/v1/?ll=37.618423,55.751244&z=13&pt=37.618423,55.751244,pm2rdm",
    );
  });

  it("numbers markers in list order and fits the bounds", () => {
    const url = yandexMapWidgetUrl([
      { latitude: 55.75, longitude: 37.61 },
      { latitude: 45.03, longitude: 38.97 },
    ]);
    assert.ok(url);
    const params = new URL(url).searchParams;
    assert.equal(params.get("pt"), "37.61,55.75,pm2blm1~38.97,45.03,pm2blm2");
    assert.equal(params.get("ll"), "38.29,50.39");
    assert.equal(params.get("z"), "4");
  });

  it("caps the number of markers", () => {
    const points = Array.from({ length: SPOT_MAP_MAX_POINTS + 5 }, (_, i) => ({ latitude: 50 + i / 100, longitude: 30 }));
    const pt = new URL(yandexMapWidgetUrl(points) ?? "").searchParams.get("pt") ?? "";
    assert.equal(pt.split("~").length, SPOT_MAP_MAX_POINTS);
  });
});
