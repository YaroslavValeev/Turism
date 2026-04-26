import type { ReactNode } from "react";

type Props = {
  hint: string;
  children: ReactNode;
  className?: string;
};

export function HoverHint({ hint, children, className }: Props) {
  return (
    <span className={`mw-hover-hint${className ? ` ${className}` : ""}`} tabIndex={0}>
      <span className="mw-hover-hint__trigger">{children}</span>
      <span className="mw-hover-hint__tooltip" role="tooltip">
        {hint}
      </span>
    </span>
  );
}
