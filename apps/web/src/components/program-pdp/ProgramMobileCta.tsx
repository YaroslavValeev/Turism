"use client";

import { useEffect, useState } from "react";
import { formatProgramPrice, type ProgramPriceFields } from "../../lib/priceFormat";
import { IconArrowRight } from "./icons";

/**
 * Нижняя панель на мобильных. Прячется, пока форма `#request` в зоне видимости,
 * чтобы не перекрывать submit, consent и сообщения валидации.
 */
export function ProgramMobileCta({
  price,
  datesLabel,
  ended,
}: {
  price: ProgramPriceFields;
  datesLabel: string | null;
  ended: boolean;
}) {
  const [formVisible, setFormVisible] = useState(false);

  useEffect(() => {
    const form = document.getElementById("request");
    if (!form || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setFormVisible(entry.isIntersecting), {
      rootMargin: "0px 0px -40px 0px",
    });
    observer.observe(form);
    return () => observer.disconnect();
  }, []);

  const priceLabel = formatProgramPrice(price) ?? "Стоимость уточняется";

  return (
    <div
      className={["mw-pdp-mobile-cta", formVisible ? "mw-pdp-mobile-cta--hidden" : null].filter(Boolean).join(" ")}
      role="region"
      aria-label="Быстрая заявка"
      aria-hidden={formVisible || undefined}
    >
      <div className="mw-pdp-mobile-cta__inner">
        <div className="mw-pdp-mobile-cta__info">
          <span className="mw-pdp-mobile-cta__price">{priceLabel}</span>
          {datesLabel && <span className="mw-pdp-mobile-cta__dates">{datesLabel}</span>}
        </div>
        <a href="#request" className="mw-btn mw-btn--primary mw-pdp-mobile-cta__btn" tabIndex={formVisible ? -1 : undefined}>
          <span>{ended ? "Выезд завершён" : "Уточнить место"}</span>
          {!ended && <IconArrowRight />}
        </a>
      </div>
    </div>
  );
}
