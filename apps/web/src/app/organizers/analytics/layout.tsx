import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Аналитика организатора | MyWaveTour",
  robots: { index: false, follow: false, nocache: true },
};

export default function OrganizerAnalyticsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
