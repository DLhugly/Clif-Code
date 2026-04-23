//! Execute sync plans against GitHub via `gh pr edit` and `gh pr view`.

use std::collections::BTreeSet;

use crate::commands::gh::gh_command;

use super::decisions::read_for_pr;
use super::schema::{is_managed_label, SyncPlan, SyncResult, ALL_MANAGED_LABELS};
use super::target::compute_target;

/// Fetch current labels for a PR via `gh pr view --json labels`.
pub async fn fetch_current_labels(workspace_dir: &str, pr_number: i64) -> Result<Vec<String>, String> {
    let mut cmd = gh_command()?;
    let out = cmd
        .arg("pr")
        .arg("view")
        .arg(pr_number.to_string())
        .arg("--json")
        .arg("labels")
        .current_dir(workspace_dir)
        .output()
        .await
        .map_err(|e| format!("gh pr view failed: {}", e))?;
    if !out.status.success() {
        return Err(format!(
            "gh pr view failed: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    let v: serde_json::Value =
        serde_json::from_slice(&out.stdout).map_err(|e| format!("parse labels json: {}", e))?;
    let names = v
        .get("labels")
        .and_then(|arr| arr.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|l| l.get("name").and_then(|n| n.as_str()).map(String::from))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    Ok(names)
}

/// Compute a sync plan for a single PR. Does not mutate remote.
pub async fn plan_for(workspace_dir: &str, pr_number: i64) -> Result<SyncPlan, String> {
    let decisions = read_for_pr(workspace_dir, pr_number);
    let target = compute_target(&decisions);
    let current = fetch_current_labels(workspace_dir, pr_number).await.unwrap_or_default();

    let current_managed: BTreeSet<String> = current
        .iter()
        .filter(|l| is_managed_label(l))
        .cloned()
        .collect();
    let target_set: BTreeSet<String> = target.labels.iter().cloned().collect();

    let add: Vec<String> = target_set.difference(&current_managed).cloned().collect();
    let remove: Vec<String> = current_managed.difference(&target_set).cloned().collect();

    Ok(SyncPlan {
        pr_number,
        current_labels: current,
        target_labels: target_set.into_iter().collect(),
        add,
        remove,
        skipped_reason: None,
    })
}

/// Apply a plan. Safe to call with a no-op plan — returns `ok=true` with
/// empty applied vectors.
pub async fn apply_plan(workspace_dir: &str, plan: &SyncPlan) -> SyncResult {
    if plan.is_noop() {
        return SyncResult {
            pr_number: plan.pr_number,
            applied_add: Vec::new(),
            applied_remove: Vec::new(),
            ok: true,
            error: None,
        };
    }

    let mut args: Vec<String> = vec![
        "pr".into(),
        "edit".into(),
        plan.pr_number.to_string(),
    ];
    for lbl in &plan.add {
        args.push("--add-label".into());
        args.push(lbl.clone());
    }
    for lbl in &plan.remove {
        // Only remove labels that are in the managed namespace. `apply.rs`
        // upstream filters but defense-in-depth: skip unexpected ones.
        if !is_managed_label(lbl) {
            continue;
        }
        args.push("--remove-label".into());
        args.push(lbl.clone());
    }

    let mut cmd = match gh_command() {
        Ok(c) => c,
        Err(e) => {
            return SyncResult {
                pr_number: plan.pr_number,
                applied_add: Vec::new(),
                applied_remove: Vec::new(),
                ok: false,
                error: Some(e),
            }
        }
    };
    for a in &args {
        cmd.arg(a);
    }
    cmd.current_dir(workspace_dir);

    match cmd.output().await {
        Ok(out) if out.status.success() => SyncResult {
            pr_number: plan.pr_number,
            applied_add: plan.add.clone(),
            applied_remove: plan.remove.clone(),
            ok: true,
            error: None,
        },
        Ok(out) => {
            let err = String::from_utf8_lossy(&out.stderr).to_string();
            SyncResult {
                pr_number: plan.pr_number,
                applied_add: Vec::new(),
                applied_remove: Vec::new(),
                ok: false,
                error: Some(parse_gh_label_error(&err)),
            }
        }
        Err(e) => SyncResult {
            pr_number: plan.pr_number,
            applied_add: Vec::new(),
            applied_remove: Vec::new(),
            ok: false,
            error: Some(format!("gh pr edit failed: {}", e)),
        },
    }
}

/// Try to surface a useful error when gh fails. Most common case: the label
/// doesn't exist in the repo yet.
fn parse_gh_label_error(stderr: &str) -> String {
    let lower = stderr.to_lowercase();
    if lower.contains("could not add label") || lower.contains("not found") {
        format!(
            "gh pr edit failed: a Clif label is missing from the repo. Create the labels once via\n\
             gh label create clif/tier-t1 --color 22c55e --force (and t2..t5, ready-to-merge, etc.)\n\
             or run the built-in bootstrap. Raw: {}",
            stderr.trim()
        )
    } else {
        format!("gh pr edit failed: {}", stderr.trim())
    }
}

/// Create all managed labels in the repo if they are missing. Idempotent.
pub async fn bootstrap_labels(workspace_dir: &str) -> Result<Vec<String>, String> {
    let created = {
        let mut created = Vec::new();
        for lbl in ALL_MANAGED_LABELS {
            let color = color_for(lbl);
            let description = description_for(lbl);
            let mut cmd = gh_command()?;
            cmd.arg("label")
                .arg("create")
                .arg(lbl)
                .arg("--color")
                .arg(color)
                .arg("--description")
                .arg(description)
                .arg("--force")
                .current_dir(workspace_dir);
            let out = cmd
                .output()
                .await
                .map_err(|e| format!("gh label create {} failed: {}", lbl, e))?;
            if out.status.success() {
                created.push((*lbl).to_string());
            }
        }
        created
    };
    Ok(created)
}

fn color_for(label: &str) -> &'static str {
    match label {
        "clif/tier-t1" => "22c55e",
        "clif/tier-t2" => "38bdf8",
        "clif/tier-t3" => "eab308",
        "clif/tier-t4" => "f97316",
        "clif/tier-t5" => "ef4444",
        "clif/ready-to-merge" => "16a34a",
        "clif/kicked-back" => "f59e0b",
        "clif/reviewed" => "a78bfa",
        "clif/needs-policy" => "f87171",
        "clif/polished" => "34d399",
        "clif/blocked" => "dc2626",
        _ => "6b7280",
    }
}

fn description_for(label: &str) -> &'static str {
    match label {
        "clif/tier-t1" => "Clif: Tier 1 — trivial change",
        "clif/tier-t2" => "Clif: Tier 2 — small change",
        "clif/tier-t3" => "Clif: Tier 3 — standard review",
        "clif/tier-t4" => "Clif: Tier 4 — significant change",
        "clif/tier-t5" => "Clif: Tier 5 — halt, requires lead override",
        "clif/ready-to-merge" => "Clif: lead marked ready to merge",
        "clif/kicked-back" => "Clif: kicked back to author",
        "clif/reviewed" => "Clif: lead completed a review pass",
        "clif/needs-policy" => "Clif: required policy violations",
        "clif/polished" => "Clif: polish pipeline applied",
        "clif/blocked" => "Clif: hard-override block (secrets, destructive SQL, breaking change)",
        _ => "Clif-managed label",
    }
}
