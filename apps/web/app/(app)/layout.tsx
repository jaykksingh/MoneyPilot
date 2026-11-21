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

  if (status === "loading" || status === "signed_out" || elsewhere) return <ShellSkeleton />;
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

/** The app's frame while sign-in is checked: sidebar, page header and cards, so the first paint has the shape
 *  of what follows instead of a lone bar in the middle. */
function ShellSkeleton() {
  return (
    <Loading label="Loading MoneyPilot" className={styles.shell}>
      <div className={styles.shellSidebar} aria-hidden="true">
        <div className={styles.shellBrand}>
          <Skeleton shape="block" width="36px" height="36px" />
          <Skeleton width="55%" />
        </div>
        <Skeleton shape="block" height="56px" />
        {[70, 55, 62, 75, 58, 48, 66, 60].map((w, n) => (
          <Skeleton key={n} width={`${w}%`} />
        ))}
      </div>
      <div className={styles.shellMain} aria-hidden="true">
        <Skeleton width="12%" />
        <Skeleton width="34%" height="32px" shape="block" />
        <div className={styles.shellCards}>
          <Skeleton shape="block" height="160px" />
          <Skeleton shape="block" height="160px" />
          <Skeleton shape="block" height="160px" />
        </div>
        <Skeleton shape="block" height="320px" />
      </div>
    </Loading>
  );
}
