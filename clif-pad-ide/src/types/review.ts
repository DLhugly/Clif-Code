export type Severity = "critical" | "high" | "medium" | "low" | "nit";

export type Category =
  | "bug"
  | "security"
  | "perf"
  | "style"
  | "tests"
  | "docs"
  | "refactor"
  | "api"
  | "architecture"
  | "types"
  | "imports";

export interface Finding {
  id: string;
  path: string;
  line_start: number;
  line_end: number;
  severity: Severity;
  category: Category;
  rule_id?: string | null;
  message: string;
  rationale?: string | null;
  suggested_patch?: string | null;
  confidence?: number | null;
  required?: boolean;
  dismissed?: boolean;
}

export interface BlastRadius {
  files: string[];
  subsystems: string[];
}

export interface ReviewChecklistItem {
  id: string;
  description: string;
  required: boolean;
  passed: boolean | null;
}

export interface ReviewMetrics {
  total: number;
  by_severity: Partial<Record<Severity, number>>;
  by_category: Partial<Record<Category, number>>;
}

export interface ToolOutput {
  name: string;
  ok: boolean;
  summary?: string;
  details?: string;
}

export interface ReviewResult {
  pr_number: number;
  head_sha?: string | null;
  generated_at: string;
  summary?: string | null;
  risk_score?: number | null;
  blast_radius?: BlastRadius | null;
  findings: Finding[];
  checklist?: ReviewChecklistItem[];
  metrics?: ReviewMetrics;
  tool_outputs?: ToolOutput[];
}

export type PolishMode = "minimal" | "standard" | "aggressive" | "security";

export interface PolishChunk {
  id: string;
  path: string;
  category: Category;
  rule_id?: string | null;
  patch: string;
  rationale?: string | null;
  from_finding_id?: string | null;
}

export interface PolishCommitSpec {
  id: string;
  category: Category;
  message: string;
  chunk_ids: string[];
}

export interface PolishValidator {
  name: string;
  command: string;
  required: boolean;
}

export interface PolishPlan {
  plan_id: string;
  pr_number: number;
  mode: PolishMode;
  chunks: PolishChunk[];
  commit_plan: PolishCommitSpec[];
  validators: PolishValidator[];
  manifest_path: string;
}

export interface PolishCommitRecord {
  oid: string;
  author: string;
  committer: string;
  category: Category;
  rule_id?: string | null;
  validator_results: Array<{ name: string; ok: boolean; details?: string }>;
  rollback: string[];
}

export interface PolishManifest {
  pr_number: number;
  plan_id: string;
  mode: PolishMode;
  branch: string;
  commits: PolishCommitRecord[];
  generated_at: string;
}

export interface PolishApplyReport {
  plan_id: string;
  branch: string;
  commits_applied: number;
  manifest_path: string;
}
