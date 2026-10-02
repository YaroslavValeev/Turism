import type { Metadata } from "next";
import { DateSearch } from "./date-search.client";
import "./dates.css";

const TITLE = "Поиск по датам — MyWaveTour";
const DESCRIPTION = "Эти выходные, следующие или свои даты — покажем спортивные выезды и кэмпы, которые стартуют в эти дни.";
const OG_IMAGE = { url: "/og/date-search.png", width: 1200, height: 630, alt: "MyWaveTour — поиск по датам" };

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/dates" },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "MyWaveTour",
    url: "/dates",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_IMAGE.url] },
};

export default function DatesPage() {
  return <DateSearch />;
}
