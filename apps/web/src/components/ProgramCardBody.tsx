import Link from "next/link";
import { getDisciplineDisplay } from "../lib/disciplineLabels";
import { participantLevel } from "../lib/catalog";
import { reviewWord } from "../lib/programCardHelpers";
import type { ProgramCardProgram } from "../lib/programCardModel";

type Props = {
  program: ProgramCardProgram;
  levelLabel: string;
  catalogHrefBuilder?: (next: {
    discipline?: string;
    region?: string;
  }) => string;
  programHrefQuery?: string;
};

export function ProgramCardBody({
  program,
  levelLabel,
  programHrefQuery,
}: Props) {
  const pdp = `/program/${program.id}${programHrefQuery ? `?${programHrefQuery.replace(/^\?/, "")}` : ""}`;
  const discipline = getDisciplineDisplay(program.discipline);
  const count = program.organizer?.reviewCount ?? 0;
  return (
    <>
      <p className="mw-card-location">
        {[program.region, program.exactLocation].filter(Boolean).join(" · ")}
      </p>
      <dl className="mw-card-facts">
        <div>
          <dt>Вид спорта</dt>
          <dd>{discipline.translation || discipline.original}</dd>
        </div>
        <div>
          <dt>Даты</dt>
          <dd>
            {new Date(program.startDate).toLocaleDateString("ru-RU")} —{" "}
            {new Date(program.endDate).toLocaleDateString("ru-RU")}
          </dd>
        </div>
        <div>
          <dt>Длительность</dt>
          <dd>{program.durationDays} дн.</dd>
        </div>
        <div>
          <dt>Уровень</dt>
          <dd>{participantLevel(program, levelLabel)}</dd>
        </div>
      </dl>
      <p className="mw-card-price">
        {program.priceFromRub != null
          ? `от ${program.priceFromRub.toLocaleString("ru-RU")} ${program.currency || "₽"}`
          : "Стоимость уточняется"}
      </p>
      <p className="mw-card-trust">
        {program.autoPublished
          ? "Информация из открытого источника. Условия требуют подтверждения."
          : program.organizer?.displayName || "Организатор уточняется"}
      </p>
      <p className="mw-card-trust">
        {count >= 3 && typeof program.organizer?.ratingAvg === "number"
          ? `${program.organizer.ratingAvg.toFixed(1)} ★ · ${count} ${reviewWord(count)} об организаторе`
          : count
            ? `${count} ${reviewWord(count)} об организаторе`
            : "Пока нет отзывов"}
      </p>
      <Link
        href={pdp}
        className="mw-btn mw-btn--primary"
        style={{ alignSelf: "flex-start", marginTop: "auto" }}
      >
        Подробнее о выезде
      </Link>
    </>
  );
}
