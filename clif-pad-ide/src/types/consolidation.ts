export interface SelectedCommit {
  pr_number: number;
  oid: string;
  include: boolean;
  reorder_index: number;
  author: string;
  message_headline: string;
}

export interface ConsolidationPlan {
  plan_id: string;
  source_prs: number[];
  commits: SelectedCommit[];
  new_branch: string;
  new_title: string;
  new_body: string;
  close_sources: boolean;
}

export interface ConsolidationResult {
  plan_id: string;
  new_branch: string;
  new_pr_url: string | null;
  new_pr_number: number | null;
  commits_applied: number;
  failed_commits: string[];
}
