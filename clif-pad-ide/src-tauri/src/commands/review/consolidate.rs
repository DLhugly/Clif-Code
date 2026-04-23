use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tokio::process::Command;
use uuid::Uuid;

use crate::commands::gh::{augmented_path, gh_command, gh_std_command};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectedCommit {
    pub pr_number: i64,
    pub oid: String,
    pub include: bool,
    pub reorder_index: u32,
    pub author: String,
    pub message_headline: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsolidationPlan {
    pub plan_id: String,
    pub source_prs: Vec<i64>,
    pub commits: Vec<SelectedCommit>,
    pub new_branch: String,
    pub new_title: String,
    pub new_body: String,
    pub close_sources: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsolidationResult {
    pub plan_id: String,
    pub new_branch: String,
    pub new_pr_url: Option<String>,
    pub new_pr_number: Option<i64>,
    pub commits_applied: u32,
    pub failed_commits: Vec<String>,
}

pub fn plan_consolidation(
    workspace_dir: &str,
    source_prs: Vec<i64>,
) -> Result<ConsolidationPlan, String> {
    if source_prs.len() < 2 {
        return Err("Consolidation requires at least 2 source PRs.".to_string());
    }

    // Gather commits from each source PR in order
    let mut commits: Vec<SelectedCommit> = Vec::new();
    let mut reorder: u32 = 0;
    for n in &source_prs {
        let mut cmd = gh_std_command()?;
        let out = cmd
            .args(["pr", "view", &n.to_string(), "--json", "commits"])
            .current_dir(workspace_dir)
            .output()
            .map_err(|e| format!("gh pr view: {}", e))?;
        if !out.status.success() {
            return Err(format!(
                "gh pr view {} failed: {}",
                n,
                String::from_utf8_lossy(&out.stderr)
            ));
        }
        let v: serde_json::Value = serde_json::from_slice(&out.stdout)
            .map_err(|e| format!("parse commits: {}", e))?;
        if let Some(arr) = v.get("commits").and_then(|x| x.as_array()) {
            for c in arr {
                let oid = c.get("oid").and_then(|x| x.as_str()).unwrap_or("").to_string();
                let msg = c
                    .get("messageHeadline")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string();
                let author = c
                    .pointer("/authors/0/name")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string();
                if oid.is_empty() {
                    continue;
                }
                commits.push(SelectedCommit {
                    pr_number: *n,
                    oid,
                    include: true,
                    reorder_index: reorder,
                    author,
                    message_headline: msg,
                });
                reorder += 1;
            }
        }
    }

    let stamp = chrono_stamp();
    let slug = source_prs
        .iter()
        .map(|n| format!("{}", n))
        .collect::<Vec<_>>()
        .join("-");
    let new_branch = format!("clif/consolidated/{}-prs-{}", stamp, slug);
    let new_title = format!(
        "consolidate: PR{} {}",
        if source_prs.len() == 1 { "" } else { "s" },
        source_prs
            .iter()
            .map(|n| format!("#{}", n))
            .collect::<Vec<_>>()
            .join(", ")
    );
    let new_body = format!(
        "Consolidation of {} source PR{}:\n\n{}\n\nAuthorship is preserved on each commit.\n\n— Clif Review",
        source_prs.len(),
        if source_prs.len() == 1 { "" } else { "s" },
        source_prs
            .iter()
            .map(|n| format!("- #{}", n))
            .collect::<Vec<_>>()
            .join("\n")
    );

    Ok(ConsolidationPlan {
        plan_id: Uuid::new_v4().to_string(),
        source_prs,
        commits,
        new_branch,
        new_title,
        new_body,
        close_sources: false,
    })
}

pub async fn apply_consolidation(
    workspace_dir: &str,
    plan: &ConsolidationPlan,
) -> Result<ConsolidationResult, String> {
    // 1. Determine base branch from first source PR
    let first = plan.source_prs.first().ok_or("empty source list")?;
    let base = fetch_base_ref(workspace_dir, *first)?;

    // 2. Ensure we're up to date and create new branch from base
    let _ = run(
        workspace_dir,
        &["git", "fetch", "origin", &base],
    )
    .await;
    run(
        workspace_dir,
        &[
            "git",
            "checkout",
            "-b",
            &plan.new_branch,
            &format!("origin/{}", base),
        ],
    )
    .await?;

    // 3. Cherry-pick each included commit in order, preserving original authorship.
    let mut applied = 0u32;
    let mut failures: Vec<String> = Vec::new();
    let mut ordered = plan.commits.clone();
    ordered.retain(|c| c.include);
    ordered.sort_by_key(|c| c.reorder_index);

    for c in &ordered {
        // Fetch the PR ref so we have the commit available locally.
        let ref_name = format!("refs/pull/{}/head:clif/cherry/pr-{}", c.pr_number, c.pr_number);
        let _ = run(workspace_dir, &["git", "fetch", "origin", &ref_name]).await;

        let res = run(
            workspace_dir,
            &["git", "cherry-pick", "-x", &c.oid],
        )
        .await;
        match res {
            Ok(_) => {
                applied += 1;
            }
            Err(e) => {
                // Abort the cherry-pick if it entered conflict state
                let _ = run(workspace_dir, &["git", "cherry-pick", "--abort"]).await;
                failures.push(format!("{} ({}): {}", &c.oid[..c.oid.len().min(7)], c.message_headline, e));
            }
        }
    }

    if applied == 0 {
        // Checkout back to previous branch before bailing
        let _ = run(workspace_dir, &["git", "checkout", "-"]).await;
        return Err(format!(
            "No commits applied. Failures: {}",
            failures.join("; ")
        ));
    }

    // 4. Push the new branch
    let _ = run(
        workspace_dir,
        &["git", "push", "-u", "origin", &plan.new_branch],
    )
    .await;

    // 5. Open a PR via gh
    let mut cmd = gh_command()?;
    let out = cmd
        .args([
            "pr",
            "create",
            "--title",
            &plan.new_title,
            "--body",
            &plan.new_body,
            "--base",
            &base,
            "--head",
            &plan.new_branch,
        ])
        .current_dir(workspace_dir)
        .output()
        .await
        .map_err(|e| format!("gh pr create failed: {}", e))?;

    let (new_url, new_number) = if out.status.success() {
        let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
        let number = parse_pr_number_from_url(&stdout);
        (Some(stdout), number)
    } else {
        (None, None)
    };

    Ok(ConsolidationResult {
        plan_id: plan.plan_id.clone(),
        new_branch: plan.new_branch.clone(),
        new_pr_url: new_url,
        new_pr_number: new_number,
        commits_applied: applied,
        failed_commits: failures,
    })
}

fn fetch_base_ref(workspace_dir: &str, pr_number: i64) -> Result<String, String> {
    let mut cmd = gh_std_command()?;
    let out = cmd
        .args([
            "pr",
            "view",
            &pr_number.to_string(),
            "--json",
            "baseRefName",
        ])
        .current_dir(workspace_dir)
        .output()
        .map_err(|e| format!("gh pr view failed: {}", e))?;
    if !out.status.success() {
        return Err(format!(
            "gh pr view baseRefName failed: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    let v: serde_json::Value = serde_json::from_slice(&out.stdout)
        .map_err(|e| format!("parse baseRefName: {}", e))?;
    Ok(v.get("baseRefName")
        .and_then(|x| x.as_str())
        .unwrap_or("main")
        .to_string())
}

fn parse_pr_number_from_url(url: &str) -> Option<i64> {
    url.split('/').last().and_then(|s| s.parse().ok())
}

async fn run(dir: &str, args: &[&str]) -> Result<(), String> {
    let (cmd, rest) = args.split_first().ok_or("empty command")?;
    let out = Command::new(cmd)
        .args(rest)
        .env("PATH", augmented_path())
        .current_dir(dir)
        .output()
        .await
        .map_err(|e| format!("spawn {}: {}", cmd, e))?;
    if !out.status.success() {
        return Err(format!(
            "{}: {}",
            cmd,
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    Ok(())
}

fn chrono_stamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{}", secs)
}

pub fn _unused_path_sanity(_p: &Path) -> PathBuf {
    PathBuf::new()
}
