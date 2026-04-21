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
      lead="Пошаговая заявка на размещение: базовые поля для публикации и отдельный шаг для verified / trusted — как в требованиях платформы к полной карточке. После отправки оператор свяжется по email, перенесёт данные в систему (включая медиа) и проведёт по публикации."
    >
      <ContractDownloadBlock page="program" />
      <ProgramIntakeForm />
    </OrganizerPageShell>
  );
}
