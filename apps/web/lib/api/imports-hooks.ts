"use client";

// Data hooks for Email & imports and the setup flow (WP-23).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { Temporal } from "@js-temporal/polyfill";
import { useAuth } from "../auth/AuthProvider";
import { useStepUp } from "../auth/StepUp";
import { MOCK_MODE } from "../config";
import { uploadUrl } from "../safe-urls";
import { ApiError, getJson, newIdempotencyKey, sendJson } from "./client";
import { useActiveHousehold, usePlan, useSummary } from "./hooks";
import type {
  AppliedChange,
  AutomationStats,
  ColumnMapping,
  CreatedImport,
  CsvImportSummary,
  EditFields,
  EmailConnection,
  ForwardingInfo,
  Import,
  ImportUpload,
  Page,
  ReviewDecision,
  ReviewItem,
  SenderRule,
  StartConnectionResponse,
} from "./imports-types";

function required<T>(value: T | null): T {
  if (value === null) throw new ApiError(500, "internal_error", "The server sent an empty answer.");
  return value;
}

/** Household-local today, for date formats: the plan's `asOf`, else the clock in the household's zone. */
export function useToday(): string {
  const plan = usePlan();
  const summary = useSummary();
  if (plan.data?.asOf) return plan.data.asOf;
  const zone = summary.data?.household.timezone ?? "America/New_York";
  return Temporal.Now.plainDateISO(zone).toString();
}

/** The household's IANA time zone, for turning UTC timestamps into local dates. */
export function useSummaryTimeZone(): string {
  return useSummary().data?.household.timezone ?? "America/New_York";
}

function useHousehold() {
  const { getToken } = useAuth();
  const household = useActiveHousehold();
  return { getToken, hid: household?.id ?? "", enabled: household !== null };
}

export function useReviewItems(): UseQueryResult<ReviewItem[]> {
  const { getToken, hid, enabled } = useHousehold();
  return useQuery({
    queryKey: ["review-items", hid],
    enabled,
    queryFn: async () =>
      (await getJson<Page<ReviewItem>>(`/v1/households/${hid}/review-items`, getToken, { state: "queued" }))
        .data,
  });
}

/** Names of the household's items by id, to title an `update` card from the item it matches (Q-171). */
export function useItemNames(): UseQueryResult<ReadonlyMap<string, string>> {
  const { getToken, hid, enabled } = useHousehold();
  return useQuery({
    queryKey: ["item-names", hid],
    enabled,
    queryFn: async () => {
      const page = await getJson<Page<{ id: string; name: string }>>(
        `/v1/households/${hid}/items`,
        getToken,
        {
          limit: "100",
        },
      );
      return new Map(page.data.map((item) => [item.id, item.name] as const));
    },
  });
}

export function useAppliedChanges(): UseQueryResult<AppliedChange[]> {
  const { getToken, hid, enabled } = useHousehold();
  return useQuery({
    queryKey: ["applied-changes", hid],
    enabled,
    queryFn: async () =>
      (await getJson<Page<AppliedChange>>(`/v1/households/${hid}/applied-changes`, getToken)).data,
  });
}

export interface DecideInput {
  id: string;
  kind: "confirm" | "edit" | "ignore";
  fields?: EditFields;
}

export function useDecide(): UseMutationResult<ReviewDecision, Error, DecideInput> {
  const { getToken, hid } = useHousehold();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, kind, fields }: DecideInput) =>
      required(
        await sendJson<ReviewDecision>(
          "POST",
          `/v1/households/${hid}/review-items/${id}/${kind}`,
          getToken,
          kind === "edit" ? { fields } : undefined,
        ),
      ),
    onSuccess: () => {
      // The queue, the nav badge and every number the engine derives may have changed.
      void queryClient.invalidateQueries({ queryKey: ["review-items", hid] });
      void queryClient.invalidateQueries({ queryKey: ["summary", hid] });
      void queryClient.invalidateQueries({ queryKey: ["plan", hid] });
    },
  });
}

export function useUndo(): UseMutationResult<AppliedChange, Error, string> {
  const { getToken, hid } = useHousehold();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      required(
        await sendJson<AppliedChange>("POST", `/v1/households/${hid}/applied-changes/${id}/undo`, getToken),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["applied-changes", hid] });
      void queryClient.invalidateQueries({ queryKey: ["plan", hid] });
    },
  });
}

export function useSenderRules(enabled: boolean): UseQueryResult<SenderRule[]> {
  const { getToken, hid, enabled: ready } = useHousehold();
  return useQuery({
    queryKey: ["sender-rules", hid],
    enabled: ready && enabled,
    queryFn: async () =>
      (await getJson<{ data: SenderRule[] }>(`/v1/households/${hid}/sender-rules`, getToken)).data,
  });
}

export function useSetSenderRule(): UseMutationResult<
  SenderRule,
  Error,
  { domain: string; rule: SenderRule["rule"] }
> {
  const { getToken, hid } = useHousehold();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      required(await sendJson<SenderRule>("POST", `/v1/households/${hid}/sender-rules`, getToken, body)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["sender-rules", hid] }),
  });
}

export function useConnections(): UseQueryResult<EmailConnection[]> {
  const { getToken, hid, enabled } = useHousehold();
  return useQuery({
    queryKey: ["email-connections", hid],
    enabled,
    queryFn: async () =>
      (await getJson<{ data: EmailConnection[] }>(`/v1/households/${hid}/email-connections`, getToken)).data,
  });
}

/** `POST /email-connections/:provider/start` → `{ authUrl }`; the caller sends the browser there. */
export function useStartConnection(): UseMutationResult<
  StartConnectionResponse,
  Error,
  { provider: "gmail" | "outlook"; returnTo: "/imports" | "/setup" }
> {
  const { getToken } = useHousehold();
  const withStepUp = useStepUp();
  return useMutation({
    mutationFn: async ({ provider, returnTo }) => {
      const key = newIdempotencyKey();
      return required(
        await withStepUp(() =>
          sendJson<StartConnectionResponse>(
            "POST",
            `/v1/email-connections/${provider}/start`,
            getToken,
            { returnTo },
            undefined,
            { idempotencyKey: key },
          ),
        ),
      );
    },
  });
}

export function useConnectionAction(): UseMutationResult<
  unknown,
  Error,
  { id: string; action: "pause" | "resume" | "disconnect" }
> {
  const { getToken, hid } = useHousehold();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }) =>
      action === "disconnect"
        ? sendJson("DELETE", `/v1/email-connections/${id}`, getToken)
        : sendJson("POST", `/v1/email-connections/${id}/${action}`, getToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["email-connections", hid] });
      void queryClient.invalidateQueries({ queryKey: ["summary", hid] });
    },
  });
}

export function useForwarding(): UseQueryResult<ForwardingInfo> {
  const { getToken, hid, enabled } = useHousehold();
  return useQuery({
    queryKey: ["forwarding", hid],
    enabled,
    queryFn: () => getJson<ForwardingInfo>(`/v1/households/${hid}/forwarding-address`, getToken),
  });
}

export function useRotateForwarding(): UseMutationResult<ForwardingInfo, Error, void> {
  const { getToken, hid } = useHousehold();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      required(
        await sendJson<ForwardingInfo>("POST", `/v1/households/${hid}/forwarding-address/rotate`, getToken),
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["forwarding", hid] }),
  });
}

export function useAutomationStats(): UseQueryResult<AutomationStats> {
  const { getToken, hid, enabled } = useHousehold();
  return useQuery({
    queryKey: ["automation-stats", hid],
    enabled,
    queryFn: () => getJson<AutomationStats>(`/v1/households/${hid}/automation-stats`, getToken),
  });
}

export function useRemindMember(): UseMutationResult<
  unknown,
  Error,
  { userId: string; about: "connect_email" | "two_step" }
> {
  const { getToken, hid } = useHousehold();
  return useMutation({
    mutationFn: ({ userId, about }) =>
      sendJson("POST", `/v1/households/${hid}/members/${userId}/reminders`, getToken, { about }),
  });
}

/**
 * The import the person just made. There is no "latest import" endpoint (Q-174), so the Bank CSV row shows the
 * one kept in client state by {@link useCsvUpload}; after a reload it reads "No file imported yet".
 */
export function useLatestCsv(): UseQueryResult<CsvImportSummary | null> {
  const { hid } = useHousehold();
  return useQuery<CsvImportSummary | null>({
    queryKey: ["latest-csv", hid],
    queryFn: () => null,
    enabled: false,
    // The sample household's golden import (canvas: "checking-oct.csv · Oct 26"); a real session starts empty.
    initialData: MOCK_MODE
      ? { id: "mock-import", filename: "checking-oct.csv", importedAt: "2026-10-26T20:15:00Z" }
      : null,
  });
}

/**
 * How often to ask whether the worker has finished with a file, and for how long. Until the API can enqueue
 * (Q-105) the worker's sweep picks a file up within a minute, so the wait is by time, not by request count.
 * Tests shorten the interval.
 */
export const csvPoll = { intervalMs: 1500, timeoutMs: 180_000 };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const uploadFailed = (status: number) => new ApiError(status, "upload_failed", "The file did not upload.");

/**
 * Sends the file the way the API said to (a form POST with its fields first, or a PUT of the bytes) and reports
 * how much has gone. XMLHttpRequest, because fetch has no upload progress. The URL is the storage host, never
 * our API: no bearer token and no cookies go with it.
 */
function sendFile(upload: ImportUpload, file: File, onPercent: (percent: number) => void): Promise<void> {
  const url = uploadUrl(upload.url);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(upload.method === "POST" ? "POST" : "PUT", url);
    xhr.withCredentials = false;
    const headers = new Headers(upload.headers);
    if (upload.method !== "POST" && !headers.has("content-type")) headers.set("content-type", "text/csv");
    headers.forEach((value, name) => xhr.setRequestHeader(name, value));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0)
        onPercent(Math.min(99, Math.floor((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      // A redirect to another host is a failure, as `redirect: "error"` was for fetch.
      const landed = xhr.responseURL ? new URL(xhr.responseURL).origin : new URL(url).origin;
      if (xhr.status >= 200 && xhr.status < 300 && landed === new URL(url).origin) {
        onPercent(100);
        resolve();
      } else reject(uploadFailed(xhr.status));
    };
    xhr.onerror = () => reject(uploadFailed(0));
    xhr.onabort = () => reject(uploadFailed(0));
    xhr.ontimeout = () => reject(uploadFailed(0));
    if (upload.method === "POST") {
      const form = new FormData();
      for (const [name, value] of Object.entries(upload.fields)) form.append(name, value);
      form.append("file", file);
      xhr.send(form);
    } else xhr.send(file);
  });
}

/** The worker parses the file after `process`: ask until it has either finished, failed or needs a mapping. */
async function settle(start: Import, hid: string, getToken: () => Promise<string | null>): Promise<Import> {
  let current = start;
  const deadline = Date.now() + csvPoll.timeoutMs;
  while ((current.status === "uploaded" || current.status === "processing") && Date.now() < deadline) {
    await sleep(csvPoll.intervalMs);
    current = await getJson<Import>(`/v1/households/${hid}/imports/${start.id}`, getToken);
  }
  return current;
}

/** Where an upload is: declaring and sending the file, then the worker reading it. */
export type CsvStep = "upload" | "read";

export interface CsvProgress {
  step: CsvStep;
  /** How much of the file has been sent, 0 to 100. Null while the worker reads it (no measure for that). */
  percent: number | null;
}

/**
 * One file's way through the steps. A retry with the same attempt carries on from the step that failed: a file
 * that reached storage is never sent again, and one being read is only asked about again.
 */
export interface CsvAttempt {
  readonly file: File;
  created: CreatedImport | null;
  uploaded: boolean;
  queued: Import | null;
  /** The step the last run stopped in, for the retry copy. */
  failedStep: CsvStep | null;
}

export const newCsvAttempt = (file: File): CsvAttempt => ({
  file,
  created: null,
  uploaded: false,
  queued: null,
  failedStep: null,
});

/** The presigned URL lasts 15 minutes (BACKEND_PLAN §7.7); one about to run out is replaced, not reused. */
const URL_MARGIN_MS = 30_000;
const urlStillValid = (upload: ImportUpload) => Date.parse(upload.expiresAt) - URL_MARGIN_MS > Date.now();

/**
 * CSV upload flow (BACKEND_PLAN §8.2, WP-16): create the import and get the presigned request, send the file,
 * ask the server to process it, then wait for the result. Detections arrive as review items with `source = csv`.
 * Each finished step is kept on the attempt, so running the same attempt again resumes where it stopped.
 */
export function useCsvUpload(): UseMutationResult<
  Import,
  Error,
  { attempt: CsvAttempt; onProgress: (progress: CsvProgress) => void }
> {
  const { getToken, hid } = useHousehold();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ attempt, onProgress }) => {
      const { file } = attempt;
      let step: CsvStep = "upload";
      try {
        if (!attempt.uploaded) {
          onProgress({ step, percent: 0 });
          // An import whose URL ran out is left for the worker's orphan sweep; a new one gets a fresh URL.
          if (!attempt.created || !urlStillValid(attempt.created.upload)) {
            attempt.created = required(
              await sendJson<CreatedImport>("POST", `/v1/households/${hid}/imports`, getToken, {
                filename: file.name,
                sizeBytes: file.size,
                contentType: "text/csv",
              }),
            );
          }
          await sendFile(attempt.created.upload, file, (percent) => onProgress({ step: "upload", percent }));
          attempt.uploaded = true;
        }
        step = "read";
        onProgress({ step, percent: null });
        const created = required(attempt.created);
        if (!attempt.queued) {
          try {
            attempt.queued = required(
              await sendJson<Import>(
                "POST",
                `/v1/households/${hid}/imports/${created.import.id}/process`,
                getToken,
              ),
            );
          } catch (error) {
            // 400: storage has no matching object (it never arrived, or it was not the declared size and was
            // removed). Only sending it again can fix that, so the retry starts from the upload.
            if (error instanceof ApiError && error.status === 400) {
              attempt.uploaded = false;
              step = "upload";
            }
            throw error;
          }
        }
        const settled = await settle(attempt.queued, hid, getToken);
        attempt.queued = settled;
        attempt.failedStep = null;
        queryClient.setQueryData<CsvImportSummary>(["latest-csv", hid], {
          id: settled.id,
          filename: settled.filename,
          importedAt: settled.createdAt,
        });
        return settled;
      } catch (error) {
        attempt.failedStep = step;
        throw error;
      }
    },
    onSuccess: () => void invalidateAfterImport(queryClient, hid),
  });
}

function invalidateAfterImport(queryClient: ReturnType<typeof useQueryClient>, hid: string) {
  void queryClient.invalidateQueries({ queryKey: ["review-items", hid] });
  void queryClient.invalidateQueries({ queryKey: ["summary", hid] });
  void queryClient.invalidateQueries({ queryKey: ["automation-stats", hid] });
}

/** `PUT …/imports/:id/mapping` for a file whose columns we could not guess, then wait for the result. */
export function useSaveMapping(): UseMutationResult<
  Import,
  Error,
  { importId: string; mapping: ColumnMapping }
> {
  const { getToken, hid } = useHousehold();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ importId, mapping }) => {
      const queued = required(
        await sendJson<Import>("PUT", `/v1/households/${hid}/imports/${importId}/mapping`, getToken, mapping),
      );
      return settle(queued, hid, getToken);
    },
    onSuccess: () => void invalidateAfterImport(queryClient, hid),
  });
}

/** Confirms the chosen CSV detections one by one through the normal review endpoint (Q-142, Q-174). */
export function useConfirmReviewItems(): UseMutationResult<number, Error, string[]> {
  const { getToken, hid } = useHousehold();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await sendJson("POST", `/v1/households/${hid}/review-items/${id}/confirm`, getToken);
      }
      return ids.length;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["review-items", hid] });
      void queryClient.invalidateQueries({ queryKey: ["summary", hid] });
      void queryClient.invalidateQueries({ queryKey: ["plan", hid] });
      void queryClient.invalidateQueries({ queryKey: ["applied-changes", hid] });
    },
  });
}
