import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  ghCheckAvailable,
  ghListPrs,
  type GhAvailability,
  type PrSummary,
} from "../lib/tauri";
import { projectRoot } from "./fileStore";
import type {
  ReviewResult,
  Finding,
  PolishPlan,
  PolishMode,
  PolishApplyReport,
} from "../types/review";

export type PrStateFilter = "open" | "closed" | "merged" | "all";
export type PrSort = "updated-desc" | "created-desc" | "age-desc" | "commits-desc" | "ci-failing-first";

const [prs, setPrs] = createStore<PrSummary[]>([]);
const [loading, setLoading] = createSignal(false);
const [error, setError] = createSignal<string | null>(null);
const [lastFetchedAt, setLastFetchedAt] = createSignal<number | null>(null);
const [gh, setGh] = createSignal<GhAvailability | null>(null);
const [search, setSearch] = createSignal("");
const [stateFilter, setStateFilter] = createSignal<PrStateFilter>("open");
const [authorFilter, setAuthorFilter] = createSignal<string>("");
const [hideDrafts, setHideDrafts] = createSignal(false);
const [onlyFailingCi, setOnlyFailingCi] = createSignal(false);
const [sort, setSort] = createSignal<PrSort>("updated-desc");

// Review engine state
const [reviewResults, setReviewResults] = createStore<Record<number, ReviewResult>>({});
const [runningReviews, setRunningReviews] = createSignal<Set<number>>(new Set());
const [selectedPrNumber, setSelectedPrNumber] = createSignal<number | null>(null);
const [autoReviewEnabled, setAutoReviewEnabled] = createSignal(true);
const [reviewError, setReviewError] = createSignal<Record<number, string>>({});

// Event listener registration (deduped)
let reviewListenersInstalled = false;
const reviewUnlisteners: UnlistenFn[] = [];

async function ensureReviewListeners() {
  if (reviewListenersInstalled) return;
  reviewListenersInstalled = true;

  reviewUnlisteners.push(
    await listen<{ pr_number: number }>("pr_review_started", (event) => {
      markRunning(event.payload.pr_number, true);
    }),
  );
  reviewUnlisteners.push(
    await listen<{ pr_number: number; finding: Finding }>("pr_review_finding", (event) => {
      const { pr_number, finding } = event.payload;
      setReviewResults(
        produce((state) => {
          const current = state[pr_number];
          if (current) {
            const existing = current.findings.findIndex((f) => f.id === finding.id);
            if (existing >= 0) {
              current.findings[existing] = finding;
            } else {
              current.findings.push(finding);
            }
          } else {
            state[pr_number] = {
              pr_number,
              generated_at: new Date().toISOString(),
              findings: [finding],
            };
          }
        }),
      );
    }),
  );
  reviewUnlisteners.push(
    await listen<ReviewResult>("pr_review_done", (event) => {
      const r = event.payload;
      setReviewResults(
        produce((state) => {
          state[r.pr_number] = r;
        }),
      );
      markRunning(r.pr_number, false);
    }),
  );
  reviewUnlisteners.push(
    await listen<{ pr_number: number; error: string }>("pr_review_error", (event) => {
      setReviewError((prev) => ({ ...prev, [event.payload.pr_number]: event.payload.error }));
      markRunning(event.payload.pr_number, false);
    }),
  );
}

function markRunning(prNumber: number, running: boolean) {
  setRunningReviews((prev) => {
    const next = new Set(prev);
    if (running) next.add(prNumber);
    else next.delete(prNumber);
    return next;
  });
}

interface RunReviewOptions {
  model?: string;
  apiKey?: string | null;
  provider?: string;
  force?: boolean;
}

async function runReview(prNumber: number, opts: RunReviewOptions = {}): Promise<void> {
  await ensureReviewListeners();
  const workspaceDir = getWorkspaceDir();
  if (!workspaceDir) throw new Error("No workspace open");
  if (!opts.force && reviewResults[prNumber]) return;
  if (runningReviews().has(prNumber)) return;
  markRunning(prNumber, true);
  try {
    await invoke("pr_review_run", {
      workspaceDir,
      prNumber,
      model: opts.model ?? null,
      apiKey: opts.apiKey ?? null,
      provider: opts.provider ?? null,
    });
  } catch (e) {
    setReviewError((prev) => ({ ...prev, [prNumber]: e instanceof Error ? e.message : String(e) }));
    markRunning(prNumber, false);
  }
}

// Concurrency-limited auto-review queue
const MAX_CONCURRENT_REVIEWS = 2;
const reviewQueue: number[] = [];
let inFlight = 0;

function enqueueReview(prNumber: number) {
  if (reviewResults[prNumber]) return;
  if (runningReviews().has(prNumber)) return;
  if (reviewQueue.includes(prNumber)) return;
  reviewQueue.push(prNumber);
  pumpQueue();
}

function pumpQueue() {
  while (inFlight < MAX_CONCURRENT_REVIEWS && reviewQueue.length > 0) {
    const next = reviewQueue.shift()!;
    if (reviewResults[next] || runningReviews().has(next)) continue;
    inFlight++;
    runReview(next)
      .catch(() => {})
      .finally(() => {
        inFlight = Math.max(0, inFlight - 1);
        pumpQueue();
      });
  }
}

function queueReviewsForPrs(prNumbers: number[]) {
  if (!autoReviewEnabled()) return;
  for (const n of prNumbers) enqueueReview(n);
}

async function runAllShown(prNumbers: number[]): Promise<void> {
  for (const n of prNumbers) enqueueReview(n);
}

async function cancelReview(prNumber: number): Promise<void> {
  try {
    await invoke("pr_review_stop", { prNumber });
  } finally {
    markRunning(prNumber, false);
  }
}

async function loadCachedReviews(workspaceDir: string): Promise<void> {
  try {
    const cached = (await invoke<ReviewResult[]>("pr_review_list", { workspaceDir })) ?? [];
    setReviewResults(
      produce((state) => {
        for (const r of cached) state[r.pr_number] = r;
      }),
    );
  } catch {
    // Missing command or no cache — ignore
  }
}

async function fetchPrDiff(workspaceDir: string, prNumber: number): Promise<string> {
  return invoke<string>("pr_fetch_diff", { workspaceDir, prNumber });
}

async function postReview(
  workspaceDir: string,
  prNumber: number,
  action: "comment" | "approve" | "request_changes",
  body: string,
): Promise<void> {
  return invoke("pr_review_post", { workspaceDir, prNumber, action, body });
}

async function polishPreview(
  workspaceDir: string,
  prNumber: number,
  mode: PolishMode,
): Promise<PolishPlan> {
  return invoke<PolishPlan>("pr_polish_preview", { workspaceDir, prNumber, mode });
}

async function polishApply(
  workspaceDir: string,
  prNumber: number,
  planId: string,
): Promise<PolishApplyReport> {
  return invoke<PolishApplyReport>("pr_polish_apply", { workspaceDir, prNumber, planId });
}

function getWorkspaceDir(): string | null {
  return projectRoot() ?? null;
}

function dismissFinding(prNumber: number, findingId: string) {
  setReviewResults(
    produce((state) => {
      const r = state[prNumber];
      if (!r) return;
      const f = r.findings.find((x) => x.id === findingId);
      if (f) f.dismissed = !f.dismissed;
    }),
  );
}

function promoteFindingRequired(prNumber: number, findingId: string) {
  setReviewResults(
    produce((state) => {
      const r = state[prNumber];
      if (!r) return;
      const f = r.findings.find((x) => x.id === findingId);
      if (f) f.required = !f.required;
    }),
  );
}

async function applyFindingPatch(prNumber: number, findingId: string) {
  const workspaceDir = getWorkspaceDir();
  if (!workspaceDir) throw new Error("No workspace open");
  await invoke("pr_review_apply_finding", { workspaceDir, prNumber, findingId });
}

async function checkGhAvailability(): Promise<GhAvailability> {
  const availability = await ghCheckAvailable();
  setGh(availability);
  return availability;
}

async function refreshPrs(workspaceDir: string, limit = 100) {
  if (!workspaceDir) return;
  setLoading(true);
  setError(null);
  try {
    const availability = gh() ?? (await checkGhAvailability());
    if (!availability.installed || !availability.authenticated) {
      setPrs([]);
      setError(availability.message ?? "GitHub CLI unavailable.");
      return;
    }
    const list = await ghListPrs(workspaceDir, stateFilter(), limit);
    setPrs(list);
    setLastFetchedAt(Date.now());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setError(msg);
    setPrs([]);
  } finally {
    setLoading(false);
  }
}

export function getCiSummary(pr: PrSummary): { failing: number; pending: number; passing: number; total: number } {
  const checks = pr.statusCheckRollup ?? [];
  let failing = 0;
  let pending = 0;
  let passing = 0;
  for (const c of checks) {
    const conclusion = (c.conclusion ?? "").toLowerCase();
    const status = (c.status ?? "").toLowerCase();
    if (conclusion === "failure" || conclusion === "timed_out" || conclusion === "cancelled" || conclusion === "action_required") {
      failing++;
    } else if (conclusion === "success") {
      passing++;
    } else if (status === "in_progress" || status === "queued" || status === "pending" || conclusion === "") {
      pending++;
    } else {
      passing++;
    }
  }
  return { failing, pending, passing, total: checks.length };
}

export function prAgeMs(pr: PrSummary): number | null {
  if (!pr.createdAt) return null;
  const created = Date.parse(pr.createdAt);
  if (Number.isNaN(created)) return null;
  return Date.now() - created;
}

export function formatAge(pr: PrSummary): string {
  const ms = prAgeMs(pr);
  if (ms === null) return "";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d`;
  const month = Math.floor(day / 30);
  return `${month}mo`;
}

function filteredSortedPrs(): PrSummary[] {
  const q = search().trim().toLowerCase();
  const author = authorFilter().trim().toLowerCase();
  const drafts = hideDrafts();
  const failing = onlyFailingCi();

  let filtered = prs.filter((pr) => {
    if (drafts && pr.isDraft) return false;
    if (author) {
      const login = pr.author?.login?.toLowerCase() ?? "";
      if (!login.includes(author)) return false;
    }
    if (failing) {
      const summary = getCiSummary(pr);
      if (summary.failing === 0) return false;
    }
    if (q) {
      const hay = `${pr.number} ${pr.title} ${pr.author?.login ?? ""} ${pr.headRefName ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const mode = sort();
  filtered = [...filtered].sort((a, b) => {
    switch (mode) {
      case "created-desc": {
        const at = Date.parse(a.createdAt ?? "") || 0;
        const bt = Date.parse(b.createdAt ?? "") || 0;
        return bt - at;
      }
      case "age-desc": {
        const aa = prAgeMs(a) ?? 0;
        const bb = prAgeMs(b) ?? 0;
        return bb - aa;
      }
      case "commits-desc": {
        const ac = a.commits?.length ?? 0;
        const bc = b.commits?.length ?? 0;
        return bc - ac;
      }
      case "ci-failing-first": {
        const af = getCiSummary(a).failing;
        const bf = getCiSummary(b).failing;
        if (af !== bf) return bf - af;
        const au = Date.parse(a.updatedAt ?? "") || 0;
        const bu = Date.parse(b.updatedAt ?? "") || 0;
        return bu - au;
      }
      case "updated-desc":
      default: {
        const au = Date.parse(a.updatedAt ?? "") || 0;
        const bu = Date.parse(b.updatedAt ?? "") || 0;
        return bu - au;
      }
    }
  });

  return filtered;
}

export {
  prs,
  setPrs,
  loading,
  error,
  setError,
  lastFetchedAt,
  gh,
  search,
  setSearch,
  stateFilter,
  setStateFilter,
  authorFilter,
  setAuthorFilter,
  hideDrafts,
  setHideDrafts,
  onlyFailingCi,
  setOnlyFailingCi,
  sort,
  setSort,
  refreshPrs,
  checkGhAvailability,
  filteredSortedPrs,

  // Review engine state and actions
  reviewResults,
  runningReviews,
  selectedPrNumber,
  setSelectedPrNumber,
  autoReviewEnabled,
  setAutoReviewEnabled,
  reviewError,
  ensureReviewListeners,
  runReview,
  cancelReview,
  loadCachedReviews,
  fetchPrDiff,
  postReview,
  polishPreview,
  polishApply,
  dismissFinding,
  promoteFindingRequired,
  applyFindingPatch,
  enqueueReview,
  queueReviewsForPrs,
  runAllShown,
};
