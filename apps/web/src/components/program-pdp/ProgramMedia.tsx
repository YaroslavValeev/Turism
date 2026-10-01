import { presentProgramMediaUrl } from "../../lib/programCardCover";
import { IconImage } from "./icons";

export type ProgramMediaItem = {
  id: string;
  url: string;
  caption: string | null;
  mediaType: string;
};

export function isVideoMedia(m: Pick<ProgramMediaItem, "url" | "mediaType">): boolean {
  return m.mediaType === "video" || /\.(mp4|webm|mov)(\?|#|$)/i.test(m.url);
}

/** React 18 не знает camelCase `fetchPriority` и пишет warning; lowercase-атрибут уходит в DOM как есть. */
const HIGH_PRIORITY = { fetchpriority: "high" } as Record<string, string>;

function mediaAlt(m: ProgramMediaItem, title: string): string {
  return m.caption?.trim() || `${title} — фото программы`;
}

/** Главное фото над сгибом: фиксированный aspect-ratio (нет CLS), приоритетная загрузка. */
export function ProgramHeroMedia({
  item,
  title,
  imageCount,
  galleryAnchor,
}: {
  item: ProgramMediaItem;
  title: string;
  imageCount: number;
  galleryAnchor: string | null;
}) {
  const src = presentProgramMediaUrl(item.url) ?? item.url;
  return (
    <figure className="mw-pdp-hero-media">
      <img
        src={src}
        alt={mediaAlt(item, title)}
        width={1600}
        height={1000}
        loading="eager"
        {...HIGH_PRIORITY}
        decoding="async"
        className="mw-pdp-hero-media__img"
      />
      {imageCount > 1 && galleryAnchor && (
        <a href={`#${galleryAnchor}`} className="mw-pdp-hero-media__count">
          <IconImage />
          <span>
            1 / {imageCount}
            <span className="mw-visually-hidden"> — смотреть все фото и видео</span>
          </span>
        </a>
      )}
    </figure>
  );
}

/** Остальные фото и видео программы (функциональность прежней секции «Медиа»). */
export function ProgramGallery({ items, title }: { items: ProgramMediaItem[]; title: string }) {
  if (items.length === 0) return null;
  return (
    <div className="mw-program-media-gallery mw-pdp-gallery">
      {items.map((m) => {
        const src = presentProgramMediaUrl(m.url) ?? m.url;
        const caption = m.caption?.trim();
        return (
          <figure key={m.id} className="mw-program-media-item mw-pdp-gallery__item">
            {isVideoMedia(m) ? (
              <video src={src} controls playsInline preload="metadata" className="mw-pdp-gallery__video">
                <a href={src} target="_blank" rel="noreferrer">
                  {caption || "Открыть видео"}
                </a>
              </video>
            ) : (
              <img src={src} loading="lazy" decoding="async" alt={mediaAlt(m, title)} className="mw-pdp-gallery__img" />
            )}
            {caption ? <figcaption className="mw-pdp-gallery__caption">{caption}</figcaption> : null}
          </figure>
        );
      })}
    </div>
  );
}
