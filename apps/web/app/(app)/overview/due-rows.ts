// "Due before payday" rows for the real API, whose plan carries the runway but not the mock's ready-made rows.
// Every number comes from the engine's runway events; this only groups and labels them (hard rule 4).
import type { DueRowDto, PlanResponse } from "../../../lib/api/planning-types";
import type { Item } from "../../../lib/lists/hooks";

type Schedule = Item["schedule"];

/** "Monthly", "Every 2 weeks", "Every 6 months", "Yearly", "One time" (DESIGN_SPEC §5.1 due table). */
export function scheduleLabel(schedule: Schedule): string {
  if (schedule.until && schedule.until === schedule.dtstart) return "One time";
  switch (schedule.type) {
    case "monthly_day":
    case "monthly_last_day":
    case "monthly_last_weekday":
      return "Monthly";
    case "every_n_weeks":
      return schedule.n === 1 ? "Weekly" : `Every ${schedule.n} weeks`;
    case "every_n_months":
      return `Every ${schedule.n} months`;
    case "yearly":
      return "Yearly";
  }
}

function frequencyLabel(item: Item | undefined, kind: DueRowDto["kind"]): string {
  if (kind === "planned_expense") return "One time";
  if (!item) return "";
  const base = scheduleLabel(item.schedule);
  if (item.amountType === "estimated") return `${base} · varies`;
  if (item.kind === "subscription") return `${base} · subscription`;
  return base;
}

/**
 * Money going out between today and payday that hasn't been paid: bills and planned expenses on the runway,
 * in date order. Uses the mock's rows when the plan has them.
 */
export function dueRows(plan: PlanResponse, items: readonly Item[] = []): DueRowDto[] {
  if (plan.dueBeforePayday) return plan.dueBeforePayday;
  const byId = new Map(items.map((i) => [i.id, i]));
  const flagged = (code: "price_up" | "not_usual_month", id: string) =>
    plan.flags.some((f) => f.code === code && f.subjectId === id);
  const rows: DueRowDto[] = [];
  for (const day of plan.runway) {
    for (const e of day.events) {
      if (e.kind !== "bill" && e.kind !== "planned_expense") continue;
      if (e.status === "paid" || e.status === "skipped") continue;
      const flags = (["price_up", "not_usual_month"] as const).filter((code) => flagged(code, e.sourceId));
      rows.push({
        id: e.occurrenceId ?? `${e.sourceId}:${e.date}`,
        sourceId: e.sourceId,
        kind: e.kind,
        name: e.name,
        dueOn: e.dueOn,
        frequencyLabel: frequencyLabel(byId.get(e.sourceId), e.kind),
        owner: e.owner,
        amountCents: Math.abs(e.amountCents),
        isEstimate: e.isEstimate,
        estimateRangeCents: null,
        flags,
        priceUpCents: null,
      });
    }
  }
  return rows;
}
