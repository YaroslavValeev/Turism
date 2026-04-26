import type { Metadata } from "next";
import { LandingFooter } from "../../components/LandingFooter";
import { footer } from "../../content/pilotLanding";
import { CollectionsShell } from "./collections-shell";

export const metadata: Metadata = {
  title: "Подборки",
  description: "Тематические подборки программ, статей и организаторов — MyWaveTour.",
  openGraph: {
    title: "Подборки MyWaveTour",
    description: "Входы по дисциплине, региону и сезону: к программам и заявке.",
    type: "website",
  },
};

export default function CollectionsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CollectionsShell>{children}</CollectionsShell>
      <LandingFooter brand={footer.brand} tagline={footer.tagline} links={footer.links} />
    </>
  );
}
