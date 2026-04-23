import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { projectRoot } from "./fileStore";
import { prClassify, prClassifyBatch } from "../lib/tauri";
import type { PrClassification, Tier } from "../types/classification";

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
    return result;
  } catch {
    return null;
  } finally {
    markClassifying(prNumber, false);
  }
}

async function classifyAllVisible(prNumbers: number[]): Promise<void> {
  const workspaceDir = projectRoot();
  if (!workspaceDir) return;
  const missing = prNumbers.filter((n) => !classifications[n] && !classifying().has(n));
  if (missing.length === 0) return;
  for (const n of missing) markClassifying(n, true);
  try {
    const results = await prClassifyBatch(workspaceDir, missing);
    setClassifications(
      produce((state) => {
        for (const r of results) state[r.pr_number] = r;
      }),
    );
  } catch {
    // ignore
  } finally {
    for (const n of missing) markClassifying(n, false);
  }
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
