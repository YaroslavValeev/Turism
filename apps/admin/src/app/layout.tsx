import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AdminChrome } from "../components/admin/AdminChrome";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "MyWave Admin", template: "%s · MyWave Admin" },
  description: "Операционная панель MyWave",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={inter.className}>
      <body className="mw-body">
        <AdminChrome>{children}</AdminChrome>
      </body>
    </html>
  );
}
