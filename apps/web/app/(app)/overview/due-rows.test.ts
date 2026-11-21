// The due rows the real API's plan gives (from its runway) match the fixture's hand-made rows (DESIGN_SPEC §5.1).
import { describe, expect, it } from "vitest";
import { buildPlan } from "../../../mocks/model";
import { dueRows, scheduleLabel } from "./due-rows";

describe("dueRows", () => {
  it("derives the fixture's due-before-payday rows from the runway", () => {
    const plan = buildPlan("base");
    const expected = plan.dueBeforePayday ?? [];
    const derived = dueRows({ ...plan, dueBeforePayday: undefined });
    const pick = (r: (typeof expected)[number]) => [r.name, r.dueOn, r.amountCents, r.kind, r.owner];
    expect(derived.map(pick)).toEqual(expected.map(pick));
  });

  it("labels schedules the way the due table does", () => {
    expect(scheduleLabel({ type: "monthly_day", day: 5, dtstart: "2026-11-05" })).toBe("Monthly");
    expect(scheduleLabel({ type: "every_n_weeks", n: 2, dtstart: "2026-11-06" })).toBe("Every 2 weeks");
    expect(scheduleLabel({ type: "every_n_months", n: 6, dtstart: "2026-11-04" })).toBe("Every 6 months");
    expect(scheduleLabel({ type: "yearly", dtstart: "2026-12-01", until: "2026-12-01" })).toBe("One time");
  });
});
