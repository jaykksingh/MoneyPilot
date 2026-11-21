// The "Updated from …" footer caption (DESIGN_SPEC §5.3 stale data). The mock plan carries a data source; the real
// API doesn't, so the latest CSV import this session knows of stands in, and otherwise only the currency is said
// (the household's: USD or INR, ADR-022).
import type { CsvImportSummary } from "../api/imports-types";
import type { PlanResponse } from "../api/planning-types";
import { shortDateWithYear } from "../format/dates";
import { localDate } from "../format/input";
import { currencyCode } from "../format/locale";

export function sourceCaption(
  plan: Pick<PlanResponse, "dataSource">,
  latestCsv: CsvImportSummary | null | undefined,
  timeZone: string,
): string {
  const s = plan.dataSource;
  if (s) {
    return `${s.isSample ? "Sample data · " : ""}Updated from ${s.label} ${shortDateWithYear(s.updatedOn)} · All amounts in ${currencyCode()}`;
  }
  if (latestCsv) {
    return `Updated from CSV import ${shortDateWithYear(localDate(latestCsv.importedAt, timeZone))} · All amounts in ${currencyCode()}`;
  }
  return `All amounts in ${currencyCode()}`;
}

/** "Sample data · " on the mock household, nothing on real data. */
export const samplePrefix = (plan: Pick<PlanResponse, "dataSource"> | undefined): string =>
  plan?.dataSource?.isSample ? "Sample data · " : "";
