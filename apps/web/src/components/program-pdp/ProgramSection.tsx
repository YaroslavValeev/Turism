import type { ReactNode } from "react";

/** Обычный информационный раздел: типографика и разделитель, без карточки. */
export function ProgramSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section id={id} className="mw-content-section mw-pdp-section" aria-labelledby={headingId}>
      <h2 id={headingId} className="mw-pdp-h2">
        {title}
      </h2>
      {children}
    </section>
  );
}
