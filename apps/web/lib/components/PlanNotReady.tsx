"use client";

import { Button, Card, TextField } from "@mp/ui";
import { Plus, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError } from "../api/client";
import { Temporal } from "@js-temporal/polyfill";
import { useSummaryTimeZone } from "../api/imports-hooks";
import { problemMessage } from "../api/messages";
import { useAddBalance } from "../api/settings-hooks";
import { parseDollars } from "../format/input";
import styles from "./plan-not-ready.module.css";

export type NotReadyReason = "no_balance" | "no_primary_income";

/** The `reason` of a 409 `plan_not_ready`, or null for any other error. */
export function notReadyReason(error: unknown): NotReadyReason | null {
  if (!(error instanceof ApiError) || error.code !== "plan_not_ready") return null;
  return error.reason === "no_balance" ? "no_balance" : "no_primary_income";
}

/** Today's checking balance, the one thing a plan needs that a CSV import doesn't give us. */
function BalanceForm() {
  // Not useToday: it reads the plan query, and a new observer on a failed plan refetches it, clearing the error
  // this card is shown for (a remount loop). The household's own calendar day is what a balance is "as of".
  const today = Temporal.Now.plainDateISO(useSummaryTimeZone()).toString();
  const add = useAddBalance();
  const [amount, setAmount] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const cents = parseDollars(amount.replace(/^-/, ""));
    if (cents === null) {
      setProblem("Enter the balance in dollars, like $2,340.15.");
      return;
    }
    setProblem(null);
    add.mutate({ amountCents: amount.trim().startsWith("-") ? -cents : cents, asOf: today });
  };
  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <TextField
        label="Checking balance today"
        hint="What your bank app shows now. You can update it anytime."
        money
        value={amount}
        error={problem ?? (add.isError ? problemMessage(add.error, "We couldn’t save it. Try again.") : null)}
        onChange={(e) => setAmount(e.target.value)}
      />
      <div>
        <Button type="submit" busy={add.isPending} disabled={add.isPending}>
          {add.isPending ? "Building your plan…" : "Build my plan"}
        </Button>
      </div>
    </form>
  );
}

/**
 * What the Overview and Calendar show before the first plan (409 `plan_not_ready`): a balance to enter, or
 * income to add. Imported bills stay in Bills & recurring; nothing here moves money.
 */
export function PlanNotReady({ reason }: { reason: NotReadyReason }) {
  const router = useRouter();
  if (reason === "no_balance") {
    return (
      <Card
        title="One more thing: your balance"
        subtitle="Your bills and paychecks are in. Add today’s checking balance and we’ll project every day to payday."
      >
        <BalanceForm />
      </Card>
    );
  }
  return (
    <Card
      title="Add a paycheck to start your plan"
      subtitle="Your plan runs from today to your next payday. Import a bank CSV or add your income, and we’ll use your largest regular paycheck."
    >
      <div className={styles.actions}>
        <Button icon={Upload} onClick={() => router.push("/imports")}>
          Import a bank CSV
        </Button>
        <Button variant="secondary" icon={Plus} onClick={() => router.push("/bills")}>
          Add bill or income
        </Button>
      </div>
    </Card>
  );
}
