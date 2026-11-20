"use client";

import { Amount, Button, ErrorBanner, SelectField, StatusBanner, VisuallyHidden } from "@mp/ui";
import { Check, CloudUpload, FileSpreadsheet, RotateCcw, TriangleAlert, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import type { ColumnMapping, Import } from "../../../lib/api/imports-types";
import type { CsvFlow, CsvStep } from "./csv-flow";
import styles from "./csv-panel.module.css";

const NONE = "";

type Sign = ColumnMapping["amountSign"];

const SIGN_TEXT: Record<Sign, string> = {
  outflow_negative: "Spending shows as a negative number, like −45.00",
  outflow_positive: "Spending shows as a positive number, like 45.00",
};

/**
 * WP-16 `needs_mapping`: the first file with a new header row needs a person to say which column is which, once.
 * When we matched every column ourselves this is a summary to confirm; otherwise plain questions, one per column.
 */
function ColumnCheck({
  imported,
  busy,
  onSave,
}: {
  imported: Import;
  busy: boolean;
  onSave: (m: ColumnMapping) => void;
}) {
  const columns = imported.columns ?? [];
  const suggested = imported.suggestedMapping;
  const [date, setDate] = useState(suggested?.date ?? NONE);
  const [description, setDescription] = useState(suggested?.description ?? NONE);
  const [kind, setKind] = useState<"amount" | "split">(
    suggested?.debit || suggested?.credit ? "split" : "amount",
  );
  const [amount, setAmount] = useState(suggested?.amount ?? NONE);
  const [debit, setDebit] = useState(suggested?.debit ?? NONE);
  const [credit, setCredit] = useState(suggested?.credit ?? NONE);
  const [sign, setSign] = useState<Sign>(suggested?.amountSign ?? "outflow_negative");
  const complete = Boolean(
    suggested?.date && suggested.description && (suggested.amount || suggested.debit || suggested.credit),
  );
  const [editing, setEditing] = useState(!complete);
  const [problem, setProblem] = useState<string | null>(null);
  const options = (blank: string) => [
    { value: NONE, label: blank },
    ...columns.map((c) => ({ value: c, label: c })),
  ];

  const save = () => {
    if (date === NONE || description === NONE) {
      setProblem("Choose the date column and the description column.");
      return;
    }
    if (kind === "amount" ? amount === NONE : debit === NONE && credit === NONE) {
      setProblem(
        kind === "amount" ? "Choose the amount column." : "Choose the money out or money in column.",
      );
      return;
    }
    setProblem(null);
    onSave(
      kind === "amount"
        ? { date, description, amount, amountSign: sign }
        : {
            date,
            description,
            ...(debit !== NONE ? { debit } : {}),
            ...(credit !== NONE ? { credit } : {}),
            amountSign: sign,
          },
    );
  };

  return (
    <section className={styles.mapping} aria-labelledby="csv-columns-title">
      <div className={styles.mappingIntro}>
        <h3 id="csv-columns-title" className={styles.foundTitle}>
          Check your columns
        </h3>
        <p className={styles.hint}>
          {`This is the first file we’ve seen laid out like this${
            imported.rowCount ? ` (${imported.rowCount} rows)` : ""
          }. Tell us which column is which, once. We’ll remember it for your next file.`}
        </p>
      </div>
      {!editing ? (
        <>
          <dl className={styles.matchList}>
            <div className={styles.matchRow}>
              <dt>Date</dt>
              <dd>{`“${date}” column`}</dd>
            </div>
            <div className={styles.matchRow}>
              <dt>What it was for</dt>
              <dd>{`“${description}” column`}</dd>
            </div>
            {kind === "amount" ? (
              <div className={styles.matchRow}>
                <dt>Amount</dt>
                <dd>
                  {`“${amount}” column`}
                  <span className={styles.matchNote}>{SIGN_TEXT[sign]}</span>
                </dd>
              </div>
            ) : (
              <>
                {debit !== NONE && (
                  <div className={styles.matchRow}>
                    <dt>Money out</dt>
                    <dd>{`“${debit}” column`}</dd>
                  </div>
                )}
                {credit !== NONE && (
                  <div className={styles.matchRow}>
                    <dt>Money in</dt>
                    <dd>{`“${credit}” column`}</dd>
                  </div>
                )}
              </>
            )}
          </dl>
          <div className={styles.retryRow}>
            <Button icon={Check} disabled={busy} onClick={save}>
              Looks right, continue
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setEditing(true)}>
              Change
            </Button>
          </div>
        </>
      ) : (
        <>
          <SelectField
            label="Which column has the date?"
            hint="The day the money moved."
            value={date}
            options={options("Choose a column")}
            onChange={(e) => setDate(e.target.value)}
          />
          <SelectField
            label="Which column says what it was for?"
            hint="Usually the merchant, payee or memo."
            value={description}
            options={options("Choose a column")}
            onChange={(e) => setDescription(e.target.value)}
          />
          <SelectField
            label="How are amounts shown?"
            value={kind}
            options={[
              { value: "amount", label: "In one column" },
              { value: "split", label: "In two columns: money out and money in" },
            ]}
            onChange={(e) => setKind(e.target.value as "amount" | "split")}
          />
          {kind === "amount" ? (
            <>
              <SelectField
                label="Which column has the amount?"
                value={amount}
                options={options("Choose a column")}
                onChange={(e) => setAmount(e.target.value)}
              />
              <SelectField
                label="How does spending show?"
                hint="Look at a purchase in your bank statement."
                value={sign}
                options={[
                  { value: "outflow_negative", label: "As a negative number (−45.00)" },
                  { value: "outflow_positive", label: "As a positive number (45.00)" },
                ]}
                onChange={(e) => setSign(e.target.value as Sign)}
              />
            </>
          ) : (
            <>
              <SelectField
                label="Which column has money going out?"
                value={debit}
                options={options("None")}
                onChange={(e) => setDebit(e.target.value)}
              />
              <SelectField
                label="Which column has money coming in?"
                value={credit}
                options={options("None")}
                onChange={(e) => setCredit(e.target.value)}
              />
            </>
          )}
          {problem && <ErrorBanner title="Check the columns.">{problem}</ErrorBanner>}
          <div>
            <Button disabled={busy} onClick={save}>
              Continue
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

const KB = 1024;

/** A file size as people read it: "820 bytes", "24 KB", "3.4 MB". */
function fileSize(bytes: number): string {
  if (bytes < KB) return `${bytes} bytes`;
  if (bytes < KB * KB) return `${Math.round(bytes / KB)} KB`;
  return `${(bytes / (KB * KB)).toFixed(1)} MB`;
}

/** Where the person is, in the words of the step tracker. */
type Phase =
  | { kind: "pick" }
  | { kind: "uploading"; percent: number }
  | { kind: "reading" }
  | { kind: "mapping" }
  | { kind: "done" }
  | { kind: "failed"; step: CsvStep; percent: number };

function phaseOf(flow: CsvFlow): Phase {
  const percent = flow.progress?.percent ?? 0;
  if (flow.failedStep) return { kind: "failed", step: flow.failedStep, percent };
  // The worker refused the file itself (it couldn't be read): the reading step stopped.
  if (flow.error && flow.file && flow.stage === "pick") return { kind: "failed", step: "read", percent: 100 };
  if (flow.stage === "mapping") return { kind: "mapping" };
  if (flow.stage === "done") return { kind: "done" };
  if (flow.stage === "working") {
    return flow.progress?.step === "upload" ? { kind: "uploading", percent } : { kind: "reading" };
  }
  return { kind: "pick" };
}

type TrackState = "pending" | "current" | "done" | "attention";

const TRACK = ["Choose file", "Upload", "Read", "Results"] as const;

function trackStates(phase: Phase): readonly TrackState[] {
  switch (phase.kind) {
    case "pick":
      return ["current", "pending", "pending", "pending"];
    case "uploading":
      return ["done", "current", "pending", "pending"];
    case "reading":
      return ["done", "done", "current", "pending"];
    case "mapping":
      return ["done", "done", "attention", "pending"];
    case "done":
      return ["done", "done", "done", "done"];
    case "failed":
      return phase.step === "upload"
        ? ["done", "attention", "pending", "pending"]
        : ["done", "done", "attention", "pending"];
  }
}

const TRACK_TEXT: Record<TrackState, string> = {
  pending: "not started",
  current: "in progress",
  done: "done",
  attention: "needs you",
};

/** Choose file, Upload, Read, Results: always on show, so it's clear what has happened and what's next. */
function StepTracker({ phase }: { phase: Phase }) {
  const states = trackStates(phase);
  return (
    <ol className={styles.tracker} aria-label="Upload progress">
      {TRACK.map((label, i) => {
        const state = states[i] ?? "pending";
        return (
          <li
            key={label}
            className={`${styles.trackStep} ${styles[`track_${state}`] ?? ""}`}
            aria-current={state === "current" || state === "attention" ? "step" : undefined}
          >
            <span className={styles.trackMarker} aria-hidden="true">
              {state === "done" ? (
                <Check size={14} strokeWidth={3} />
              ) : state === "attention" ? (
                <TriangleAlert size={13} strokeWidth={2.5} />
              ) : (
                i + 1
              )}
            </span>
            <span className={styles.trackLabel}>{label}</span>
            <VisuallyHidden>{`, ${TRACK_TEXT[state]}`}</VisuallyHidden>
          </li>
        );
      })}
    </ol>
  );
}

function foundText(imported: Import): string {
  const n = imported.detectedCount ?? 0;
  if (n === 0) return "No repeating bills or paychecks found";
  return `${n} repeating ${n === 1 ? "item" : "items"} found`;
}

/** Seconds since `active` turned true, ticking once a second; 0 while it's false. */
function useElapsed(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const started = Date.now();
    const tick = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(tick);
  }, [active]);
  return seconds;
}

/** 0:07, 1:23. */
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** What the wait is, honestly: the worker's sweep picks a new file up within a minute (Q-105), then reads it. */
function readingText(seconds: number): string {
  if (seconds < 10) return "Reading your transactions and looking for bills and paychecks that repeat.";
  if (seconds < 75) {
    return "Still working. New files are picked up within a minute, then read in a few seconds. Keep this window open.";
  }
  return "This is taking longer than usual. We’ll keep checking for up to 3 minutes.";
}

/** The chosen file, from the moment it's picked to the result: name, size, what's happening, a progress bar. */
function FileCard({ flow, phase, waited }: { flow: CsvFlow; phase: Phase; waited: number }) {
  const file = flow.file;
  if (!file || phase.kind === "pick") return null;
  const status = (() => {
    switch (phase.kind) {
      case "uploading":
        return `Uploading… ${phase.percent}%`;
      case "reading":
        return `Uploaded · Reading your file… ${clock(waited)}`;
      case "mapping":
        return "Uploaded · Read · Check the columns below";
      case "done":
        return flow.imported ? `Done · ${foundText(flow.imported)}` : "Done";
      case "failed":
        return phase.step === "upload" ? `Stopped at ${phase.percent}%` : "Uploaded · Reading stopped";
    }
  })();
  const failed = phase.kind === "failed";
  const percent =
    phase.kind === "uploading" ? phase.percent : failed && phase.step === "upload" ? phase.percent : 100;
  const reading = phase.kind === "reading";
  return (
    <div className={`${styles.card} ${failed ? styles.cardFailed : ""}`}>
      <div className={styles.cardHead}>
        <span className={styles.fileIcon} aria-hidden="true">
          <FileSpreadsheet size={20} />
        </span>
        <span className={styles.fileText}>
          <span className={styles.fileName}>{file.name}</span>
          <span className={styles.fileMeta}>{`${fileSize(file.size)} · ${status}`}</span>
        </span>
        {phase.kind === "done" && (
          <span className={styles.doneMark} aria-hidden="true">
            <Check size={16} strokeWidth={3} />
          </span>
        )}
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-label={reading ? "Reading your file" : "Uploading your file"}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(reading ? {} : { "aria-valuenow": percent })}
      >
        {reading ? (
          <span className={`${styles.bar} ${styles.barReading}`} />
        ) : (
          <span
            className={`${styles.bar} ${failed ? styles.barFailed : ""}`}
            style={{ width: `${percent}%` }}
          />
        )}
      </div>
      {/* Step changes only; the percentage is on the progress bar, so screen readers aren't flooded. */}
      <VisuallyHidden>
        <span role="status">
          {phase.kind === "uploading"
            ? "Uploading your file"
            : reading
              ? "Reading your file"
              : phase.kind === "mapping"
                ? "Check the columns"
                : ""}
        </span>
      </VisuallyHidden>
    </div>
  );
}

/** Drop a file on it, or use the button. Both lead to the same hidden file input. */
function DropZone({
  disabled,
  onFile,
  onBrowse,
}: {
  disabled: boolean;
  onFile: (f: File | null) => void;
  onBrowse: () => void;
}) {
  const [over, setOver] = useState(false);
  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes("Files");
  return (
    <div
      className={`${styles.drop} ${over ? styles.dropOver : ""}`}
      onDragEnter={(event) => {
        if (disabled || !hasFiles(event)) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragOver={(event) => {
        if (disabled || !hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (!disabled) onFile(event.dataTransfer.files[0] ?? null);
      }}
    >
      <span className={styles.dropIcon} aria-hidden="true">
        <CloudUpload size={26} />
      </span>
      <p className={styles.dropTitle}>{over ? "Drop it here" : "Drag your bank CSV here"}</p>
      <p className={styles.dropMeta}>CSV only, up to 10 MB</p>
      <Button variant="secondary" icon={Upload} disabled={disabled} onClick={onBrowse}>
        Choose a CSV file
      </Button>
    </div>
  );
}

/** The upload dialog's entrance animation, for the ConfirmDialog that hosts this panel. */
export const csvDialogClass = styles.dialog;

/**
 * The CSV step (DESIGN_SPEC §5.2): pick a file, match its columns if we need to, then check the repeating bills
 * and paychecks we found. `showFound` is false in the Email & imports dialog, where the found items go straight
 * to the review queue on the page behind it.
 */
export function CsvPanel({ flow, showFound = true }: { flow: CsvFlow; showFound?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const phase = phaseOf(flow);
  const waited = useElapsed(phase.kind === "reading");
  const imported = flow.imported;
  const busyWithFile = phase.kind === "uploading" || phase.kind === "reading" || phase.kind === "mapping";
  const browse = () => input.current?.click();

  return (
    <div className={styles.pick}>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className={styles.fileInput}
        aria-label="Bank CSV file"
        tabIndex={-1}
        onChange={(event) => {
          flow.chooseFile(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
      <StepTracker phase={phase} />
      <FileCard flow={flow} phase={phase} waited={waited} />

      {phase.kind === "pick" && (
        <>
          <DropZone disabled={flow.busy} onFile={flow.chooseFile} onBrowse={browse} />
          <p className={styles.hint}>
            Export a month or more from your bank. We find repeating bills and paychecks. You confirm each
            one, and the file is not kept after we read it.
          </p>
        </>
      )}

      {(phase.kind === "uploading" || phase.kind === "reading") && (
        <p className={styles.hint}>
          {phase.kind === "uploading"
            ? "Sending your file. Keep this window open until it’s uploaded."
            : readingText(waited)}
        </p>
      )}

      {phase.kind === "mapping" && imported && (
        <ColumnCheck imported={imported} busy={flow.busy} onSave={flow.saveMapping} />
      )}

      {flow.error && (
        <ErrorBanner title="That didn’t work.">
          {flow.error}
          {flow.failedStep === "read" && flow.canRetry && " We won’t send the file again."}
        </ErrorBanner>
      )}

      {phase.kind === "failed" && (
        <div className={styles.retryRow}>
          {flow.canRetry && (
            <Button icon={RotateCcw} disabled={flow.busy} onClick={flow.retry}>
              {flow.failedStep === "read" ? "Check again" : "Try again"}
            </Button>
          )}
          <Button variant="secondary" icon={Upload} disabled={flow.busy} onClick={browse}>
            Choose another file
          </Button>
        </div>
      )}

      {phase.kind === "done" && imported && (
        <>
          <StatusBanner>
            {imported.detectedCount
              ? `Read ${imported.filename}. Found ${imported.detectedCount} repeating ${imported.detectedCount === 1 ? "item" : "items"}${
                  imported.queuedCount !== null && imported.queuedCount < imported.detectedCount
                    ? `, ${imported.queuedCount} new to you`
                    : ""
                }.`
              : `Read ${imported.filename}. We didn’t find any repeating bills or paychecks in it.`}
          </StatusBanner>
          <div className={styles.lone}>
            <Button variant="secondary" icon={Upload} disabled={flow.busy} onClick={browse}>
              Upload another file
            </Button>
          </div>
        </>
      )}

      {showFound && !busyWithFile && flow.rows.length > 0 && (
        <section className={styles.found} aria-label="Found in your bank CSV">
          <div className={styles.foundHead}>
            <h3 className={styles.foundTitle}>
              {imported ? `Found in ${imported.filename}` : "Found in your bank CSV"}
            </h3>
            <span
              className={styles.foundCount}
            >{`${flow.rows.length} ${flow.rows.length === 1 ? "item" : "items"}`}</span>
          </div>
          {/* Scrolls inside a fixed height, so a long file doesn't stretch the page. */}
          <ul className={`${styles.list} ${styles.listScroll}`} tabIndex={0} aria-label="Items found">
            {flow.rows.map((row) => (
              <li key={row.id}>
                <label className={`${styles.row} ${row.needsFrequency ? styles.rowBlocked : ""}`}>
                  <input
                    type="checkbox"
                    className={styles.check}
                    checked={flow.checked.has(row.id)}
                    disabled={row.needsFrequency}
                    onChange={() => flow.toggle(row.id)}
                  />
                  <span className={styles.rowText}>
                    <span className={styles.rowName}>{row.name}</span>
                    <span className={styles.rowMeta}>{row.label}</span>
                    {row.needsFrequency && (
                      <span className={styles.rowNote}>
                        Paid every week or two, which we can’t add yet. It stays in Review what we found.
                      </span>
                    )}
                  </span>
                  {row.amountCents !== null && (
                    <Amount cents={row.amountCents} mode={row.income ? "signed" : "detail"} strong />
                  )}
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
