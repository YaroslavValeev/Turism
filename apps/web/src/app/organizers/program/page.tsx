import type { Metadata } from "next";
import { OrganizerPageShell } from "../../../components/organizers/OrganizerPageShell";
import { ContractDownloadBlock } from "../../../components/organizers/ContractDownloadBlock";
import { ProgramIntakeForm } from "../../../components/organizers/ProgramIntakeForm";

export const metadata: Metadata = {
  title: "Подать программу — организаторам | MyWave Travel",
  description:
    "Заявка на публикацию программы в каталоге MyWave Travel: контакты, описание выезда и следующий шаг с командой платформы.",
};

export default function OrganizerProgramPage() {
  return (
    <OrganizerPageShell
      kicker="Организаторам"
      title="Подать программу"
      lead="Один шаг — заявка на размещение. После отправки оператор свяжется по email, уточнит детали карточки и подскажет, что нужно для публикации и верификации."
    >
      <ContractDownloadBlock page="program" />
      <ProgramIntakeForm />
    </OrganizerPageShell>
  );
}
