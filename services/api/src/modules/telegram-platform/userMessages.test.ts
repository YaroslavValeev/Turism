import { describe, expect, it } from "vitest";
import { consentLabel, formatConsentList, leadSubmitErrorMessage } from "./userMessages";

describe("Telegram user messages", () => {
  it("uses Russian labels instead of internal consent keys", () => {
    expect(consentLabel("pd_processing")).toBe("обработку персональных данных");
    expect(formatConsentList(["contact_transfer", "not_organizer"])).toBe(
      "передачу контактов организатору, роль MyWave Tour как посредника",
    );
  });

  it("does not expose internal lead submission errors", () => {
    expect(leadSubmitErrorMessage("incomplete_contact")).toBe(
      "Не заполнены контактные данные. Начните заявку заново.",
    );
    expect(leadSubmitErrorMessage("unexpected_internal_code")).toBe(
      "Не удалось отправить заявку. Попробуйте ещё раз.",
    );
  });
});
