// The household's format locale (ADR-022). @mp/format keeps a process-wide default; the app shell sets it
// from the household's currency before any screen renders money or dates. The summary can take seconds to
// arrive, so the locale is also remembered per household on this device and applied on the first render.
import { formatLocaleForCurrency, getFormatLocale, setFormatLocale, type FormatLocale } from "@mp/format";
import { useEffect } from "react";
import { useActiveHousehold, useSummary } from "../api/hooks";

const STORAGE_KEY = "mp.formatLocale";

function storedFor(householdId: string): FormatLocale | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (typeof value !== "object" || value === null) return null;
    const { householdId: id, locale } = value as { householdId?: unknown; locale?: unknown };
    return id === householdId && (locale === "US" || locale === "IN") ? locale : null;
  } catch {
    return null;
  }
}

/** Applies and remembers a household's locale, e.g. straight from the create-household response. */
export function rememberFormatLocale(householdId: string, currency: string | undefined): void {
  const locale = formatLocaleForCurrency(currency);
  setFormatLocale(locale);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ householdId, locale }));
  } catch {
    // Private mode or storage full: the summary still sets it on every load.
  }
}

/**
 * The active household's format locale. `ready` is false only on a device that has never seen this
 * household, until its summary arrives: screens wait rather than render dollars and then switch.
 */
export function useHouseholdFormatLocale(): { locale: FormatLocale; ready: boolean } {
  const household = useActiveHousehold();
  const summary = useSummary();
  const currency = summary.data?.household.currency;
  const known: FormatLocale | null =
    currency !== undefined ? formatLocaleForCurrency(currency) : household ? storedFor(household.id) : "US";
  if (known !== null && getFormatLocale() !== known) setFormatLocale(known);
  useEffect(() => {
    if (
      household &&
      currency !== undefined &&
      storedFor(household.id) !== formatLocaleForCurrency(currency)
    ) {
      rememberFormatLocale(household.id, currency);
    }
  }, [household, currency]);
  return { locale: known ?? getFormatLocale(), ready: known !== null || summary.isError };
}

/** "USD" or "INR", for "All amounts in …". */
export function currencyCode(): "USD" | "INR" {
  return getFormatLocale() === "IN" ? "INR" : "USD";
}
