import { describe, it, expect } from "vitest";
import { extractEmailFromGuestContact } from "./ugcService";

describe("extractEmailFromGuestContact", () => {
  it("вытаскивает email из свободной формы guestContact", () => {
    expect(extractEmailFromGuestContact("Иван, +7 999 000 00 00, ivan@example.com"))
      .toBe("ivan@example.com");
  });

  it("нормализует email в нижний регистр", () => {
    expect(extractEmailFromGuestContact("Name <John.Doe@MAIL.Com>")).toBe("john.doe@mail.com");
  });

  it("возвращает null, если email не найден", () => {
    expect(extractEmailFromGuestContact("Иван, +7 999 000 00 00, @ivan_tg")).toBeNull();
  });

  it("возвращает null для пустого ввода", () => {
    expect(extractEmailFromGuestContact(null)).toBeNull();
    expect(extractEmailFromGuestContact("")).toBeNull();
  });
});
