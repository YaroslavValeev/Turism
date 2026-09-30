import { yandexMapWidgetUrl, type MapPoint } from "../../lib/spotsMap";

export function SpotsMap({ points, title, height = 420 }: { points: MapPoint[]; title: string; height?: number }) {
  const src = yandexMapWidgetUrl(points);
  if (!src) return null;
  return (
    <div
      style={{
        borderRadius: "var(--mw-radius-lg)",
        overflow: "hidden",
        border: "1px solid rgba(13, 105, 94, 0.18)",
        marginBottom: "1.5rem",
        background: "#eef5f4",
      }}
    >
      <iframe
        src={src}
        title={title}
        width="100%"
        height={height}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        style={{ display: "block", border: 0 }}
        allowFullScreen
      />
    </div>
  );
}
