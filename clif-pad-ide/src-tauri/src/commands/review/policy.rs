use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};

use super::audit::{self, AuditEntry};
use super::auto_comment::{self, draft_comment};
use super::driver::{GhCliDriver, ReviewDriver};
use super::engine::load_result;
use super::rules::{load_review_config, matches_glob, ReviewConfig};
use super::schema::{Category, Finding, ReviewResult, Severity};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PolicyTrigger {
    HasFinding {
        category: Option<Category>,
        #[serde(default)]
        min_severity: Option<Severity>,
    },
    MustCover {
        when_touches: Vec<String>,
        require_touches: Vec<String>,
    },
    MustNotTouch {
        paths: Vec<String>,
    },
    SizeLimit {
        #[serde(default)]
        max_added: Option<u32>,
        #[serde(default)]
        max_deleted: Option<u32>,
    },
    AuthorQuota {
        max_open: u32,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Policy {
    pub id: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub required: bool,
    pub trigger: PolicyTrigger,
    pub template: String,
    #[serde(default)]
    pub auto_post: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyResult {
    pub policy_id: String,
    pub required: bool,
    pub passed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    pub template: String,
    pub auto_post: bool,
    pub variables: HashMap<String, String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PrContextMetrics {
    pub pr_number: i64,
    pub author: String,
    pub title: String,
    pub touched_files: Vec<String>,
    pub lines_added: u32,
    pub lines_deleted: u32,
    pub author_open_prs: u32,
}

fn severity_at_least(s: Severity, threshold: Severity) -> bool {
    let rank = |x: Severity| -> u8 {
        match x {
            Severity::Critical => 0,
            Severity::High => 1,
            Severity::Medium => 2,
            Severity::Low => 3,
            Severity::Nit => 4,
        }
    };
    rank(s) <= rank(threshold)
}

pub fn evaluate_policies(
    config: &ReviewConfig,
    review: Option<&ReviewResult>,
    ctx: &PrContextMetrics,
) -> Vec<PolicyResult> {
    let mut out = Vec::new();
    for p in &config.policies {
        let (passed, reason, mut variables) = eval_one(&p.trigger, review, ctx);
        variables.insert("rule_id".into(), p.id.clone());
        variables.insert("description".into(), p.description.clone());
        variables.insert("pr_number".into(), ctx.pr_number.to_string());
        variables.insert("author".into(), ctx.author.clone());
        if let Some(r) = &reason {
            variables.insert("reason".into(), r.clone());
        }
        out.push(PolicyResult {
            policy_id: p.id.clone(),
            required: p.required,
            passed,
            reason,
            template: p.template.clone(),
            auto_post: p.auto_post,
            variables,
        });
    }
    out
}

fn eval_one(
    trigger: &PolicyTrigger,
    review: Option<&ReviewResult>,
    ctx: &PrContextMetrics,
) -> (bool, Option<String>, HashMap<String, String>) {
    let mut vars = HashMap::new();
    match trigger {
        PolicyTrigger::HasFinding { category, min_severity } => {
            let findings: &[Finding] = review.map(|r| r.findings.as_slice()).unwrap_or(&[]);
            let mut matching = Vec::new();
            for f in findings {
                if f.dismissed {
                    continue;
                }
                if let Some(c) = category {
                    if f.category != *c {
                        continue;
                    }
                }
                if let Some(sev) = min_severity {
                    if !severity_at_least(f.severity, *sev) {
                        continue;
                    }
                }
                matching.push(f);
            }
            if matching.is_empty() {
                (true, None, vars)
            } else {
                let first = matching[0];
                vars.insert("finding_path".into(), first.path.clone());
                vars.insert("finding_line".into(), first.line_start.to_string());
                let msg = format!(
                    "{} finding(s) matched{}",
                    matching.len(),
                    category
                        .as_ref()
                        .map(|c| format!(" in {:?}", c).to_lowercase())
                        .unwrap_or_default(),
                );
                (false, Some(msg), vars)
            }
        }
        PolicyTrigger::MustCover { when_touches, require_touches } => {
            let triggers = ctx
                .touched_files
                .iter()
                .any(|f| when_touches.iter().any(|g| matches_glob(g, f)));
            if !triggers {
                return (true, None, vars);
            }
            let covered = ctx
                .touched_files
                .iter()
                .any(|f| require_touches.iter().any(|g| matches_glob(g, f)));
            if covered {
                (true, None, vars)
            } else {
                (
                    false,
                    Some(format!(
                        "Source changes in {:?} require test changes in {:?}",
                        when_touches, require_touches
                    )),
                    vars,
                )
            }
        }
        PolicyTrigger::MustNotTouch { paths } => {
            let offenders: Vec<&String> = ctx
                .touched_files
                .iter()
                .filter(|f| paths.iter().any(|g| matches_glob(g, f)))
                .collect();
            if offenders.is_empty() {
                (true, None, vars)
            } else {
                vars.insert("offender".into(), offenders[0].clone());
                (
                    false,
                    Some(format!(
                        "Touches protected path(s): {}",
                        offenders.iter().take(3).map(|s| s.as_str()).collect::<Vec<_>>().join(", ")
                    )),
                    vars,
                )
            }
        }
        PolicyTrigger::SizeLimit { max_added, max_deleted } => {
            vars.insert("added".into(), ctx.lines_added.to_string());
            vars.insert("deleted".into(), ctx.lines_deleted.to_string());
            if let Some(cap) = max_added {
                if ctx.lines_added > *cap {
                    return (
                        false,
                        Some(format!(
                            "+{} lines exceeds the +{} soft limit",
                            ctx.lines_added, cap
                        )),
                        vars,
                    );
                }
            }
            if let Some(cap) = max_deleted {
                if ctx.lines_deleted > *cap {
                    return (
                        false,
                        Some(format!(
                            "-{} lines exceeds the -{} soft limit",
                            ctx.lines_deleted, cap
                        )),
                        vars,
                    );
                }
            }
            (true, None, vars)
        }
        PolicyTrigger::AuthorQuota { max_open } => {
            vars.insert("count".into(), ctx.author_open_prs.to_string());
            vars.insert("limit".into(), max_open.to_string());
            if ctx.author_open_prs > *max_open {
                (
                    false,
                    Some(format!(
                        "Author has {} open PRs, limit {}",
                        ctx.author_open_prs, max_open
                    )),
                    vars,
                )
            } else {
                (true, None, vars)
            }
        }
    }
}

pub fn collect_touched_files(diff: &str) -> Vec<String> {
    let mut out = Vec::new();
    for line in diff.lines() {
        if let Some(rest) = line.strip_prefix("+++ b/") {
            out.push(rest.trim().to_string());
        }
    }
    out
}

pub fn size_from_diff(diff: &str) -> (u32, u32) {
    let mut added = 0u32;
    let mut deleted = 0u32;
    for line in diff.lines() {
        if line.starts_with("+") && !line.starts_with("+++") {
            added += 1;
        } else if line.starts_with("-") && !line.starts_with("---") {
            deleted += 1;
        }
    }
    (added, deleted)
}

/// Full post-review orchestration: run policies, emit events, draft pending
/// comments for violations, auto-send those whose template opted in.
pub async fn run_policies_and_draft(
    app: &AppHandle,
    workspace_dir: &str,
    pr_number: i64,
) -> Result<Vec<PolicyResult>, String> {
    let config = load_review_config(workspace_dir);
    if config.policies.is_empty() {
        return Ok(Vec::new());
    }

    let review = load_result(workspace_dir, pr_number);

    let driver = GhCliDriver::new(workspace_dir.to_string());
    let pr = driver.fetch_pr(pr_number).ok();
    let diff = driver.fetch_diff(pr_number).unwrap_or_default();
    let touched = collect_touched_files(&diff);
    let (added, deleted) = size_from_diff(&diff);

    let author = pr.as_ref().map(|p| p.author.clone()).unwrap_or_default();
    let author_open = count_open_prs_for(workspace_dir, &author).unwrap_or(0);

    let ctx = PrContextMetrics {
        pr_number,
        author: author.clone(),
        title: pr.as_ref().map(|p| p.title.clone()).unwrap_or_default(),
        touched_files: touched,
        lines_added: added,
        lines_deleted: deleted,
        author_open_prs: author_open,
    };

    let results = evaluate_policies(&config, review.as_ref(), &ctx);

    for r in &results {
        let _ = app.emit(
            "pr_policy_result",
            serde_json::json!({ "pr_number": pr_number, "result": r }),
        );
        if !r.passed {
            audit::record(
                workspace_dir,
                AuditEntry::new("policy_violation")
                    .with_pr(pr_number)
                    .with_rule(&r.policy_id)
                    .with_details(serde_json::json!({ "reason": r.reason })),
            );
            if let Ok(comment) = draft_comment(
                workspace_dir,
                &config,
                pr_number,
                &author,
                &r.template,
                r.variables.clone(),
                Some(r.policy_id.clone()),
            ) {
                audit::record(
                    workspace_dir,
                    AuditEntry::new("auto_comment_drafted")
                        .with_pr(pr_number)
                        .with_rule(&r.policy_id)
                        .with_comment(&comment.body),
                );
                let _ = app.emit("pending_comment_drafted", &comment);

                if comment.auto_post {
                    if let Err(e) =
                        auto_comment::post_comment(workspace_dir, pr_number, &comment.body)
                    {
                        log::warn!("auto-post failed: {}", e);
                    } else {
                        let _ = auto_comment::remove_pending(workspace_dir, &comment.id);
                        audit::record(
                            workspace_dir,
                            AuditEntry::new("auto_comment_sent")
                                .with_pr(pr_number)
                                .with_rule(&r.policy_id)
                                .with_comment(&comment.body),
                        );
                        let _ = app.emit("pending_comment_sent", &comment);
                    }
                }
            }
        }
    }
    Ok(results)
}

fn count_open_prs_for(workspace_dir: &str, author: &str) -> Option<u32> {
    if author.is_empty() {
        return None;
    }
    let mut cmd = crate::commands::gh::gh_std_command().ok()?;
    let out = cmd
        .args([
            "pr",
            "list",
            "--state",
            "open",
            "--author",
            author,
            "--json",
            "number",
            "--limit",
            "100",
        ])
        .current_dir(workspace_dir)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let v: serde_json::Value = serde_json::from_slice(&out.stdout).ok()?;
    v.as_array().map(|a| a.len() as u32)
}
