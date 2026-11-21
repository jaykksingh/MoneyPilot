"use client";

import { Button, Card, ErrorBanner, IconButton, Loading, Skeleton } from "@mp/ui";
import { Bell, Plus, Search, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { usePlan, useSummary } from "../../../lib/api/hooks";
import { useLatestCsv, useSummaryTimeZone } from "../../../lib/api/imports-hooks";
import { sourceCaption } from "../../../lib/components/data-source";
import { useBillsItems, useGoals } from "../../../lib/lists/hooks";
import type { Item } from "../../../lib/lists/hooks";
import { PlanNotReady, notReadyReason } from "../../../lib/components/PlanNotReady";
import type { PlanResponse } from "../../../lib/api/planning-types";
import { PageHeader } from "../../../lib/components/PageHeader";
import { overlineDate, longWeekdayShortDate } from "../../../lib/format/dates";
import { useOwners } from "../../../lib/owners";
import type { Owners } from "../../../lib/owners";
import { CoverTheGap } from "./Cover";
import { Decisions } from "./Decisions";
import type { DrawerFocus } from "./Decisions";
import { DueTable } from "./DueTable";
import { BillsTile, Hero, IncomeTile } from "./Kpis";
import { MathDrawer } from "./MathDrawer";
import { Runway } from "./Runway";
import { dueRows } from "./due-rows";
import { Goals, Tasks } from "./Side";
import styles from "./overview.module.css";

function headerTitle(days: number): string {
  if (days === 0) return "Payday is today. Here’s the plan.";
  return `${days} ${days === 1 ? "day" : "days"} to payday. Here’s the plan.`;
}

/** The page's own shape while it loads: hero + two tiles, the runway with its bars, due rows, side cards. */
function Skeletons() {
  return (
    <Loading label="Loading your plan" className={styles.skeletonPage}>
      <div className={styles.kpiRow}>
        <div className={styles.hero}>
          <Card>
            <div className={styles.skeletonStack}>
              <Skeleton width="40%" />
              <Skeleton width="55%" height="44px" shape="block" />
              <Skeleton width="80%" />
            </div>
          </Card>
        </div>
        {[0, 1].map((n) => (
          <Card key={n}>
            <div className={styles.skeletonStack}>
              <Skeleton width="60%" />
              <Skeleton width="45%" height="32px" shape="block" />
              <Skeleton width="85%" />
            </div>
          </Card>
        ))}
      </div>
      <div className={styles.body}>
        <div className={styles.main}>
          <Card>
            <div className={styles.skeletonStack}>
              <Skeleton width="35%" />
              <div className={styles.skeletonBars} aria-hidden="true">
                {BAR_HEIGHTS.map((h, n) => (
                  <Skeleton key={n} shape="block" height={`${h}%`} />
                ))}
              </div>
            </div>
          </Card>
          <Card>
            <div className={styles.skeletonStack}>
              <Skeleton width="30%" />
              {[0, 1, 2, 3, 4].map((n) => (
                <div key={n} className={styles.skeletonRow}>
                  <Skeleton width="45%" />
                  <Skeleton width="15%" />
                </div>
              ))}
            </div>
          </Card>
        </div>
        <div className={styles.side}>
          {[3, 2, 3].map((rows, n) => (
            <Card key={n}>
              <div className={styles.skeletonStack}>
                <Skeleton width="50%" />
                {Array.from({ length: rows }, (_, r) => (
                  <Skeleton key={r} shape="block" height="44px" />
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </Loading>
  );
}

/** Runway placeholder bars: a gentle dip, so it reads as a balance chart. */
const BAR_HEIGHTS = [78, 72, 66, 70, 52, 44, 48, 36, 58, 64, 90];

/** The plan as the Overview reads it: the mock's extras when present, otherwise goals and due rows from real data. */
function withRealData(
  plan: PlanResponse,
  goals: PlanResponse["goals"],
  items: readonly Item[] | undefined,
): PlanResponse {
  return {
    ...plan,
    goals: plan.goals ?? goals ?? [],
    dueBeforePayday: dueRows(plan, items),
  };
}

export function OverviewScreen() {
  const plan = usePlan();
  const summary = useSummary();
  const owners = useOwners();
  // The real plan has no goals or due rows of its own (they're mock-only fields): read them from their sources.
  const goals = useGoals();
  const items = useBillsItems();
  const [drawer, setDrawer] = useState<DrawerFocus | null>(null);

  const failed = plan.isError || summary.isError;
  const notReady = notReadyReason(plan.error);
  const retry = () => {
    void plan.refetch();
    void summary.refetch();
  };
  if (!plan.data || !owners) {
    // Nothing cached yet: say that nothing is shown.
    return (
      <>
        <PageHeader overline="Overview" title="Here’s the plan." />
        {notReady ? (
          <PlanNotReady reason={notReady} />
        ) : failed ? (
          <ErrorBanner title="We couldn’t load your plan." onRetry={retry}>
            Nothing was changed. No numbers are shown until it loads.
          </ErrorBanner>
        ) : (
          <Skeletons />
        )}
      </>
    );
  }
  return (
    <Loaded
      plan={withRealData(plan.data, goals.data?.data, items.data?.items)}
      owners={owners}
      householdName={summary.data?.household.name ?? ""}
      drawer={drawer}
      setDrawer={setDrawer}
      refreshFailed={failed ? retry : null}
    />
  );
}

function Loaded({
  plan,
  owners,
  householdName,
  drawer,
  setDrawer,
  refreshFailed,
}: {
  plan: PlanResponse;
  owners: Owners;
  householdName: string;
  drawer: DrawerFocus | null;
  setDrawer: (focus: DrawerFocus | null) => void;
  /** Set when a refresh failed while the last loaded plan is still on screen. */
  refreshFailed: (() => void) | null;
}) {
  const router = useRouter();
  const openMath = () => setDrawer({ kind: "math" });
  const caption = sourceCaption(plan, useLatestCsv().data, useSummaryTimeZone());
  return (
    <>
      {refreshFailed && (
        <ErrorBanner title="We couldn’t refresh your plan." onRetry={refreshFailed}>
          The numbers below are the last ones we loaded.
        </ErrorBanner>
      )}
      <PageHeader
        overline={overlineDate(plan.asOf)}
        title={headerTitle(plan.window.daysToPayday)}
        subtitle={`Income, bills and goals for the ${householdName} through ${longWeekdayShortDate(plan.window.to)}.`}
        actions={
          <>
            <label className={styles.search}>
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                className={styles.searchInput}
                placeholder="Search bills, goals, #tags"
                aria-label="Search bills and goals"
              />
            </label>
            <IconButton icon={Bell} label="Notifications" />
            <Button variant="secondary" inHeader icon={Upload} onClick={() => router.push("/imports")}>
              Import CSV
            </Button>
            <Button icon={Plus} onClick={() => router.push("/bills")}>
              Add bill or income
            </Button>
          </>
        }
      />

      <div className={styles.kpiRow}>
        <div className={styles.hero}>
          <Hero plan={plan} onMath={openMath} />
        </div>
        <BillsTile plan={plan} owners={owners} />
        <IncomeTile plan={plan} owners={owners} />
      </div>

      <div className={styles.body}>
        <div className={styles.main}>
          <Runway plan={plan} />
          {plan.state === "shortfall" && <CoverTheGap plan={plan} owners={owners} />}
          <DueTable plan={plan} owners={owners} />
        </div>
        <div className={styles.side}>
          <Decisions plan={plan} owners={owners} onOpen={setDrawer} />
          <Goals goals={plan.goals ?? []} asOf={plan.asOf} />
          <Tasks plan={plan} owners={owners} />
        </div>
      </div>

      <p className={styles.footer}>{caption}</p>

      {drawer && <MathDrawer plan={plan} focus={drawer} onClose={() => setDrawer(null)} />}
    </>
  );
}
