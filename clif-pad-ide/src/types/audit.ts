export interface AuditEntry {
  ts: string;
  actor: string;
  action: string;
  pr_numbers: number[];
  details: unknown;
  policy_rule_id?: string | null;
  comment_body?: string | null;
}

export type AuditAction =
  | "review_posted"
  | "review_completed"
  | "polish_applied"
  | "pr_closed"
  | "pr_consolidated"
  | "policy_violation"
  | "auto_comment_drafted"
  | "auto_comment_sent"
  | "auto_comment_dismissed"
  | "bulk_action";
