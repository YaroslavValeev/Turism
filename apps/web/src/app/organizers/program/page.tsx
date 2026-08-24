import type { Metadata } from "next";
import { OrganizerPageShell } from "../../../components/organizers/OrganizerPageShell";
import { ContractDownloadBlock } from "../../../components/organizers/ContractDownloadBlock";
import { ProgramIntakeForm } from "../../../components/organizers/ProgramIntakeForm";

export const metadata: Metadata = {
  title: "Подать программу — организаторам | MyWaveTour",
  description:
    "Подача программы в MyWaveTour: контакты, формат выезда и следующий шаг до публикации в витрине.",
  alternates: { canonical: "/organizers/program" },
};

export default function OrganizerProgramPage() {
  return (
    <OrganizerPageShell
      kicker="Организаторам"
      title="Подать программу"
      lead="Один шаг — и ваша программа в работе. После отправки оператор свяжется по email, уточнит детали карточки и подскажет следующий шаг до публикации."
    >
      <ContractDownloadBlock page="program" />
      <ProgramIntakeForm />
    </OrganizerPageShell>
  );
}
