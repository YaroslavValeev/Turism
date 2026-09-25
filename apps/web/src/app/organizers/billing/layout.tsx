import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Биллинг организатора | MyWaveTour",
  robots: { index: false, follow: false, nocache: true },
};

export default function OrganizerBillingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
