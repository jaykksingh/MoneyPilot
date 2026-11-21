import { describe, expect, it } from "vitest";
import { reminderBody } from "./plan";

describe("reminderBody", () => {
  it("writes an Indian household's reminder in rupees, day first (ADR-022)", () => {
    const input = { dueOn: "2026-11-06", today: "2026-11-03", amountCents: 12345600, estimated: false };
    expect(reminderBody({ ...input, locale: "IN" })).toBe(
      "Due Fri, 6 Nov · ₹1,23,456.00. Mark it as paid in MoneyPilot once you have paid it.",
    );
    expect(reminderBody(input)).toBe(
      "Due Fri, Nov 6 · $123,456.00. Mark it as paid in MoneyPilot once you have paid it.",
    );
  });
});
