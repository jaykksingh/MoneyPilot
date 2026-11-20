"use client";

// The CSV import flow as one hook: choose a file, upload and process it (WP-16 contract), map its columns when
// we could not guess them, then pick which found items to keep. Detections are review items with `source = csv`
// in the normal queue (Q-142, Q-174); "confirm" confirms the chosen ones through the review endpoint.
// Used by the Email & imports dialog and by the setup flow.
import { IMPORT_MAX_BYTES } from "@mp/contracts";
import { useMemo, useRef, useState } from "react";
import {
  newCsvAttempt,
  useConfirmReviewItems,
  useCsvUpload,
  useItemNames,
  useReviewItems,
  useSaveMapping,
  useToday,
} from "../../../lib/api/imports-hooks";
import type { CsvAttempt, CsvProgress, CsvStep } from "../../../lib/api/imports-hooks";
import type { ColumnMapping, Import } from "../../../lib/api/imports-types";
import { problemMessage } from "../../../lib/api/messages";
import { csvRow } from "./review-map";
import type { CsvRow } from "./review-map";

export const MAX_CSV_BYTES = IMPORT_MAX_BYTES;

const ERROR_TEXT: Record<NonNullable<Import["error"]>, string> = {
  too_large: "That file is over 10 MB. Export a shorter date range and try again.",
  empty: "That file is empty. Export your transactions again and try again.",
  no_rows: "We couldn’t find any transactions in that file.",
  too_many_rows: "That file has too many rows. Export a shorter date range and try again.",
  too_many_columns: "That file has more columns than a bank export should. Check it’s the right file.",
  bad_encoding: "We couldn’t read that file’s text. Export it again as a plain CSV.",
  parse_failed: "We couldn’t read that file. Check it’s a bank CSV and try again.",
  missing_file: "The file didn’t arrive. Nothing was changed. Try again.",
  bad_mapping: "Those columns didn’t fit the file. Choose them again.",
};

export type CsvStage = "pick" | "working" | "mapping" | "done";

export type { CsvProgress, CsvStep };

export interface CsvFlow {
  stage: CsvStage;
  /** The latest result from the server: the columns to map, or the counts when done. */
  imported: Import | null;
  /** The file being sent or read, or the one that last failed. */
  file: { name: string; size: number } | null;
  /** Where the current upload is; the last known step after a failure. */
  progress: CsvProgress | null;
  /** The step a failure stopped in. Null when nothing failed or the file itself was refused. */
  failedStep: CsvStep | null;
  /** True when "Try again" can carry on with the same file. */
  canRetry: boolean;
  rows: readonly CsvRow[];
  checked: ReadonlySet<string>;
  selectedCount: number;
  busy: boolean;
  error: string | null;
  /** How many items the last confirm saved. */
  done: number | null;
  chooseFile: (file: File | null) => void;
  /** Runs the failed file again from the step it stopped in. */
  retry: () => void;
  saveMapping: (mapping: ColumnMapping) => void;
  toggle: (id: string) => void;
  confirm: () => Promise<boolean>;
  reset: () => void;
}

export function useCsvFlow(): CsvFlow {
  const upload = useCsvUpload();
  const mapColumns = useSaveMapping();
  const confirmItems = useConfirmReviewItems();
  const queue = useReviewItems();
  const names = useItemNames();
  const today = useToday();
  const attempt = useRef<CsvAttempt | null>(null);
  const [imported, setImported] = useState<Import | null>(null);
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [progress, setProgress] = useState<CsvProgress | null>(null);
  const [failedStep, setFailedStep] = useState<CsvStep | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const rows = useMemo(
    () =>
      (queue.data ?? [])
        .filter((item) => item.source === "csv")
        .map((item) =>
          csvRow(item, today, item.matchItemId ? (names.data?.get(item.matchItemId) ?? null) : null),
        ),
    [queue.data, names.data, today],
  );
  const checked = useMemo(
    () => new Set(rows.filter((r) => !unchecked.has(r.id)).map((r) => r.id)),
    [rows, unchecked],
  );

  const accept = (result: Import) => {
    setFailedStep(null);
    if (result.status === "failed") {
      setImported(null);
      setError(result.error ? ERROR_TEXT[result.error] : ERROR_TEXT.parse_failed);
      // The worker found no file: sending the same one again can work, as a new import. Any other failure is
      // about the file's content, so the same file would fail the same way.
      const current = attempt.current;
      if (result.error === "missing_file" && current) {
        attempt.current = newCsvAttempt(current.file);
        setProgress({ step: "upload", percent: 0 });
        setFailedStep("upload");
        setCanRetry(true);
      } else {
        attempt.current = null;
        setCanRetry(false);
      }
      return;
    }
    if (result.status === "processing" || result.status === "uploaded") {
      setImported(null);
      setError("We’re still reading that file. Check again in a minute.");
      setFailedStep("read");
      setCanRetry(true);
      return;
    }
    attempt.current = null;
    setCanRetry(false);
    setProgress(null);
    setImported(result);
  };
  const failed = (e: unknown) => {
    const step = attempt.current?.failedStep ?? "upload";
    setFailedStep(step);
    setCanRetry(attempt.current !== null);
    setError(
      problemMessage(
        e,
        step === "read"
          ? "Your file is uploaded, but we couldn’t finish reading it. Nothing was changed. Try again."
          : "The upload didn’t finish. Nothing was changed. Try again.",
      ),
    );
  };

  const run = (current: CsvAttempt) => {
    setError(null);
    setFailedStep(null);
    setCanRetry(false);
    upload.mutate({ attempt: current, onProgress: setProgress }, { onSuccess: accept, onError: failed });
  };

  const chooseFile = (chosen: File | null) => {
    setError(null);
    setFailedStep(null);
    setCanRetry(false);
    if (!chosen) return;
    if (!/\.csv$/i.test(chosen.name)) {
      setError("Choose a .csv file exported from your bank.");
      return;
    }
    if (chosen.size > MAX_CSV_BYTES) {
      setError("That file is over 10 MB. Export a shorter date range and try again.");
      return;
    }
    attempt.current = newCsvAttempt(chosen);
    setImported(null);
    setFile({ name: chosen.name, size: chosen.size });
    setProgress({ step: "upload", percent: 0 });
    run(attempt.current);
  };

  const retry = () => {
    if (attempt.current && !upload.isPending) run(attempt.current);
  };

  const saveMapping = (mapping: ColumnMapping) => {
    if (!imported) return;
    setError(null);
    setProgress({ step: "read", percent: null });
    mapColumns.mutate(
      { importId: imported.id, mapping },
      {
        onSuccess: accept,
        onError: (e) =>
          setError(problemMessage(e, "We couldn’t save those columns. Nothing was changed. Try again.")),
      },
    );
  };

  const toggle = (id: string) =>
    setUnchecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirm = async (): Promise<boolean> => {
    setError(null);
    try {
      setDone(await confirmItems.mutateAsync([...checked]));
      return true;
    } catch (e) {
      setError(problemMessage(e, "We couldn’t save those items. Nothing was changed. Try again."));
      return false;
    }
  };

  const busy = upload.isPending || mapColumns.isPending || confirmItems.isPending;
  const stage: CsvStage =
    upload.isPending || mapColumns.isPending
      ? "working"
      : imported?.status === "needs_mapping"
        ? "mapping"
        : imported
          ? "done"
          : "pick";

  return {
    stage,
    imported,
    file,
    progress,
    failedStep,
    canRetry,
    rows,
    checked,
    selectedCount: checked.size,
    busy,
    error,
    done,
    chooseFile,
    retry,
    saveMapping,
    toggle,
    confirm,
    reset: () => {
      attempt.current = null;
      setImported(null);
      setFile(null);
      setProgress(null);
      setFailedStep(null);
      setCanRetry(false);
      setUnchecked(new Set());
      setError(null);
      setDone(null);
    },
  };
}
