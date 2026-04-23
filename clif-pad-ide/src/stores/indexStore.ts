import { createEffect, createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { projectRoot } from "./fileStore";

export type IndexPhase =
  | "scan"
  | "recency"
  | "symbols"
  | "tokens"
  | "postings"
  | "save"
  | "done"
  | "error";

export interface IndexProgress {
  phase: IndexPhase;
  current: number;
  total: number;
  message: string;
}

export type IndexState = "missing" | "building" | "ready" | "error";

export interface IndexStatusReport {
  state: IndexState;
  built_at: number | null;
  file_count: number;
  symbol_count: number;
  error?: string | null;
}

export interface SymbolHit {
  symbol: {
    name: string;
    kind: string;
    file: string;
    line: number;
    language: string;
  };
  score: number;
}

export interface SearchHit {
  file: string;
  score: number;
  line_matches: Array<[number, string]>;
  recency_boost: number;
}

const [indexStatus, setIndexStatus] = createSignal<IndexStatusReport>({
  state: "missing",
  built_at: null,
  file_count: 0,
  symbol_count: 0,
});
const [indexProgress, setIndexProgress] = createSignal<IndexProgress | null>(null);
const [isBuilding, setIsBuilding] = createSignal(false);

let unlistenProgress: UnlistenFn | null = null;
let buildTriggeredFor: string | null = null;

async function ensureListener(): Promise<void> {
  if (unlistenProgress) return;
  unlistenProgress = await listen<IndexProgress>("index_progress", (event) => {
    setIndexProgress(event.payload);
    if (event.payload.phase === "done") {
      setIsBuilding(false);
      // Clear the chip after a few seconds so the bar stays calm.
      setTimeout(() => setIndexProgress(null), 2500);
    } else if (event.payload.phase === "error") {
      setIsBuilding(false);
    }
  });
}

/** Check the current on-disk snapshot status without rebuilding. */
async function refreshStatus(workspaceDir?: string): Promise<IndexStatusReport> {
  const dir = workspaceDir ?? projectRoot();
  if (!dir) {
    const empty: IndexStatusReport = {
      state: "missing",
      built_at: null,
      file_count: 0,
      symbol_count: 0,
    };
    setIndexStatus(empty);
    return empty;
  }
  try {
    const status = await invoke<IndexStatusReport>("index_status", { workspaceDir: dir });
    setIndexStatus(status);
    return status;
  } catch {
    const empty: IndexStatusReport = {
      state: "missing",
      built_at: null,
      file_count: 0,
      symbol_count: 0,
    };
    setIndexStatus(empty);
    return empty;
  }
}

/** Kick off a background index build. Coalesces: if one is already running
 *  for this workspace, the command errors and we swallow it. */
async function buildIndex(workspaceDir?: string): Promise<void> {
  const dir = workspaceDir ?? projectRoot();
  if (!dir) return;
  await ensureListener();
  setIsBuilding(true);
  setIndexProgress({ phase: "scan", current: 0, total: 0, message: "Starting indexer…" });
  try {
    const status = await invoke<IndexStatusReport>("index_build", { workspaceDir: dir });
    setIndexStatus(status);
  } catch (e) {
    setIndexStatus((prev) => ({
      ...prev,
      state: "error",
      error: e instanceof Error ? e.message : String(e),
    }));
    setIsBuilding(false);
  }
}

async function findSymbol(query: string, limit = 20): Promise<SymbolHit[]> {
  const dir = projectRoot();
  if (!dir) return [];
  try {
    return await invoke<SymbolHit[]>("index_find_symbol", {
      workspaceDir: dir,
      query,
      limit,
    });
  } catch {
    return [];
  }
}

async function rankedSearch(query: string, limit = 20): Promise<SearchHit[]> {
  const dir = projectRoot();
  if (!dir) return [];
  try {
    return await invoke<SearchHit[]>("index_search", {
      workspaceDir: dir,
      query,
      limit,
    });
  } catch {
    return [];
  }
}

async function touchFile(relPath: string): Promise<void> {
  const dir = projectRoot();
  if (!dir) return;
  try {
    await invoke("index_touch_file", { workspaceDir: dir, relPath });
  } catch {
    // best-effort incremental update; ignore failures
  }
}

// Auto-build when workspace changes. If no snapshot exists, build one in the
// background. Guarded so we don't re-fire for the same workspace path.
createEffect(() => {
  const dir = projectRoot();
  if (!dir || dir === buildTriggeredFor) return;
  buildTriggeredFor = dir;
  void (async () => {
    await ensureListener();
    const status = await refreshStatus(dir);
    if (status.state === "missing") {
      // Delay slightly so the rest of the UI mounts first.
      setTimeout(() => {
        void buildIndex(dir);
      }, 800);
    }
  })();
});

export {
  indexStatus,
  indexProgress,
  isBuilding,
  refreshStatus,
  buildIndex,
  findSymbol,
  rankedSearch,
  touchFile,
};
