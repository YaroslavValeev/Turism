import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AnalyticsRoot } from "../components/AnalyticsRoot";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MyWave Travel — тренировочные выезды и кэмпы по вейксерфингу",
  description:
    "Тренировочные выезды и кэмпы с проверенными организаторами, понятным форматом участия и сопровождением команды MyWave.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className={inter.className}>
      <body className="mw-body">
        {children}
        <AnalyticsRoot />
      </body>
    </html>
  );
}
