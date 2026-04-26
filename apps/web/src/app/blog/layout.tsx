import type { Metadata } from "next";
import { LandingFooter } from "../../components/LandingFooter";
import { footer } from "../../content/pilotLanding";
import { BlogShell } from "./blog-shell";

export const metadata: Metadata = {
  title: "Блог",
  description:
    "Материалы о кэмпах, спортивных лагерях, дисциплинах и выездах по России — MyWaveTour.",
  openGraph: {
    title: "Блог MyWaveTour",
    description: "Новости, подборки и заметки о спортивных программах и организаторах.",
    type: "website",
  },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BlogShell>{children}</BlogShell>
      <LandingFooter brand={footer.brand} tagline={footer.tagline} links={footer.links} />
    </>
  );
}
