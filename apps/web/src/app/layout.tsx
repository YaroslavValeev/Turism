import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AnalyticsRoot } from "../components/AnalyticsRoot";
import { PilotModeBanner } from "../components/PilotModeBanner";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://mywavetour.ru"),
  title: "MyWaveTour — кэмпы и спортивные выезды по России",
  description:
    "MyWaveTour — проводник в среду спортивных выездов по России: выбирай программу, расти в дисциплине и выходи на прямой контакт с организатором.",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className={inter.className}>
      <body className="mw-body">
        <PilotModeBanner />
        {children}
        <AnalyticsRoot />
      </body>
    </html>
  );
}
