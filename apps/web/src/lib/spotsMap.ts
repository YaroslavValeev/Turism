export interface MapPoint {
  latitude: number;
  longitude: number;
}

/** Нумерованные метки виджета поддерживают только номера 1–99. */
export const SPOT_MAP_MAX_POINTS = 99;

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Встраиваемый виджет Яндекс Карт (iframe): не требует ключа JS API и 'unsafe-eval' в CSP.
 * Метка №N соответствует N-й карточке в списке, поэтому порядок точек важен.
 */
export function yandexMapWidgetUrl(points: MapPoint[]): string | null {
  const shown = points.slice(0, SPOT_MAP_MAX_POINTS);
  if (shown.length === 0) return null;

  const lats = shown.map((p) => p.latitude);
  const lngs = shown.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const span = Math.max(maxLat - minLat, maxLng - minLng);
  const zoom = shown.length === 1 || span === 0 ? 13 : Math.max(3, Math.min(13, Math.floor(Math.log2(360 / span)) - 1));

  const pt = shown
    .map((p, i) => `${round6(p.longitude)},${round6(p.latitude)},${shown.length === 1 ? "pm2rdm" : `pm2blm${i + 1}`}`)
    .join("~");
  const ll = `${round6((minLng + maxLng) / 2)},${round6((minLat + maxLat) / 2)}`;
  return `https://yandex.ru/map-widget/v1/?ll=${ll}&z=${zoom}&pt=${pt}`;
}
