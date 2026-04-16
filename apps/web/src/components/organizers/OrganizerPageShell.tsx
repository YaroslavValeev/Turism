import type { ReactNode } from "react";
import Link from "next/link";

type Props = {
  title: string;
  kicker?: string;
  lead?: string;
  children: ReactNode;
};

export function OrganizerPageShell({ title, kicker, lead, children }: Props) {
  return (
    <div className="mw-organizer-page">
      <div className="mw-container mw-organizer-page__inner">
        <nav className="mw-organizer-page__back" aria-label="Навигация">
          <Link href="/">← На главную</Link>
        </nav>
        {kicker && <p className="mw-hero-kicker mw-organizer-page__kicker">{kicker}</p>}
        <h1 className="mw-h1 mw-organizer-page__title">{title}</h1>
        {lead && (
          <p className="mw-lead mw-organizer-page__lead" style={{ maxWidth: "62ch" }}>
            {lead}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
