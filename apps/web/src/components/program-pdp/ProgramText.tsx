import type { ReactNode } from "react";
import type { ResolvedProgramField } from "../../lib/recommendedProgramFields";

const URL_PATTERN = /(https?:\/\/[^\s]+)/gi;

function linkLabelForUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "");
    return `Открыть источник (${host})`;
  } catch {
    return "Открыть источник";
  }
}

export function sanitizeScrapedProgramText(text: string): string {
  const cleaned = String(text ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\(\s*min-width:[^>]+type=["']text\/css["']>\s*/gi, " ")
    .replace(
      /(?:https?:)?\/\/(?:static|thb)\.tildacdn\.com\/[^\s"'`<>]+/gi,
      " ",
    )
    .replace(
      /\b(?:src|href|role|type|style|class|data-[\w-]+)=["'][^"']*["']/gi,
      " ",
    )
    .replace(/<\/?(?:style|script|link|img|source)[^>]*>/gi, " ")
    .replace(/<\/?[^>]+>/g, " ");

  return cleaned
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/\s+/g, " ")
        .replace(/^[\s"'`;:.,)\]}>/\\-]+/, "")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

function renderTextWithLinks(text: string): ReactNode[] {
  const lines = sanitizeScrapedProgramText(text).split(/\r?\n/);
  const nodes: ReactNode[] = [];

  lines.forEach((line, lineIndex) => {
    const parts = line.split(URL_PATTERN);
    parts.forEach((part, partIndex) => {
      if (!part) return;
      if (/^https?:\/\/[^\s]+$/i.test(part)) {
        nodes.push(
          <a
            key={`lnk-${lineIndex}-${partIndex}`}
            href={part}
            target="_blank"
            rel="nofollow noopener noreferrer"
            title={part}
            className="mw-pdp-inline-link"
          >
            {linkLabelForUrl(part)}
          </a>,
        );
      } else {
        nodes.push(<span key={`txt-${lineIndex}-${partIndex}`}>{part}</span>);
      }
    });
    if (lineIndex < lines.length - 1)
      nodes.push(<br key={`br-${lineIndex}`} />);
  });

  return nodes;
}

export function Prose({ text }: { text: string }) {
  return <p className="mw-pdp-prose">{renderTextWithLinks(text)}</p>;
}

export function linesToBullets(text: string): string[] {
  return sanitizeScrapedProgramText(text)
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

export function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mw-pdp-list">
      {items.map((line, index) => (
        <li key={`${index}-${line}`}>{line}</li>
      ))}
    </ul>
  );
}

/** Подсказка MyWave: общая практика для формата, не слова организатора — тонким серым шрифтом. */
export function MyWaveNote({ children }: { children: ReactNode }) {
  return (
    <p className="mw-mywave-note">
      <span className="mw-mywave-note__label">Примечание MyWave — не от организатора. </span>
      {children}
    </p>
  );
}

export type SourceKind = "organizer" | "mywave";

/** Подпись-источник: различает слова организатора и оценку/вывод платформы. */
export function SourceCaption({ kind }: { kind: SourceKind }) {
  return (
    <p className={`mw-organizer-caption mw-pdp-source-caption mw-pdp-source-caption--${kind}`}>
      {kind === "organizer" ? "По данным организатора" : "Оценка MyWaveTour"}
    </p>
  );
}

export function ProgramInfoField({
  label,
  value,
}: {
  label: string;
  value: ResolvedProgramField;
}) {
  return (
    <div className="mw-pdp-info-field">
      <h3 className="mw-pdp-h3">{label}</h3>
      {value.mode === "recommended" ? <MyWaveNote>{value.text}</MyWaveNote> : <Prose text={value.text} />}
    </div>
  );
}
