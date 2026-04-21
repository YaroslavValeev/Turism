import { describe, expect, it } from "vitest";
import {
  getNextBookingStatuses,
  getNextCommissionReconciliationStatuses,
  getNextIntakeProcessingStatuses,
  getNextProgramPublishStatuses,
  isValidBookingTransition,
  isValidCommissionReconciliationBillingTransition,
  isValidCommissionReconciliationTransition,
  isValidIntakeProcessingTransition,
  isValidProgramPublishTransition,
} from "@mywave/shared-policy";

describe("Stage 4 transition policy", () => {
  it("program: draft → internal_review разрешён", () => {
    expect(isValidProgramPublishTransition("draft", "internal_review")).toBe(true);
  });
  it("program: draft → published запрещён (gate отдельно)", () => {
    expect(isValidProgramPublishTransition("draft", "published")).toBe(false);
  });
  it("program: published → draft запрещён", () => {
    expect(isValidProgramPublishTransition("published", "draft")).toBe(false);
  });
  it("program: draft→published без контекста запрещён", () => {
    expect(isValidProgramPublishTransition("draft", "published")).toBe(false);
  });
  it("program: draft→published с ingestionAutoPublish разрешён (gate снаружи)", () => {
    expect(isValidProgramPublishTransition("draft", "published", { ingestionAutoPublish: true })).toBe(true);
  });
  it("program: next из published — paused и archived", () => {
    expect(getNextProgramPublishStatuses("published").sort()).toEqual(["archived", "paused"].sort());
  });

  it("intake: new → in_review разрешён", () => {
    expect(isValidIntakeProcessingTransition("new", "in_review")).toBe(true);
  });
  it("intake: new → draft_created запрещён (только draft-program)", () => {
    expect(isValidIntakeProcessingTransition("new", "draft_created")).toBe(false);
  });
  it("intake: draft_created → in_review разрешён", () => {
    expect(isValidIntakeProcessingTransition("draft_created", "in_review")).toBe(true);
  });
  it("intake: next для dismissed — только new", () => {
    expect(getNextIntakeProcessingStatuses("dismissed")).toEqual(["new"]);
  });

  it("booking: new → reviewed разрешён", () => {
    expect(isValidBookingTransition("new", "reviewed")).toBe(true);
  });
  it("booking: new → completed запрещён", () => {
    expect(isValidBookingTransition("new", "completed")).toBe(false);
  });
  it("booking: new → sent_to_organizer разрешён (доставка)", () => {
    expect(isValidBookingTransition("new", "sent_to_organizer")).toBe(true);
  });
  it("booking: next из new содержит sent_to_organizer", () => {
    expect(getNextBookingStatuses("new")).toContain("sent_to_organizer");
  });

  it("commission manual: paid → draft запрещён (settle → pre)", () => {
    expect(isValidCommissionReconciliationTransition("paid", "draft")).toBe(false);
  });
  it("commission manual: invoiced → accrued разрешён (settlement-коррекция)", () => {
    expect(isValidCommissionReconciliationTransition("invoiced", "accrued")).toBe(true);
  });
  it("commission manual: disputed → draft разрешён (exception → pre)", () => {
    expect(isValidCommissionReconciliationTransition("disputed", "draft")).toBe(true);
  });
  it("commission billing: recalculate → accrued|reversed|disputed", () => {
    expect(isValidCommissionReconciliationBillingTransition("invoiced", "accrued", "recalculate")).toBe(true);
    expect(isValidCommissionReconciliationBillingTransition("paid", "reversed", "recalculate")).toBe(true);
  });
  it("commission billing: statement → invoiced", () => {
    expect(isValidCommissionReconciliationBillingTransition("approved", "invoiced", "statement_invoiced")).toBe(true);
  });
  it("commission next: из paid нет draft в списке", () => {
    expect(getNextCommissionReconciliationStatuses("paid")).not.toContain("draft");
  });
});
