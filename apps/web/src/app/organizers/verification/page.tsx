import type { Metadata } from "next";
import Link from "next/link";
import { OrganizerPageShell } from "../../../components/organizers/OrganizerPageShell";
import { VerificationInquiryForm } from "../../../components/organizers/VerificationInquiryForm";
import { ContractDownloadBlock } from "../../../components/organizers/ContractDownloadBlock";
import { verificationPage } from "../../../content/organizerFlows";

export const metadata: Metadata = {
  title: "Верификация организатора | MyWaveTour",
  description:
    "Как устроена проверка организаторов в MyWaveTour и как запросить консультацию.",
};

export default function OrganizerVerificationPage() {
  return (
    <OrganizerPageShell kicker="Организаторам" title={verificationPage.title} lead={verificationPage.lead}>
      <div className="mw-organizer-verification__sections">
        {verificationPage.sections.map((s) => (
          <section key={s.heading} className="mw-content-section" style={{ marginBottom: "1.5rem" }}>
            <h2 className="mw-h2" style={{ marginBottom: "0.5rem" }}>
              {s.heading}
            </h2>
            <p style={{ margin: 0, color: "var(--mw-muted)", lineHeight: 1.65, maxWidth: "62ch" }}>{s.body}</p>
          </section>
        ))}
      </div>

      <section className="mw-content-section" style={{ marginBottom: "2rem" }}>
        <h2 className="mw-h2">{verificationPage.nextStepsTitle}</h2>
        <ul style={{ margin: 0, paddingLeft: 22, color: "var(--mw-muted)", maxWidth: "62ch", lineHeight: 1.65 }}>
          {verificationPage.nextSteps.map((t) => (
            <li key={t} style={{ marginBottom: 10 }}>
              {t}
            </li>
          ))}
        </ul>
        <p style={{ marginTop: 16 }}>
          <Link href="/organizers/program" className="mw-btn mw-btn--primary">
            Перейти к форме «Подать программу»
          </Link>
        </p>
      </section>

      <ContractDownloadBlock page="verification" />

      <VerificationInquiryForm />
    </OrganizerPageShell>
  );
}
