import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { projectRoot } from "./fileStore";
import { prClassify } from "../lib/tauri";
import type { PrClassification, Tier } from "../types/classification";
import { recordDecision } from "./syncStore";

const [classifications, setClassifications] = createStore<Record<number, PrClassification>>({});
const [classifying, setClassifying] = createSignal<Set<number>>(new Set());
const [autoClassifyEnabled, setAutoClassifyEnabled] = createSignal(true);

function markClassifying(prNumber: number, running: boolean) {
  setClassifying((prev) => {
    const next = new Set(prev);
    if (running) next.add(prNumber);
    else next.delete(prNumber);
    return next;
  });
}

async function fetchClassification(
  prNumber: number,
  opts: { force?: boolean } = {},
): Promise<PrClassification | null> {
  const workspaceDir = projectRoot();
  if (!workspaceDir) return null;
  if (!opts.force && classifications[prNumber]) return classifications[prNumber];
  if (classifying().has(prNumber)) return null;
  markClassifying(prNumber, true);
  try {
    const result = await prClassify(workspaceDir, prNumber);
    setClassifications(
      produce((state) => {
        state[prNumber] = result;
      }),
    );
    void recordClassifyDecision(prNumber, result.tier);
    return result;
  } catch {
    return null;
  } finally {
    markClassifying(prNumber, false);
  }
}

// ---------------------------------------------------------------------------
// Concurrency-limited classify queue.
//
// Prior implementation used `pr_classify_batch` which spawned N concurrent
// tokio tasks — fine for 5-10 PRs, but a 50-PR repo like openclaw would fire
// 50 parallel `gh pr diff` + `gh pr view` calls and hit GitHub's secondary
// rate limits, failing the whole batch. The queue below runs at most
// CLASSIFY_CONCURRENCY requests in flight at a time. Each result lands in
// the store the moment it returns, so the UI updates incrementally and one
// slow PR never blocks the rest.
// ---------------------------------------------------------------------------
const CLASSIFY_CONCURRENCY = 3;
const classifyQueue: number[] = [];
let classifyInFlight = 0;
const [totalQueuedEver, setTotalQueuedEver] = createSignal(0);

export function classifyQueueStats(): { inFlight: number; queued: number; total: number } {
  return {
    inFlight: classifyInFlight,
    queued: classifyQueue.length,
    total: totalQueuedEver(),
  };
}

function pumpClassifyQueue() {
  while (classifyInFlight < CLASSIFY_CONCURRENCY && classifyQueue.length > 0) {
    const n = classifyQueue.shift()!;
    if (classifications[n] || classifying().has(n)) continue;
    classifyInFlight++;
    // Intentionally not awaited — we want the queue to keep moving.
    void runOneClassification(n).finally(() => {
      classifyInFlight = Math.max(0, classifyInFlight - 1);
      pumpClassifyQueue();
      // Reset `total` once everything is done so the progress bar clears.
      if (classifyInFlight === 0 && classifyQueue.length === 0) {
        setTotalQueuedEver(0);
      }
    });
  }
}

async function runOneClassification(prNumber: number): Promise<void> {
  const workspaceDir = projectRoot();
  if (!workspaceDir) return;
  if (classifications[prNumber] || classifying().has(prNumber)) return;
  markClassifying(prNumber, true);
  try {
    const result = await prClassify(workspaceDir, prNumber);
    setClassifications(
      produce((state) => {
        state[prNumber] = result;
      }),
    );
    void recordClassifyDecision(prNumber, result.tier);
  } catch {
    // Swallow individual failures so one bad PR doesn't poison the batch.
    // Next manual refresh will retry.
  } finally {
    markClassifying(prNumber, false);
  }
}

async function classifyAllVisible(prNumbers: number[]): Promise<void> {
  for (const n of prNumbers) {
    if (classifications[n]) continue;
    if (classifying().has(n)) continue;
    if (classifyQueue.includes(n)) continue;
    classifyQueue.push(n);
    setTotalQueuedEver((v) => v + 1);
  }
  pumpClassifyQueue();
}

/**
 * Record a classify decision at most once per (PR, tier) pair per session.
 * Prevents the decision log from ballooning with duplicate entries when the
 * PR list is refreshed frequently.
 */
const classifyRecorded = new Map<number, string>();
async function recordClassifyDecision(prNumber: number, tier: Tier): Promise<void> {
  if (classifyRecorded.get(prNumber) === tier) return;
  classifyRecorded.set(prNumber, tier);
  await recordDecision({ pr_number: prNumber, kind: "classify", tier });
}

export function tierRank(t: Tier): number {
  switch (t) {
    case "T5":
      return 5;
    case "T4":
      return 4;
    case "T3":
      return 3;
    case "T2":
      return 2;
    case "T1":
    default:
      return 1;
  }
}

export {
  classifications,
  classifying,
  autoClassifyEnabled,
  setAutoClassifyEnabled,
  fetchClassification,
  classifyAllVisible,
};
