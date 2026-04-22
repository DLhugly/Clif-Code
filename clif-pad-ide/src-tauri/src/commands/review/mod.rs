mod driver;
mod engine;
mod polish;
mod poster;
mod rules;
mod schema;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde_json::json;
use tauri::{AppHandle, Emitter};

use driver::{fetch_pr_diff_async, GhCliDriver, PostedAction, ReviewDriver};
use engine::{list_cached, load_result, run_review, save_result, ReviewSettings};
use polish::{apply_polish, plan_polish};
use rules::load_review_config;
use schema::{PolishApplyReport, PolishMode, PolishPlan, ReviewResult};

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
                let _ = app_emit.emit("pr_review_done", &result);
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
    poster::post_review(&workspace_dir, pr_number, parsed, &body)
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
