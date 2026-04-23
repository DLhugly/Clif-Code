mod audit;
mod auto_comment;
mod classifier;
mod consolidate;
mod driver;
mod engine;
mod policy;
mod polish;
mod poster;
mod rules;
mod schema;
mod similarity;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde_json::json;
use tauri::{AppHandle, Emitter};

use audit::{list_entries, AuditEntry};
use auto_comment::{draft_comment, list_pending, PendingComment};
use consolidate::{apply_consolidation, plan_consolidation, ConsolidationPlan, ConsolidationResult};
use driver::{fetch_pr_diff_async, GhCliDriver, PostedAction, ReviewDriver};
use engine::{list_cached, load_result, run_review, save_result, ReviewSettings};
use policy::{run_policies_and_draft, PolicyResult};
use polish::{apply_polish, plan_polish};
use rules::load_review_config;
use schema::{PolishApplyReport, PolishMode, PolishPlan, ReviewResult};
use similarity::{gather_basics, related_for, PrBasics, RelatedPr};

/// Active review sessions; one entry per PR currently running.
static RUNNING_REVIEWS: std::sync::LazyLock<
    Arc<Mutex<HashMap<i64, tokio::sync::oneshot::Sender<()>>>>,
> = std::sync::LazyLock::new(|| Arc::new(Mutex::new(HashMap::new())));

/// Cached polish plans keyed by plan_id so apply can find them later.
static CACHED_PLANS: std::sync::LazyLock<Arc<Mutex<HashMap<String, PolishPlan>>>> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(HashMap::new())));

fn load_api_key_for(provider: &str) -> Option<String> {
    let home = std::env::var("HOME").ok()?;
    let keys_path = format!("{}/.clif/api_keys.json", home);
    let content = std::fs::read_to_string(keys_path).ok()?;
    let keys: serde_json::Value = serde_json::from_str(&content).ok()?;
    keys.get(provider).and_then(|k| k.as_str()).map(|s| s.to_string())
}

#[tauri::command]
pub async fn pr_fetch_diff(workspace_dir: String, pr_number: i64) -> Result<String, String> {
    fetch_pr_diff_async(&workspace_dir, pr_number).await
}

#[tauri::command]
pub async fn pr_review_run(
    app: AppHandle,
    workspace_dir: String,
    pr_number: i64,
    model: Option<String>,
    api_key: Option<String>,
    provider: Option<String>,
) -> Result<(), String> {
    let provider = provider.unwrap_or_else(|| "openrouter".to_string());
    let resolved_model = model.unwrap_or_else(|| match provider.as_str() {
        "ollama" => "qwen2.5-coder".to_string(),
        _ => "anthropic/claude-sonnet-4".to_string(),
    });
    let resolved_key = api_key.or_else(|| load_api_key_for(&provider));

    let settings = ReviewSettings {
        model: resolved_model,
        api_key: resolved_key,
        provider,
    };

    let (cancel_tx, _cancel_rx) = tokio::sync::oneshot::channel::<()>();
    {
        let mut running = RUNNING_REVIEWS.lock().map_err(|e| e.to_string())?;
        running.insert(pr_number, cancel_tx);
    }

    let app_for_task = app.clone();
    let workspace = workspace_dir.clone();
    tokio::spawn(async move {
        let driver = GhCliDriver::new(workspace.clone());
        let config = load_review_config(&workspace);

        let pr = match driver.fetch_pr(pr_number) {
            Ok(p) => p,
            Err(e) => {
                let _ = app_for_task.emit(
                    "pr_review_error",
                    json!({ "pr_number": pr_number, "error": e }),
                );
                let mut running = RUNNING_REVIEWS.lock().unwrap_or_else(|e| e.into_inner());
                running.remove(&pr_number);
                return;
            }
        };

        let app_emit = app_for_task.clone();
        let emit = move |event: engine::ReviewEvent| match event {
            engine::ReviewEvent::Started => {
                let _ = app_emit.emit(
                    "pr_review_started",
                    json!({ "pr_number": pr_number }),
                );
            }
            engine::ReviewEvent::Progress(stage) => {
                let _ = app_emit.emit(
                    "pr_review_progress",
                    json!({ "pr_number": pr_number, "stage": stage }),
                );
            }
            engine::ReviewEvent::Finding(f) => {
                let _ = app_emit.emit(
                    "pr_review_finding",
                    json!({ "pr_number": pr_number, "finding": f }),
                );
            }
            engine::ReviewEvent::Done(result) => {
                if let Err(e) = save_result(&workspace, &result) {
                    let _ = app_emit.emit(
                        "pr_review_error",
                        json!({ "pr_number": pr_number, "error": format!("save cache: {}", e) }),
                    );
                }
                audit::record(
                    &workspace,
                    AuditEntry::new("review_completed")
                        .with_pr(pr_number)
                        .with_details(json!({
                            "findings": result.findings.len(),
                            "risk_score": result.risk_score,
                        })),
                );
                let _ = app_emit.emit("pr_review_done", &result);
                // Fire-and-forget policy evaluation (also drafts pending comments)
                let app_for_policy = app_emit.clone();
                let ws_for_policy = workspace.clone();
                tokio::spawn(async move {
                    let _ = run_policies_and_draft(&app_for_policy, &ws_for_policy, pr_number).await;
                });
            }
            engine::ReviewEvent::Error(err) => {
                let _ = app_emit.emit(
                    "pr_review_error",
                    json!({ "pr_number": pr_number, "error": err }),
                );
            }
        };

        run_review(&driver, &config, &pr, &settings, emit).await;

        let mut running = RUNNING_REVIEWS.lock().unwrap_or_else(|e| e.into_inner());
        running.remove(&pr_number);
    });

    Ok(())
}

#[tauri::command]
pub async fn pr_review_stop(pr_number: i64) -> Result<(), String> {
    let mut running = RUNNING_REVIEWS.lock().map_err(|e| e.to_string())?;
    if let Some(tx) = running.remove(&pr_number) {
        let _ = tx.send(());
    }
    Ok(())
}

#[tauri::command]
pub async fn pr_review_get(
    workspace_dir: String,
    pr_number: i64,
) -> Result<Option<ReviewResult>, String> {
    Ok(load_result(&workspace_dir, pr_number))
}

#[tauri::command]
pub async fn pr_review_list(workspace_dir: String) -> Result<Vec<ReviewResult>, String> {
    Ok(list_cached(&workspace_dir))
}

#[tauri::command]
pub async fn pr_review_post(
    workspace_dir: String,
    pr_number: i64,
    action: String,
    body: String,
) -> Result<(), String> {
    let parsed: PostedAction = poster::parse_action(&action)?;
    poster::post_review(&workspace_dir, pr_number, parsed, &body)?;
    audit::record(
        &workspace_dir,
        AuditEntry::new("review_posted")
            .with_pr(pr_number)
            .with_details(serde_json::json!({ "action": action }))
            .with_comment(body),
    );
    Ok(())
}

#[tauri::command]
pub async fn pr_close_as(
    workspace_dir: String,
    pr_number: i64,
    reason: String,
    duplicate_of: Option<i64>,
    comment_body: Option<String>,
) -> Result<(), String> {
    // Optional comment (e.g. templated duplicate_closed) first
    if let Some(body) = comment_body.as_ref() {
        let mut cmd = crate::commands::gh::gh_std_command()?;
        let out = cmd
            .args([
                "pr",
                "comment",
                &pr_number.to_string(),
                "--body",
                body.as_str(),
            ])
            .current_dir(&workspace_dir)
            .output()
            .map_err(|e| format!("gh pr comment failed: {}", e))?;
        if !out.status.success() {
            return Err(format!(
                "gh pr comment failed: {}",
                String::from_utf8_lossy(&out.stderr)
            ));
        }
    }
    // Now close
    let mut cmd = crate::commands::gh::gh_std_command()?;
    let out = cmd
        .args(["pr", "close", &pr_number.to_string()])
        .current_dir(&workspace_dir)
        .output()
        .map_err(|e| format!("gh pr close failed: {}", e))?;
    if !out.status.success() {
        return Err(format!(
            "gh pr close failed: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    audit::record(
        &workspace_dir,
        AuditEntry::new("pr_closed")
            .with_pr(pr_number)
            .with_details(serde_json::json!({
                "reason": reason,
                "duplicate_of": duplicate_of,
            }))
            .with_comment(comment_body.unwrap_or_default()),
    );
    Ok(())
}

#[tauri::command]
pub async fn audit_list(
    workspace_dir: String,
    limit: Option<usize>,
    actor: Option<String>,
    action: Option<String>,
) -> Result<Vec<AuditEntry>, String> {
    Ok(list_entries(
        &workspace_dir,
        limit.unwrap_or(500),
        actor.as_deref(),
        action.as_deref(),
    ))
}

#[tauri::command]
pub async fn audit_export(workspace_dir: String, format: String) -> Result<String, String> {
    audit::export_entries(&workspace_dir, &format)
}

#[tauri::command]
pub async fn pr_review_apply_finding(
    workspace_dir: String,
    pr_number: i64,
    finding_id: String,
) -> Result<(), String> {
    let result = load_result(&workspace_dir, pr_number)
        .ok_or_else(|| "No cached review for this PR".to_string())?;
    let finding = result
        .findings
        .iter()
        .find(|f| f.id == finding_id)
        .ok_or_else(|| format!("Finding {} not found", finding_id))?;
    let patch = finding
        .suggested_patch
        .clone()
        .ok_or_else(|| "Finding has no suggested_patch".to_string())?;

    let driver = GhCliDriver::new(workspace_dir.clone());
    let worktree = driver.checkout_worktree(pr_number)?;

    // Use git apply directly for a single-finding flow.
    use tokio::io::AsyncWriteExt;
    let mut child = tokio::process::Command::new("git")
        .args(["apply", "-"])
        .env("PATH", crate::commands::gh::augmented_path())
        .current_dir(&worktree)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn git apply: {}", e))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(patch.as_bytes())
            .await
            .map_err(|e| format!("write patch: {}", e))?;
    }
    let output = child
        .wait_with_output()
        .await
        .map_err(|e| format!("wait git apply: {}", e))?;
    if !output.status.success() {
        return Err(format!(
            "git apply failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn pr_polish_preview(
    workspace_dir: String,
    pr_number: i64,
    mode: String,
) -> Result<PolishPlan, String> {
    let mode = parse_mode(&mode)?;
    let plan = plan_polish(&workspace_dir, pr_number, mode)?;
    // Cache plan so apply() can reuse it.
    {
        let mut plans = CACHED_PLANS.lock().map_err(|e| e.to_string())?;
        plans.insert(plan.plan_id.clone(), plan.clone());
    }
    Ok(plan)
}

#[tauri::command]
pub async fn pr_polish_apply(
    app: AppHandle,
    workspace_dir: String,
    pr_number: i64,
    plan_id: String,
) -> Result<PolishApplyReport, String> {
    let plan = {
        let plans = CACHED_PLANS.lock().map_err(|e| e.to_string())?;
        plans
            .get(&plan_id)
            .cloned()
            .ok_or_else(|| "Polish plan expired. Re-run preview.".to_string())?
    };

    let driver = GhCliDriver::new(workspace_dir.clone());
    let pr = driver.fetch_pr(pr_number)?;
    let _ = app.emit(
        "pr_polish_progress",
        json!({ "pr_number": pr_number, "stage": "running" }),
    );

    let report = apply_polish(&workspace_dir, pr_number, &plan, &pr.author, &pr.head_ref_name).await?;
    audit::record(
        &workspace_dir,
        AuditEntry::new("polish_applied")
            .with_pr(pr_number)
            .with_details(serde_json::json!({
                "plan_id": report.plan_id,
                "commits_applied": report.commits_applied,
                "branch": report.branch,
            })),
    );
    let _ = app.emit("pr_polish_done", &report);

    // Drop cached plan once applied.
    if let Ok(mut plans) = CACHED_PLANS.lock() {
        plans.remove(&plan_id);
    }
    Ok(report)
}

fn parse_mode(raw: &str) -> Result<PolishMode, String> {
    match raw {
        "minimal" => Ok(PolishMode::Minimal),
        "standard" => Ok(PolishMode::Standard),
        "aggressive" => Ok(PolishMode::Aggressive),
        "security" => Ok(PolishMode::Security),
        other => Err(format!("unknown polish mode: {}", other)),
    }
}

#[tauri::command]
pub async fn pr_policy_check(
    app: AppHandle,
    workspace_dir: String,
    pr_number: i64,
) -> Result<Vec<PolicyResult>, String> {
    run_policies_and_draft(&app, &workspace_dir, pr_number).await
}

#[tauri::command]
pub async fn pending_comments_list(
    workspace_dir: String,
) -> Result<Vec<PendingComment>, String> {
    Ok(list_pending(&workspace_dir))
}

#[tauri::command]
pub async fn pending_comment_send(
    workspace_dir: String,
    id: String,
) -> Result<(), String> {
    let items = list_pending(&workspace_dir);
    let comment = items
        .into_iter()
        .find(|c| c.id == id)
        .ok_or_else(|| format!("pending comment {} not found", id))?;
    auto_comment::post_comment(&workspace_dir, comment.pr_number, &comment.body)?;
    auto_comment::remove_pending(&workspace_dir, &id)?;
    audit::record(
        &workspace_dir,
        AuditEntry::new("auto_comment_sent")
            .with_pr(comment.pr_number)
            .with_details(serde_json::json!({ "template": comment.template_id }))
            .with_comment(&comment.body),
    );
    Ok(())
}

#[tauri::command]
pub async fn pending_comment_edit(
    workspace_dir: String,
    id: String,
    body: String,
) -> Result<(), String> {
    auto_comment::edit_pending(&workspace_dir, &id, &body)
}

#[tauri::command]
pub async fn pending_comment_dismiss(
    workspace_dir: String,
    id: String,
) -> Result<(), String> {
    audit::record(
        &workspace_dir,
        AuditEntry::new("auto_comment_dismissed").with_details(serde_json::json!({ "id": id })),
    );
    auto_comment::remove_pending(&workspace_dir, &id)
}

static CACHED_CONSOLIDATION_PLANS: std::sync::LazyLock<
    Arc<Mutex<HashMap<String, ConsolidationPlan>>>,
> = std::sync::LazyLock::new(|| Arc::new(Mutex::new(HashMap::new())));

#[tauri::command]
pub async fn pr_similarity(
    workspace_dir: String,
    focal_pr: i64,
    candidate_prs: Vec<i64>,
    titles: HashMap<i64, String>,
    authors: HashMap<i64, String>,
    threshold: Option<f32>,
) -> Result<Vec<RelatedPr>, String> {
    let config = load_review_config(&workspace_dir);
    let th = threshold.unwrap_or(config.similarity_threshold());

    // Gather basics for focal + candidates
    let mut all_numbers: Vec<i64> = candidate_prs.iter().copied().collect();
    if !all_numbers.contains(&focal_pr) {
        all_numbers.push(focal_pr);
    }
    let basics: Vec<PrBasics> = gather_basics(&workspace_dir, &all_numbers, &titles, &authors);
    let focal = basics
        .iter()
        .find(|b| b.number == focal_pr)
        .ok_or_else(|| "focal PR not found".to_string())?;
    let others: Vec<PrBasics> = basics
        .iter()
        .filter(|b| b.number != focal_pr)
        .map(|b| PrBasics {
            number: b.number,
            title: b.title.clone(),
            author: b.author.clone(),
            files: b.files.clone(),
            hunks: b.hunks.clone(),
        })
        .collect();
    Ok(related_for(focal, &others, th))
}

#[tauri::command]
pub async fn pr_consolidate_plan(
    workspace_dir: String,
    source_prs: Vec<i64>,
) -> Result<ConsolidationPlan, String> {
    let plan = plan_consolidation(&workspace_dir, source_prs)?;
    {
        let mut cache = CACHED_CONSOLIDATION_PLANS
            .lock()
            .map_err(|e| e.to_string())?;
        cache.insert(plan.plan_id.clone(), plan.clone());
    }
    Ok(plan)
}

#[tauri::command]
pub async fn pr_consolidate_apply(
    app: AppHandle,
    workspace_dir: String,
    plan_id: String,
    close_sources: bool,
) -> Result<ConsolidationResult, String> {
    let mut plan = {
        let cache = CACHED_CONSOLIDATION_PLANS
            .lock()
            .map_err(|e| e.to_string())?;
        cache
            .get(&plan_id)
            .cloned()
            .ok_or_else(|| "Consolidation plan expired; run plan again.".to_string())?
    };
    plan.close_sources = close_sources;

    let _ = app.emit(
        "pr_consolidation_progress",
        serde_json::json!({ "plan_id": plan_id, "stage": "applying" }),
    );

    let result = apply_consolidation(&workspace_dir, &plan).await?;

    audit::record(
        &workspace_dir,
        AuditEntry::new("pr_consolidated")
            .with_prs(plan.source_prs.clone())
            .with_details(serde_json::json!({
                "plan_id": result.plan_id,
                "new_branch": result.new_branch,
                "new_pr_number": result.new_pr_number,
                "commits_applied": result.commits_applied,
                "failed_commits": result.failed_commits,
            })),
    );

    let _ = app.emit("pr_consolidation_done", &result);

    // Optionally queue "consolidated" comments on each source PR
    if close_sources {
        if let Some(new_number) = result.new_pr_number {
            let config = load_review_config(&workspace_dir);
            for src in &plan.source_prs {
                let mut vars = HashMap::new();
                vars.insert("new_pr".into(), new_number.to_string());
                vars.insert("consolidated_into".into(), new_number.to_string());
                if let Ok(comment) = draft_comment(
                    &workspace_dir,
                    &config,
                    *src,
                    "",
                    "consolidated",
                    vars,
                    None,
                ) {
                    audit::record(
                        &workspace_dir,
                        AuditEntry::new("auto_comment_drafted")
                            .with_pr(*src)
                            .with_comment(&comment.body),
                    );
                    let _ = app.emit("pending_comment_drafted", &comment);
                }
            }
        }
    }

    // Drop cached plan
    if let Ok(mut cache) = CACHED_CONSOLIDATION_PLANS.lock() {
        cache.remove(&plan_id);
    }

    Ok(result)
}

// ============================================================================
// Classification
// ============================================================================

#[tauri::command]
pub async fn pr_classify(
    workspace_dir: String,
    pr_number: i64,
) -> Result<classifier::PrClassification, String> {
    classifier::classify_pr(&workspace_dir, pr_number).await
}

#[tauri::command]
pub async fn pr_classify_batch(
    workspace_dir: String,
    pr_numbers: Vec<i64>,
) -> Result<Vec<classifier::PrClassification>, String> {
    let mut out = Vec::with_capacity(pr_numbers.len());
    let mut joins: Vec<tokio::task::JoinHandle<Result<classifier::PrClassification, String>>> =
        Vec::new();
    for n in pr_numbers {
        let ws = workspace_dir.clone();
        joins.push(tokio::spawn(async move {
            classifier::classify_pr(&ws, n).await
        }));
    }
    for j in joins {
        match j.await {
            Ok(Ok(c)) => out.push(c),
            Ok(Err(_)) => continue,
            Err(_) => continue,
        }
    }
    Ok(out)
}
