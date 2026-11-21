// Household format locale (ADR-022). US: `$`, 3-digit groups, `Nov 4`. IN: `₹`, Indian
// groups (1,23,45,678), `4 Nov`. The default is process-wide: the web app sets it once from the
// active household; server code passes `locale` per call instead.
export type FormatLocale = "US" | "IN";

let current: FormatLocale = "US";

export function setFormatLocale(locale: FormatLocale): void {
  current = locale;
}

export function getFormatLocale(): FormatLocale {
  return current;
}

/** The format locale for an ISO 4217 household currency. Unknown codes fall back to US. */
export function formatLocaleForCurrency(currency: string | null | undefined): FormatLocale {
  return currency === "INR" ? "IN" : "US";
}

export const CURRENCY_SYMBOL: Record<FormatLocale, string> = { US: "$", IN: "₹" };
