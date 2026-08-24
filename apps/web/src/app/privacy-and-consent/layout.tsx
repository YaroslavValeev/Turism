import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Конфиденциальность и согласие | MyWaveTour",
  description: "Как MyWaveTour использует cookies, аналитику и обрабатывает данны пользователей.",
  alternates: { canonical: "/privacy-and-consent" },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
