import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { invoke } from "@tauri-apps/api/core";
import { projectRoot } from "./fileStore";
import type {
  Decision,
  DecisionKind,
  PrSyncState,
  RecordDecisionInput,
  SyncPlan,
  SyncResult,
} from "../types/sync";

const [decisions, setDecisions] = createStore<Decision[]>([]);
const [pendingPrs, setPendingPrs] = createSignal<Set<number>>(new Set());
const [previewPlans, setPreviewPlans] = createStore<Record<number, SyncPlan>>({});
const [lastSyncResults, setLastSyncResults] = createStore<Record<number, SyncResult>>({});
const [syncStates, setSyncStates] = createStore<Record<number, PrSyncState>>({});
const [syncRunning, setSyncRunning] = createSignal(false);
const [previewRunning, setPreviewRunning] = createSignal(false);
const [syncError, setSyncError] = createSignal<string | null>(null);
const [lastSyncedAt, setLastSyncedAt] = createSignal<number | null>(null);

export interface SyncSummary {
  ok_count: number;
  fail_count: number;
  add_total: number;
  remove_total: number;
  missing_label_error: boolean;
  ts: number;
}

const [lastSyncSummary, setLastSyncSummary] = createSignal<SyncSummary | null>(null);

function detectMissingLabelError(results: SyncResult[]): boolean {
  for (const r of results) {
    const msg = (r.error ?? "").toLowerCase();
    if (msg.includes("missing from the repo") || msg.includes("could not add label") || msg.includes("not found")) {
      return true;
    }
  }
  return false;
}

async function loadDecisions(): Promise<void> {
  const workspaceDir = projectRoot();
  if (!workspaceDir) return;
  try {
    const list = await invoke<Decision[]>("sync_list_decisions", {
      workspaceDir,
      prNumber: null,
    });
    setDecisions(list ?? []);
    await refreshPending();
  } catch (e) {
    setSyncError(e instanceof Error ? e.message : String(e));
  }
}

async function refreshPending(): Promise<void> {
  const workspaceDir = projectRoot();
  if (!workspaceDir) return;
  try {
    const list = await invoke<number[]>("sync_pending_prs", { workspaceDir });
    setPendingPrs(new Set<number>(list ?? []));
  } catch {
    // ignore
  }
}

async function recordDecision(input: RecordDecisionInput): Promise<Decision | null> {
  const workspaceDir = projectRoot();
  if (!workspaceDir) return null;
  try {
    const d = await invoke<Decision>("sync_record_decision", {
      workspaceDir,
      input,
    });
    setDecisions(produce((list) => list.push(d)));
    setPendingPrs((prev) => {
      const next = new Set(prev);
      next.add(input.pr_number);
      return next;
    });
    return d;
  } catch (e) {
    setSyncError(e instanceof Error ? e.message : String(e));
    return null;
  }
}

async function previewSync(prNumbers?: number[]): Promise<SyncPlan[]> {
  const workspaceDir = projectRoot();
  if (!workspaceDir) return [];
  setPreviewRunning(true);
  setSyncError(null);
  try {
    const plans = await invoke<SyncPlan[]>("sync_preview", {
      workspaceDir,
      prNumbers: prNumbers ?? null,
    });
    setPreviewPlans(
      produce((state) => {
        // clear & replace for the PRs in scope
        if (prNumbers && prNumbers.length > 0) {
          for (const n of prNumbers) delete state[n];
        } else {
          for (const k of Object.keys(state)) delete state[Number(k)];
        }
        for (const p of plans) {
          if (p.pr_number > 0) state[p.pr_number] = p;
        }
      }),
    );
    return plans;
  } catch (e) {
    setSyncError(e instanceof Error ? e.message : String(e));
    return [];
  } finally {
    setPreviewRunning(false);
  }
}

async function applySync(prNumbers?: number[]): Promise<SyncResult[]> {
  const workspaceDir = projectRoot();
  if (!workspaceDir) return [];
  setSyncRunning(true);
  setSyncError(null);
  try {
    const results = await invoke<SyncResult[]>("sync_apply", {
      workspaceDir,
      prNumbers: prNumbers ?? null,
    });
    setLastSyncResults(
      produce((state) => {
        for (const r of results) state[r.pr_number] = r;
      }),
    );
    setLastSyncedAt(Date.now());

    const okPrs = results.filter((r) => r.ok).map((r) => r.pr_number);
    const okCount = okPrs.length;
    const failCount = results.length - okCount;
    let addTotal = 0;
    let removeTotal = 0;
    for (const r of results) {
      if (r.ok) {
        addTotal += r.applied_add.length;
        removeTotal += r.applied_remove.length;
      }
    }
    setLastSyncSummary({
      ok_count: okCount,
      fail_count: failCount,
      add_total: addTotal,
      remove_total: removeTotal,
      missing_label_error: detectMissingLabelError(results),
      ts: Date.now(),
    });

    setPreviewPlans(
      produce((state) => {
        for (const n of okPrs) delete state[n];
      }),
    );
    setSyncStates(
      produce((state) => {
        for (const n of okPrs) state[n] = "in_sync";
      }),
    );
    await loadDecisions();
    return results;
  } catch (e) {
    setSyncError(e instanceof Error ? e.message : String(e));
    return [];
  } finally {
    setSyncRunning(false);
  }
}

async function refreshStatus(prNumber: number): Promise<PrSyncState | null> {
  const workspaceDir = projectRoot();
  if (!workspaceDir) return null;
  try {
    const state = await invoke<PrSyncState>("sync_status", {
      workspaceDir,
      prNumber,
    });
    setSyncStates(
      produce((s) => {
        s[prNumber] = state;
      }),
    );
    return state;
  } catch {
    return null;
  }
}

async function bootstrapLabels(): Promise<string[]> {
  const workspaceDir = projectRoot();
  if (!workspaceDir) return [];
  try {
    return await invoke<string[]>("sync_bootstrap_labels", { workspaceDir });
  } catch (e) {
    setSyncError(e instanceof Error ? e.message : String(e));
    return [];
  }
}

function decisionsForPr(prNumber: number): Decision[] {
  return decisions.filter((d) => d.pr_number === prNumber);
}

function pendingDeltaCount(): number {
  let n = 0;
  for (const key of Object.keys(previewPlans)) {
    const p = previewPlans[Number(key)];
    if (!p) continue;
    n += p.add.length + p.remove.length;
  }
  return n;
}

function clearLastSyncSummary(): void {
  setLastSyncSummary(null);
}

async function bootstrapAndRetry(prNumbers?: number[]): Promise<SyncResult[]> {
  await bootstrapLabels();
  return applySync(prNumbers);
}

export {
  decisions,
  pendingPrs,
  previewPlans,
  lastSyncResults,
  syncStates,
  syncRunning,
  previewRunning,
  syncError,
  lastSyncedAt,
  lastSyncSummary,
  clearLastSyncSummary,
  loadDecisions,
  refreshPending,
  recordDecision,
  previewSync,
  applySync,
  refreshStatus,
  bootstrapLabels,
  bootstrapAndRetry,
  decisionsForPr,
  pendingDeltaCount,
};

export type { DecisionKind };
