import type { Metadata } from "next";
import { getServerApiBaseUrl, safeServerFetch } from "../../../lib/serverApiBase";

type ProgramData = {
  title?: string;
  discipline?: string;
  region?: string;
  audienceFit?: string | null;
};

async function getProgram(id: string): Promise<ProgramData | null> {
  const base = getServerApiBaseUrl();
  const res = await safeServerFetch(`${base}/programs/${id}`, { next: { revalidate: 300 } });
  if (!res || !res.ok) return null;
  return (await res.json()) as ProgramData;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const program = await getProgram(params.id);
  const title = program?.title ? `${program.title} | MyWaveTour` : "Программа | MyWaveTour";
  const description =
    program?.audienceFit?.slice(0, 150) ||
    (program?.discipline && program?.region
      ? `${program.discipline} в регионе ${program.region}. Детали, условия участия и заявка на MyWaveTour.`
      : "Карточка программы MyWaveTour: описание, условия участия и отправка заявки.");
  return {
    title,
    description,
    alternates: {
      canonical: `/program/${params.id}`,
    },
  };
}

export default function ProgramLayout({ children }: { children: React.ReactNode }) {
  return children;
}
