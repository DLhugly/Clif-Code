export type Tier = "T1" | "T2" | "T3" | "T4" | "T5";

export interface ClassificationSignal {
  id: string;
  label: string;
  points: number;
  severity: "info" | "warning" | "critical";
  detail?: string | null;
  locator?: string | null;
}

export interface SecurityIssueLite {
  file: string;
  line: number;
  severity: string;
  category: string;
  description: string;
  snippet: string;
}

export interface PrClassification {
  pr_number: number;
  tier: Tier;
  score: number;
  hard_override?: string | null;
  signals: ClassificationSignal[];
  security_issues: SecurityIssueLite[];
  touched_files: string[];
  generated_at: string;
  head_sha?: string | null;
}

export const TIER_META: Record<
  Tier,
  { label: string; short: string; color: string; bg: string; description: string }
> = {
  T1: {
    label: "Trivial",
    short: "T1",
    color: "#86efac",
    bg: "rgba(34, 197, 94, 0.15)",
    description: "Docs, comments, formatting, typo fixes. Safe to batch-approve.",
  },
  T2: {
    label: "Small",
    short: "T2",
    color: "#7dd3fc",
    bg: "rgba(56, 189, 248, 0.15)",
    description: "Small localized change with tests. Quick review.",
  },
  T3: {
    label: "Standard",
    short: "T3",
    color: "#fde68a",
    bg: "rgba(251, 191, 36, 0.18)",
    description: "Normal feature or bugfix. Run full review + policy checks.",
  },
  T4: {
    label: "Significant",
    short: "T4",
    color: "#fdba74",
    bg: "rgba(249, 115, 22, 0.2)",
    description: "Broad change, deps, schema, or lots of files. Careful review.",
  },
  T5: {
    label: "Halt",
    short: "T5",
    color: "#fca5a5",
    bg: "rgba(239, 68, 68, 0.22)",
    description: "Secrets, destructive SQL, breaking change, critical security. Do not approve.",
  },
};
