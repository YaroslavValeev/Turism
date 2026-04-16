import type { ReactNode } from "react";

type Strip = "default" | "warm" | "white" | "muted";

type Props = {
  id?: string;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  tight?: boolean;
  strip?: Strip;
};

const stripClass: Record<Strip, string> = {
  default: "",
  warm: "mw-strip--warm",
  white: "mw-strip--white",
  muted: "mw-strip--muted",
};

export function Section({ id, title, subtitle, children, className = "", tight, strip = "default" }: Props) {
  const stripCls = stripClass[strip];
  return (
    <section
      id={id}
      className={`mw-section ${tight ? "mw-section--tight" : ""} ${stripCls} ${className}`.trim()}
    >
      <div className="mw-container">
        {title && <h2 className="mw-h2">{title}</h2>}
        {subtitle && <p className="mw-section-lead">{subtitle}</p>}
        {children}
      </div>
    </section>
  );
}
