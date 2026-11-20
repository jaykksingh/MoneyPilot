// Review queue item, DESIGN_SPEC §4 (Email & imports). Partners see extracted fields only,
// never the email itself (§6 rule 14).
import type { MoneyMode, PlainDateLike } from "@mp/format";
import { date, money } from "@mp/format";
import { Mail } from "lucide-react";
import { useId } from "react";
import type { ReactNode } from "react";
import { Button } from "../button/Button";
import { cx } from "../internal/cx";
import type { CalendarDate } from "../internal/types";
import { Icon } from "../internal/Icon";
import { StatusChip } from "../status-chip/StatusChip";
import styles from "./review-queue-item.module.css";

/** `info` "Updates existing", `ok` "New renewal", `attention` "Needs a decision". */
export interface ReviewTag {
  variant: "info" | "ok" | "attention";
  label: string;
}

export type ExtractedValue =
  { cents: number; mode?: Exclude<MoneyMode, "headline"> } | { date: CalendarDate } | { text: string };

export interface ExtractedField {
  /** 11 px uppercase key: "Amount", "Due", "Account". */
  label: string;
  value: ExtractedValue;
}

export interface ReviewQueueItemProps {
  title: string;
  tag: ReviewTag;
  sender: string;
  subject: string;
  receivedOn: CalendarDate;
  /** Household-local today, for the date format. */
  today: Pick<PlainDateLike, "year">;
  fields: readonly ExtractedField[];
  /** The effect sentence from the API: "Safe to spend goes from $1,007 to $998." */
  effect?: ReactNode;
  onConfirm: () => void;
  onEdit: () => void;
  onIgnore: () => void;
  /** Disable the actions while a decision is being saved. */
  busy?: boolean;
  /**
   * The action being saved for this item: its button shows the spinner and says so ("Confirming…"), the other
   * two wait. Other items stay usable, so several decisions can be in flight at once.
   */
  pending?: "confirm" | "edit" | "ignore" | null;
  headingLevel?: 3 | 4;
  className?: string;
}

function formatValue(value: ExtractedValue, today: Pick<PlainDateLike, "year">): string {
  if ("cents" in value) return money(value.cents, { mode: value.mode ?? "detail" });
  if ("date" in value) return date(value.date, { relativeTo: today, weekday: true });
  return value.text;
}

export function ReviewQueueItem({
  title,
  tag,
  sender,
  subject,
  receivedOn,
  today,
  fields,
  effect,
  onConfirm,
  onEdit,
  onIgnore,
  busy = false,
  pending = null,
  headingLevel = 3,
  className,
}: ReviewQueueItemProps) {
  const titleId = useId();
  const Heading = `h${headingLevel}` as const;
  return (
    <article aria-labelledby={titleId} className={cx(styles.item, className)}>
      <div className={styles.header}>
        <span className={styles.iconTile} aria-hidden="true">
          <Icon icon={Mail} size={18} />
        </span>
        <div className={styles.headText}>
          <div className={styles.titleRow}>
            <Heading id={titleId} className={styles.title}>
              {title}
            </Heading>
            <StatusChip variant={tag.variant}>{tag.label}</StatusChip>
          </div>
          <p className={styles.meta}>
            {sender} · “{subject}” · {date(receivedOn, { relativeTo: today })}
          </p>
        </div>
      </div>

      <dl className={styles.fields}>
        {fields.map((field) => (
          <div key={field.label} className={styles.field}>
            <dt className={styles.key}>{field.label}</dt>
            <dd className={styles.value}>{formatValue(field.value, today)}</dd>
          </div>
        ))}
      </dl>

      {effect && <p className={styles.effect}>{effect}</p>}

      <div className={styles.actions}>
        <Button
          variant="primary"
          busy={pending === "confirm"}
          disabled={busy || pending !== null}
          onClick={onConfirm}
          aria-describedby={titleId}
        >
          {pending === "confirm" ? "Confirming…" : "Confirm"}
        </Button>
        <Button
          variant="secondary"
          busy={pending === "edit"}
          disabled={busy || pending !== null}
          onClick={onEdit}
          aria-describedby={titleId}
        >
          {pending === "edit" ? "Saving…" : "Edit"}
        </Button>
        <Button
          variant="text"
          busy={pending === "ignore"}
          disabled={busy || pending !== null}
          onClick={onIgnore}
          aria-describedby={titleId}
        >
          {pending === "ignore" ? "Ignoring…" : "Ignore"}
        </Button>
      </div>
    </article>
  );
}
