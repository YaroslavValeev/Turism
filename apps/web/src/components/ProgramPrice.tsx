import {
  formatProgramPrice,
  formatProgramPriceRub,
  formatProgramPriceRubTitle,
  type ProgramPriceFields,
} from "../lib/priceFormat";

type Props = {
  program: ProgramPriceFields;
  className?: string;
  emptyLabel?: string;
};

/** Цена в валюте организатора и под ней тонкой строкой — примерная сумма в рублях по курсу ЦБ. */
export function ProgramPrice({ program, className, emptyLabel = "Стоимость уточняется" }: Props) {
  const main = formatProgramPrice(program);
  const rub = formatProgramPriceRub(program);
  return (
    <span className={["mw-price-fx", className].filter(Boolean).join(" ")}>
      <span className="mw-price-fx__main">{main ?? emptyLabel}</span>
      {rub ? (
        <span className="mw-price-fx__rub" title={formatProgramPriceRubTitle(program)}>
          {rub}
        </span>
      ) : null}
    </span>
  );
}
