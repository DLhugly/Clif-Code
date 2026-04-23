//! Local-first decision log + explicit "push to GitHub" label sync.
//!
//! Module layout:
//!   - schema.rs    — Decision, DecisionKind, SyncPlan, canonical label names
//!   - decisions.rs — append-only .clif/decisions.jsonl read/write
//!   - target.rs    — fold decisions into target label set
//!   - apply.rs     — compute plan, execute via `gh pr edit`, bootstrap labels

mod apply;
mod decisions;
mod schema;
mod target;

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::commands::review::audit::{record as audit_record, AuditEntry};

pub use schema::{Decision, DecisionKind, PrSyncState, SyncPlan, SyncResult};

fn now_epoch() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn new_decision_id() -> String {
    format!("dec_{}", uuid::Uuid::new_v4().simple())
}

// ---------------------------------------------------------------------------
// Input DTO for recording decisions from the frontend.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordDecisionInput {
    pub pr_number: i64,
    pub kind: DecisionKind,
    #[serde(default)]
    pub tier: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn sync_record_decision(
    workspace_dir: String,
    input: RecordDecisionInput,
) -> Result<Decision, String> {
    let decision = Decision {
        id: new_decision_id(),
        pr_number: input.pr_number,
        kind: input.kind,
        created_at: now_epoch(),
        tier: input.tier,
        note: input.note,
        synced_at: None,
        sync_error: None,
    };
    decisions::append(&workspace_dir, &decision)?;
    Ok(decision)
}

#[tauri::command]
pub fn sync_list_decisions(
    workspace_dir: String,
    pr_number: Option<i64>,
) -> Result<Vec<Decision>, String> {
    let decisions = match pr_number {
        Some(n) => decisions::read_for_pr(&workspace_dir, n),
        None => decisions::read_all(&workspace_dir),
    };
    Ok(decisions)
}

#[tauri::command]
pub fn sync_pending_prs(workspace_dir: String) -> Result<Vec<i64>, String> {
    Ok(decisions::prs_with_pending_decisions(&workspace_dir))
}

#[tauri::command]
pub async fn sync_preview(
    workspace_dir: String,
    pr_numbers: Option<Vec<i64>>,
) -> Result<Vec<SyncPlan>, String> {
    let targets = match pr_numbers {
        Some(list) if !list.is_empty() => list,
        _ => {
            // Default: every PR with at least one unsynced decision
            decisions::prs_with_pending_decisions(&workspace_dir)
        }
    };
    if targets.is_empty() {
        return Ok(Vec::new());
    }

    let mut joins: Vec<
        tokio::task::JoinHandle<Result<SyncPlan, String>>,
    > = Vec::with_capacity(targets.len());
    for n in targets {
        let ws = workspace_dir.clone();
        joins.push(tokio::spawn(async move {
            apply::plan_for(&ws, n).await
        }));
    }

    let mut plans = Vec::new();
    for j in joins {
        match j.await {
            Ok(Ok(p)) => plans.push(p),
            Ok(Err(e)) => {
                plans.push(SyncPlan {
                    pr_number: 0,
                    current_labels: Vec::new(),
                    target_labels: Vec::new(),
                    add: Vec::new(),
                    remove: Vec::new(),
                    skipped_reason: Some(e),
                });
            }
            Err(_) => continue,
        }
    }
    Ok(plans)
}

#[tauri::command]
pub async fn sync_apply(
    workspace_dir: String,
    pr_numbers: Option<Vec<i64>>,
) -> Result<Vec<SyncResult>, String> {
    let plans = sync_preview(workspace_dir.clone(), pr_numbers).await?;
    let plans: Vec<SyncPlan> = plans
        .into_iter()
        .filter(|p| !p.is_noop() && p.skipped_reason.is_none())
        .collect();

    if plans.is_empty() {
        return Ok(Vec::new());
    }

    let mut results = Vec::with_capacity(plans.len());
    // Serial apply to avoid hammering gh / hitting secondary rate limits.
    for plan in plans {
        let r = apply::apply_plan(&workspace_dir, &plan).await;
        audit_sync_result(&workspace_dir, &r);
        results.push(r);
    }

    // Bookkeeping: mark synced / error in the decisions log.
    let ok_prs: Vec<i64> = results.iter().filter(|r| r.ok).map(|r| r.pr_number).collect();
    if !ok_prs.is_empty() {
        let _ = decisions::mark_synced_for_prs(&workspace_dir, &ok_prs, now_epoch());
    }
    for r in results.iter().filter(|r| !r.ok) {
        if let Some(err) = r.error.as_deref() {
            let _ = decisions::mark_error_for_prs(&workspace_dir, &[r.pr_number], err);
        }
    }
    Ok(results)
}

fn audit_sync_result(workspace_dir: &str, result: &SyncResult) {
    let action = if result.ok {
        "sync_labels_pushed"
    } else {
        "sync_labels_failed"
    };
    let mut details = json!({
        "add": result.applied_add,
        "remove": result.applied_remove,
    });
    if let Some(err) = result.error.as_deref() {
        if let Some(obj) = details.as_object_mut() {
            obj.insert("error".into(), json!(err));
        }
    }
    audit_record(
        workspace_dir,
        AuditEntry::new(action)
            .with_pr(result.pr_number)
            .with_details(details),
    );
}

#[tauri::command]
pub async fn sync_status(
    workspace_dir: String,
    pr_number: i64,
) -> Result<PrSyncState, String> {
    let decisions = decisions::read_for_pr(&workspace_dir, pr_number);
    let target = target::compute_target(&decisions);
    let current = apply::fetch_current_labels(&workspace_dir, pr_number)
        .await
        .unwrap_or_default();

    let current_managed: std::collections::BTreeSet<String> = current
        .into_iter()
        .filter(|l| schema::is_managed_label(l))
        .collect();
    let target_set: std::collections::BTreeSet<String> = target.labels.iter().cloned().collect();

    if decisions.is_empty() && current_managed.is_empty() {
        return Ok(PrSyncState::Untouched);
    }
    let has_unsynced = decisions.iter().any(|d| d.synced_at.is_none());
    if current_managed == target_set && !has_unsynced {
        Ok(PrSyncState::InSync)
    } else if has_unsynced || current_managed != target_set {
        // If there are managed labels on remote but no local decisions, call it diverged.
        if decisions.is_empty() && !current_managed.is_empty() {
            Ok(PrSyncState::Diverged)
        } else {
            Ok(PrSyncState::Pending)
        }
    } else {
        Ok(PrSyncState::InSync)
    }
}

#[tauri::command]
pub async fn sync_bootstrap_labels(workspace_dir: String) -> Result<Vec<String>, String> {
    apply::bootstrap_labels(&workspace_dir).await
}
