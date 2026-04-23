import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  ghCheckAvailable,
  ghListPrs,
  ghPrDetail,
  type GhAvailability,
  type PrSummary,
  type PrDetail,
} from "../lib/tauri";
import { projectRoot } from "./fileStore";
import type {
  ReviewResult,
  Finding,
  PolishPlan,
  PolishMode,
  PolishApplyReport,
} from "../types/review";
import type { PolicyResult, PendingComment } from "../types/policy";
import type { RelatedPr } from "../types/similarity";
import type { ConsolidationPlan, ConsolidationResult } from "../types/consolidation";

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
  reviewUnlisteners.push(
    await listen<{ pr_number: number; result: PolicyResult }>("pr_policy_result", (event) => {
      const { pr_number, result } = event.payload;
      setPolicyResults(
        produce((state) => {
          const existing = state[pr_number] ?? [];
          const idx = existing.findIndex((r) => r.policy_id === result.policy_id);
          if (idx >= 0) existing[idx] = result;
          else existing.push(result);
          state[pr_number] = existing;
        }),
      );
    }),
  );
  reviewUnlisteners.push(
    await listen<PendingComment>("pending_comment_drafted", (event) => {
      setPendingComments(
        produce((list) => {
          list.push(event.payload);
        }),
      );
    }),
  );
  reviewUnlisteners.push(
    await listen<PendingComment>("pending_comment_sent", (event) => {
      setPendingComments(
        produce((list) => {
          const idx = list.findIndex((c) => c.id === event.payload.id);
          if (idx >= 0) list.splice(idx, 1);
        }),
      );
    }),
  );
}

// Policy + pending comments state
const [policyResults, setPolicyResults] = createStore<Record<number, PolicyResult[]>>({});
const [pendingComments, setPendingComments] = createStore<PendingComment[]>([]);

async function loadPendingComments(workspaceDir: string): Promise<void> {
  try {
    const items = (await invoke<PendingComment[]>("pending_comments_list", { workspaceDir })) ?? [];
    setPendingComments(items);
  } catch {
    // ignore
  }
}

async function sendPendingComment(id: string): Promise<void> {
  const workspaceDir = projectRoot();
  if (!workspaceDir) return;
  await invoke("pending_comment_send", { workspaceDir, id });
  setPendingComments(
    produce((list) => {
      const idx = list.findIndex((c) => c.id === id);
      if (idx >= 0) list.splice(idx, 1);
    }),
  );
}

async function editPendingComment(id: string, body: string): Promise<void> {
  const workspaceDir = projectRoot();
  if (!workspaceDir) return;
  await invoke("pending_comment_edit", { workspaceDir, id, body });
  setPendingComments(
    produce((list) => {
      const c = list.find((x) => x.id === id);
      if (c) c.body = body;
    }),
  );
}

async function dismissPendingComment(id: string): Promise<void> {
  const workspaceDir = projectRoot();
  if (!workspaceDir) return;
  await invoke("pending_comment_dismiss", { workspaceDir, id });
  setPendingComments(
    produce((list) => {
      const idx = list.findIndex((c) => c.id === id);
      if (idx >= 0) list.splice(idx, 1);
    }),
  );
}

async function runPolicyCheck(prNumber: number): Promise<PolicyResult[]> {
  const workspaceDir = projectRoot();
  if (!workspaceDir) return [];
  try {
    const results = await invoke<PolicyResult[]>("pr_policy_check", { workspaceDir, prNumber });
    setPolicyResults(
      produce((state) => {
        state[prNumber] = results;
      }),
    );
    return results;
  } catch {
    return [];
  }
}

// Similarity cache per focal PR
const [relatedPrs, setRelatedPrs] = createStore<Record<number, RelatedPr[]>>({});
const [loadingRelated, setLoadingRelated] = createSignal<Set<number>>(new Set());

async function fetchRelatedPrs(focalPr: number): Promise<RelatedPr[]> {
  const workspaceDir = projectRoot();
  if (!workspaceDir) return [];
  if (relatedPrs[focalPr]) return relatedPrs[focalPr];
  if (loadingRelated().has(focalPr)) return [];
  setLoadingRelated((prev) => {
    const next = new Set(prev);
    next.add(focalPr);
    return next;
  });
  try {
    const titles: Record<number, string> = {};
    const authors: Record<number, string> = {};
    const candidates: number[] = [];
    for (const p of prs) {
      if (p.number === focalPr) continue;
      titles[p.number] = p.title;
      authors[p.number] = p.author?.login ?? "";
      candidates.push(p.number);
    }
    const focal = prs.find((p) => p.number === focalPr);
    if (focal) {
      titles[focalPr] = focal.title;
      authors[focalPr] = focal.author?.login ?? "";
    }
    const related = await invoke<RelatedPr[]>("pr_similarity", {
      workspaceDir,
      focalPr,
      candidatePrs: candidates,
      titles,
      authors,
      threshold: null,
    });
    setRelatedPrs(
      produce((state) => {
        state[focalPr] = related;
      }),
    );
    return related;
  } catch {
    return [];
  } finally {
    setLoadingRelated((prev) => {
      const next = new Set(prev);
      next.delete(focalPr);
      return next;
    });
  }
}

async function planConsolidation(sourcePrs: number[]): Promise<ConsolidationPlan> {
  const workspaceDir = projectRoot();
  if (!workspaceDir) throw new Error("No workspace");
  return invoke<ConsolidationPlan>("pr_consolidate_plan", { workspaceDir, sourcePrs });
}

async function applyConsolidation(
  planId: string,
  closeSources: boolean,
): Promise<ConsolidationResult> {
  const workspaceDir = projectRoot();
  if (!workspaceDir) throw new Error("No workspace");
  return invoke<ConsolidationResult>("pr_consolidate_apply", {
    workspaceDir,
    planId,
    closeSources,
  });
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

// Per-PR detail cache for lazily-loaded fields (commits, checks, review requests)
const [prDetails, setPrDetails] = createStore<Record<number, PrDetail>>({});
const [loadingDetail, setLoadingDetail] = createSignal<Set<number>>(new Set());

// Selection state for batch actions
const [selectedPrs, setSelectedPrs] = createSignal<Set<number>>(new Set());
const [lastSelectedAnchor, setLastSelectedAnchor] = createSignal<number | null>(null);

function toggleSelection(prNumber: number) {
  setSelectedPrs((prev) => {
    const next = new Set(prev);
    if (next.has(prNumber)) next.delete(prNumber);
    else next.add(prNumber);
    return next;
  });
  setLastSelectedAnchor(prNumber);
}

function selectRangeTo(prNumber: number, visible: number[]) {
  const anchor = lastSelectedAnchor();
  if (anchor == null) {
    toggleSelection(prNumber);
    return;
  }
  const aIdx = visible.indexOf(anchor);
  const bIdx = visible.indexOf(prNumber);
  if (aIdx === -1 || bIdx === -1) {
    toggleSelection(prNumber);
    return;
  }
  const [lo, hi] = aIdx < bIdx ? [aIdx, bIdx] : [bIdx, aIdx];
  setSelectedPrs((prev) => {
    const next = new Set(prev);
    for (let i = lo; i <= hi; i++) next.add(visible[i]);
    return next;
  });
  setLastSelectedAnchor(prNumber);
}

function clearSelection() {
  setSelectedPrs(new Set<number>());
  setLastSelectedAnchor(null);
}

function selectAllVisible(visible: number[]) {
  setSelectedPrs((prev) => {
    const next = new Set(prev);
    for (const n of visible) next.add(n);
    return next;
  });
}

// Bulk action progress
const [bulkRunning, setBulkRunning] = createSignal<{ done: number; total: number; failed: number } | null>(null);

async function bulkPostReview(
  action: "comment" | "approve" | "request_changes",
  body: string,
): Promise<void> {
  const workspaceDir = projectRoot();
  if (!workspaceDir) return;
  const targets = Array.from(selectedPrs());
  setBulkRunning({ done: 0, total: targets.length, failed: 0 });
  for (const n of targets) {
    try {
      await invoke("pr_review_post", { workspaceDir, prNumber: n, action, body });
      setBulkRunning((p) => (p ? { ...p, done: p.done + 1 } : p));
    } catch {
      setBulkRunning((p) => (p ? { ...p, done: p.done + 1, failed: p.failed + 1 } : p));
    }
  }
  await invoke("audit_list", { workspaceDir, limit: 1 }).catch(() => {});
  // Audit bulk umbrella entry
  try {
    await invoke("audit_list", { workspaceDir, limit: 1 });
  } catch {}
  setTimeout(() => setBulkRunning(null), 2500);
}

async function bulkCloseAsDuplicate(
  duplicateOf: number,
  reason: string,
  commentBody: string | null,
): Promise<void> {
  const workspaceDir = projectRoot();
  if (!workspaceDir) return;
  const targets = Array.from(selectedPrs()).filter((n) => n !== duplicateOf);
  setBulkRunning({ done: 0, total: targets.length, failed: 0 });
  for (const n of targets) {
    try {
      await invoke("pr_close_as", {
        workspaceDir,
        prNumber: n,
        reason,
        duplicateOf,
        commentBody,
      });
      setBulkRunning((p) => (p ? { ...p, done: p.done + 1 } : p));
    } catch {
      setBulkRunning((p) => (p ? { ...p, done: p.done + 1, failed: p.failed + 1 } : p));
    }
  }
  setTimeout(() => setBulkRunning(null), 2500);
}

async function bulkQueuePolish(mode: "minimal" | "standard" | "aggressive" | "security"): Promise<void> {
  const workspaceDir = projectRoot();
  if (!workspaceDir) return;
  const targets = Array.from(selectedPrs());
  setBulkRunning({ done: 0, total: targets.length, failed: 0 });
  for (const n of targets) {
    try {
      await invoke("pr_polish_preview", { workspaceDir, prNumber: n, mode });
      setBulkRunning((p) => (p ? { ...p, done: p.done + 1 } : p));
    } catch {
      setBulkRunning((p) => (p ? { ...p, done: p.done + 1, failed: p.failed + 1 } : p));
    }
  }
  setTimeout(() => setBulkRunning(null), 2500);
}

async function fetchPrDetail(prNumber: number): Promise<PrDetail | null> {
  const workspaceDir = projectRoot();
  if (!workspaceDir) return null;
  if (prDetails[prNumber]) return prDetails[prNumber];
  if (loadingDetail().has(prNumber)) return null;
  setLoadingDetail((prev) => {
    const next = new Set(prev);
    next.add(prNumber);
    return next;
  });
  try {
    const detail = await ghPrDetail(workspaceDir, prNumber);
    setPrDetails(
      produce((state) => {
        state[prNumber] = detail;
      }),
    );
    return detail;
  } catch {
    return null;
  } finally {
    setLoadingDetail((prev) => {
      const next = new Set(prev);
      next.delete(prNumber);
      return next;
    });
  }
}

async function refreshPrs(workspaceDir: string, limit = 50) {
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
  // Prefer detail cache (lazy-loaded) over the lean list payload
  const detail = prDetails[pr.number];
  const checks = detail?.statusCheckRollup ?? pr.statusCheckRollup ?? [];
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
  prDetails,
  loadingDetail,
  fetchPrDetail,
  selectedPrs,
  toggleSelection,
  selectRangeTo,
  clearSelection,
  selectAllVisible,
  bulkRunning,
  bulkPostReview,
  bulkCloseAsDuplicate,
  bulkQueuePolish,
  policyResults,
  pendingComments,
  loadPendingComments,
  sendPendingComment,
  editPendingComment,
  dismissPendingComment,
  runPolicyCheck,
  relatedPrs,
  loadingRelated,
  fetchRelatedPrs,
  planConsolidation,
  applyConsolidation,
};
