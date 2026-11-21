// India (ADR-022): ₹ with Indian digit grouping, day-first dates. US output is unchanged (the golden tests).
import { Temporal } from "@js-temporal/polyfill";
import { afterEach, describe, expect, it } from "vitest";
import { date, estimateRange, money, setFormatLocale, shortfall } from "./index";

const MINUS = "−";
const d = (iso: string) => Temporal.PlainDate.from(iso);
const today = d("2026-11-21");

afterEach(() => setFormatLocale("US"));

describe("money in India", () => {
  it("uses ₹ and groups lakhs and crores", () => {
    setFormatLocale("IN");
    expect(money(12345600)).toBe("₹1,23,456.00");
    expect(money(1234567890)).toBe("₹1,23,45,678.90");
    expect(money(99900)).toBe("₹999.00");
    expect(money(-215000)).toBe(`${MINUS}₹2,150.00`);
    expect(money(290000, { mode: "signed" })).toBe("+₹2,900.00");
    expect(money(1234500, { mode: "headline" })).toBe("₹12,345");
    expect(money(12345600, { mode: "chip" })).toBe("+₹1,23,456");
    expect(money(-12345600, { mode: "chart" })).toBe(`${MINUS}1,23,456`);
    expect(money(14200, { mode: "estimate" })).toBe("~₹142.00");
    expect(shortfall(-7929900)).toBe("₹79,299 short");
    expect(estimateRange(300000, { label: true })).toBe("Estimate ±₹3,000");
  });

  it("takes the currency per call, whatever the default", () => {
    expect(money(12345600, { mode: "detail", locale: "IN" })).toBe("₹1,23,456.00");
    setFormatLocale("IN");
    expect(money(12345600, { mode: "detail", locale: "US" })).toBe("$123,456.00");
  });
});

describe("dates in India", () => {
  it("puts the day first", () => {
    setFormatLocale("IN");
    expect(date(d("2026-11-04"), { relativeTo: today })).toBe("4 Nov");
    expect(date(d("2026-11-04"), { relativeTo: today, weekday: true })).toBe("Wed, 4 Nov");
    expect(date(d("2027-01-09"), { relativeTo: today })).toBe("9 Jan 2027");
    expect(date(d("2026-11-04"), { relativeTo: today, month: "long" })).toBe("4 November");
  });

  it("keeps the US order by default", () => {
    expect(date(d("2026-11-04"), { relativeTo: today, weekday: true })).toBe("Wed, Nov 4");
    expect(date(d("2027-01-09"), { relativeTo: today })).toBe("Jan 9, 2027");
  });
});
