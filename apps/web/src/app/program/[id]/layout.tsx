import type { Metadata } from "next";
import { getServerApiBaseUrl, safeServerFetch } from "../../../lib/serverApiBase";

type ProgramData = {
  title?: string;
  discipline?: string;
  region?: string;
  audienceFit?: string | null;
  startDate?: string;
  endDate?: string;
  media?: { url?: string; mediaType?: string }[];
};

async function getProgram(id: string): Promise<ProgramData | null> {
  const base = getServerApiBaseUrl();
  const res = await safeServerFetch(`${base}/programs/${id}`, { next: { revalidate: 300 } });
  if (!res || !res.ok) return null;
  return (await res.json()) as ProgramData;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const program = await getProgram(id);
  const title = program?.title ? `${program.title} | MyWaveTour` : "Программа | MyWaveTour";
  const description =
    program?.audienceFit?.slice(0, 150) ||
    (program?.discipline && program?.region
      ? `${program.discipline} в регионе ${program.region}. Детали, условия участия и заявка на MyWaveTour.`
      : "Карточка программы MyWaveTour: описание, условия участия и отправка заявки.");
  const image = program?.media?.find((item) => item.mediaType === "image" && item.url)?.url;
  return {
    title,
    description,
    alternates: {
      canonical: `/program/${id}`,
    },
    ...(!program ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      type: "website",
      title,
      description,
      url: `/program/${id}`,
      ...(image ? { images: [{ url: image, alt: program?.title ?? "Программа MyWaveTour" }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function ProgramLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const program = await getProgram(id);
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://mywavetour.ru").replace(/\/+$/, "");
  const structuredData = program
    ? {
        "@context": "https://schema.org",
        "@type": "TouristTrip",
        name: program.title,
        description: program.audienceFit ?? undefined,
        url: `${siteUrl}/program/${encodeURIComponent(id)}`,
        touristType: program.discipline ?? undefined,
        startDate: program.startDate ?? undefined,
        endDate: program.endDate ?? undefined,
      }
    : null;
  return (
    <>
      {structuredData ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
        />
      ) : null}
      {children}
    </>
  );
}
