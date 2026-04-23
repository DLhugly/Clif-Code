export type DecisionKind =
  | "classify"
  | "mark_ready_to_merge"
  | "mark_kicked_back"
  | "mark_reviewed"
  | "mark_needs_policy"
  | "mark_polished"
  | "clear";

export interface Decision {
  id: string;
  pr_number: number;
  kind: DecisionKind;
  created_at: number;
  tier?: string | null;
  note?: string | null;
  synced_at?: number | null;
  sync_error?: string | null;
}

export interface RecordDecisionInput {
  pr_number: number;
  kind: DecisionKind;
  tier?: string | null;
  note?: string | null;
}

export interface SyncPlan {
  pr_number: number;
  current_labels: string[];
  target_labels: string[];
  add: string[];
  remove: string[];
  skipped_reason?: string | null;
}

export interface SyncResult {
  pr_number: number;
  applied_add: string[];
  applied_remove: string[];
  ok: boolean;
  error?: string | null;
}

export type PrSyncState = "untouched" | "in_sync" | "pending" | "diverged";

export const SYNC_LABEL_COLORS: Record<string, string> = {
  "clif/tier-t1": "#22c55e",
  "clif/tier-t2": "#38bdf8",
  "clif/tier-t3": "#eab308",
  "clif/tier-t4": "#f97316",
  "clif/tier-t5": "#ef4444",
  "clif/ready-to-merge": "#16a34a",
  "clif/kicked-back": "#f59e0b",
  "clif/reviewed": "#a78bfa",
  "clif/needs-policy": "#f87171",
  "clif/polished": "#34d399",
  "clif/blocked": "#dc2626",
};

export function labelColor(name: string): string {
  return SYNC_LABEL_COLORS[name] ?? "#6b7280";
}
