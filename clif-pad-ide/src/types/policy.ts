export interface PolicyResult {
  policy_id: string;
  required: boolean;
  passed: boolean;
  reason?: string | null;
  template: string;
  auto_post: boolean;
  variables: Record<string, string>;
}

export interface PendingComment {
  id: string;
  pr_number: number;
  author: string;
  template_id: string;
  body: string;
  created_at: string;
  auto_post: boolean;
  rule_id?: string | null;
}
