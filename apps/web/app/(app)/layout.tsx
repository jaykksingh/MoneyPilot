"use client";

import { ErrorBanner, Loading, Skeleton } from "@mp/ui";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { AppShell } from "../../lib/components/AppShell";
import { FirstNameForm } from "../../lib/components/FirstNameForm";
import { useAuth } from "../../lib/auth/AuthProvider";
import styles from "./app.module.css";

const SETUP = "/setup";

/** Everything under (app) needs a signed-in, bootstrapped user. Without a household, that's setup first. */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { status, me, refresh } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const needsHousehold = status === "signed_in" && me !== null && me.memberships.length === 0;
  const elsewhere = needsHousehold && pathname !== SETUP;

  useEffect(() => {
    if (status === "signed_out") router.replace("/sign-in");
    else if (elsewhere) router.replace(SETUP);
  }, [status, elsewhere, router]);

  if (status === "loading" || status === "signed_out" || elsewhere) {
    return (
      <div className={styles.center}>
        <Loading label="Loading MoneyPilot">
          <Skeleton width="60%" />
          <Skeleton shape="block" />
        </Loading>
      </div>
    );
  }
  if (status === "needs_name") {
    return (
      <div className={styles.center}>
        <FirstNameForm />
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className={styles.center}>
        <ErrorBanner title="We couldn’t finish signing you in." onRetry={() => void refresh()}>
          Your plan is safe. Check your connection and try again.
        </ErrorBanner>
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}
