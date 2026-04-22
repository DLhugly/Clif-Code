use std::path::{Path, PathBuf};
use tokio::process::Command;
use uuid::Uuid;

use super::driver::{GhCliDriver, ReviewDriver};
use super::engine::{is_allowlisted, list_cached};
use super::rules::{load_review_config, ReviewConfig};
use super::schema::{
    Category, Finding, PolishApplyReport, PolishChunk, PolishCommitRecord, PolishCommitSpec,
    PolishManifest, PolishMode, PolishPlan, PolishValidator, PolishValidatorResult,
};

const DENY_PATH_PREFIXES: &[&str] = &[
    ".github/workflows/",
    ".env",
    ".ssh/",
    "secrets/",
];

pub fn plan_polish(
    workspace_dir: &str,
    pr_number: i64,
    mode: PolishMode,
) -> Result<PolishPlan, String> {
    let config = load_review_config(workspace_dir);
    let result = list_cached(workspace_dir)
        .into_iter()
        .find(|r| r.pr_number == pr_number)
        .ok_or_else(|| "Run a review on this PR first before polishing.".to_string())?;

    let allowlist = config.effective_allowlist();
    let chunks = build_chunks(&result.findings, mode, &allowlist, &config);
    if chunks.is_empty() {
        return Err("No suggested patches qualify for polishing under the current mode and allowlist.".to_string());
    }

    let commit_plan = build_commit_plan(&chunks);
    let validators = default_validators(workspace_dir);
    let plan_id = Uuid::new_v4().to_string();
    let manifest_path = manifest_path(workspace_dir, pr_number, &plan_id);

    Ok(PolishPlan {
        plan_id,
        pr_number,
        mode,
        chunks,
        commit_plan,
        validators,
        manifest_path: manifest_path.to_string_lossy().to_string(),
    })
}

fn build_chunks(
    findings: &[Finding],
    mode: PolishMode,
    allowlist: &[Category],
    _config: &ReviewConfig,
) -> Vec<PolishChunk> {
    let mut out = Vec::new();
    for f in findings {
        if f.dismissed {
            continue;
        }
        if DENY_PATH_PREFIXES.iter().any(|p| f.path.starts_with(p)) {
            continue;
        }
        let patch = match &f.suggested_patch {
            Some(p) if !p.trim().is_empty() => p.clone(),
            _ => continue,
        };
        let allowed = match mode {
            PolishMode::Minimal => matches!(
                f.category,
                Category::Style | Category::Imports | Category::Docs
            ),
            PolishMode::Standard => is_allowlisted(f.category, allowlist),
            PolishMode::Aggressive => true,
            PolishMode::Security => f.category == Category::Security,
        };
        if !allowed {
            continue;
        }
        out.push(PolishChunk {
            id: Uuid::new_v4().to_string(),
            path: f.path.clone(),
            category: f.category,
            rule_id: f.rule_id.clone(),
            patch,
            rationale: f.rationale.clone(),
            from_finding_id: Some(f.id.clone()),
        });
    }
    out
}

fn build_commit_plan(chunks: &[PolishChunk]) -> Vec<PolishCommitSpec> {
    // Group chunks by category — one commit per category for a clean history.
    let mut by_category: std::collections::BTreeMap<String, Vec<&PolishChunk>> =
        std::collections::BTreeMap::new();
    for c in chunks {
        let key = format!("{:?}", c.category).to_lowercase();
        by_category.entry(key).or_default().push(c);
    }
    let mut commits = Vec::new();
    for (cat_name, group) in by_category {
        let category = group[0].category;
        commits.push(PolishCommitSpec {
            id: Uuid::new_v4().to_string(),
            category,
            message: format!(
                "polish({}): apply {} finding fix{} from Clif Review",
                cat_name,
                group.len(),
                if group.len() == 1 { "" } else { "es" }
            ),
            chunk_ids: group.iter().map(|c| c.id.clone()).collect(),
        });
    }
    commits
}

fn default_validators(workspace_dir: &str) -> Vec<PolishValidator> {
    let mut out = Vec::new();
    let root = Path::new(workspace_dir);
    if root.join("package.json").exists() {
        out.push(PolishValidator {
            name: "npm run lint".into(),
            command: "npm run lint --if-present".into(),
            required: false,
        });
        out.push(PolishValidator {
            name: "tsc --noEmit".into(),
            command: "npx tsc --noEmit --pretty false".into(),
            required: false,
        });
    }
    if root.join("Cargo.toml").exists() {
        out.push(PolishValidator {
            name: "cargo check".into(),
            command: "cargo check --quiet".into(),
            required: false,
        });
    }
    if root.join("pyproject.toml").exists() || root.join("requirements.txt").exists() {
        out.push(PolishValidator {
            name: "python -m compileall".into(),
            command: "python -m compileall -q .".into(),
            required: false,
        });
    }
    out
}

fn manifest_path(workspace_dir: &str, pr_number: i64, plan_id: &str) -> PathBuf {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    Path::new(workspace_dir)
        .join(".clif")
        .join("polish-reports")
        .join(format!("pr-{}-{}-{}.json", pr_number, ts, &plan_id[..8]))
}

pub async fn apply_polish(
    workspace_dir: &str,
    pr_number: i64,
    plan: &PolishPlan,
    pr_author: &str,
    head_branch: &str,
) -> Result<PolishApplyReport, String> {
    let driver = GhCliDriver::new(workspace_dir.to_string());
    let worktree = driver.checkout_worktree(pr_number)?;
    let mut commit_records: Vec<PolishCommitRecord> = Vec::new();
    let mut commits_applied = 0u32;

    // Group chunks by category matching the commit plan.
    for commit in &plan.commit_plan {
        let mut applied_chunk_ids: Vec<String> = Vec::new();
        let mut validator_results: Vec<PolishValidatorResult> = Vec::new();

        for chunk_id in &commit.chunk_ids {
            let chunk = match plan.chunks.iter().find(|c| &c.id == chunk_id) {
                Some(c) => c,
                None => continue,
            };
            if let Err(e) = check_patch(&worktree, &chunk.patch).await {
                validator_results.push(PolishValidatorResult {
                    name: "git apply --check".into(),
                    ok: false,
                    details: Some(e),
                });
                continue;
            }
            if let Err(e) = apply_patch(&worktree, &chunk.patch).await {
                validator_results.push(PolishValidatorResult {
                    name: "git apply".into(),
                    ok: false,
                    details: Some(e),
                });
                continue;
            }
            applied_chunk_ids.push(chunk_id.clone());
        }

        if applied_chunk_ids.is_empty() {
            continue;
        }

        for v in &plan.validators {
            let ok = run_shell(&worktree, &v.command).await.is_ok();
            validator_results.push(PolishValidatorResult {
                name: v.name.clone(),
                ok,
                details: None,
            });
            if !ok && v.required {
                // Revert staged changes for this commit
                let _ = run_shell(&worktree, "git checkout -- .").await;
                return Err(format!(
                    "Required validator {} failed; aborting polish.",
                    v.name
                ));
            }
        }

        let author = format!("{} <{}@users.noreply.github.com>", pr_author, pr_author);
        let committer_name = "Clif Code";
        let committer_email = "clif-code@users.noreply.github.com";
        let trailer = format!(
            "Polished-by: Clif Code plan/{}\n",
            &plan.plan_id[..8]
        );
        let message = format!("{}\n\n{}", commit.message, trailer);

        if let Err(e) = commit_staged(&worktree, committer_name, committer_email, &author, &message).await
        {
            validator_results.push(PolishValidatorResult {
                name: "git commit".into(),
                ok: false,
                details: Some(e.clone()),
            });
            continue;
        }

        let oid = current_head_sha(&worktree).await.unwrap_or_default();
        commit_records.push(PolishCommitRecord {
            oid: oid.clone(),
            author: author.clone(),
            committer: format!("{} <{}>", committer_name, committer_email),
            category: commit.category,
            rule_id: None,
            validator_results,
            rollback: vec![format!("git revert {}", oid)],
        });
        commits_applied += 1;
    }

    if commits_applied == 0 {
        driver.cleanup_worktree(pr_number);
        return Err("No polish commits produced — all chunks failed validation.".into());
    }

    // Push the head branch back to origin
    driver
        .push_branch(&worktree, head_branch)
        .map_err(|e| format!("push polish commits: {}", e))?;

    // Write manifest
    let manifest = PolishManifest {
        pr_number,
        plan_id: plan.plan_id.clone(),
        mode: plan.mode,
        branch: head_branch.to_string(),
        commits: commit_records,
        generated_at: now_epoch(),
    };
    let manifest_path = PathBuf::from(&plan.manifest_path);
    if let Some(parent) = manifest_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir polish-reports: {}", e))?;
    }
    let json =
        serde_json::to_string_pretty(&manifest).map_err(|e| format!("serialize manifest: {}", e))?;
    std::fs::write(&manifest_path, json).map_err(|e| format!("write manifest: {}", e))?;

    Ok(PolishApplyReport {
        plan_id: plan.plan_id.clone(),
        branch: head_branch.to_string(),
        commits_applied,
        manifest_path: manifest_path.to_string_lossy().to_string(),
    })
}

async fn check_patch(worktree: &Path, patch: &str) -> Result<(), String> {
    let mut child = Command::new("git")
        .args(["apply", "--check", "-"])
        .current_dir(worktree)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn git apply --check: {}", e))?;
    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        stdin
            .write_all(patch.as_bytes())
            .await
            .map_err(|e| format!("stdin write: {}", e))?;
    }
    let output = child
        .wait_with_output()
        .await
        .map_err(|e| format!("wait git apply: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

async fn apply_patch(worktree: &Path, patch: &str) -> Result<(), String> {
    let mut child = Command::new("git")
        .args(["apply", "-"])
        .current_dir(worktree)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn git apply: {}", e))?;
    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        stdin
            .write_all(patch.as_bytes())
            .await
            .map_err(|e| format!("stdin write: {}", e))?;
    }
    let output = child
        .wait_with_output()
        .await
        .map_err(|e| format!("wait git apply: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    // Stage everything that was modified
    run_shell(worktree, "git add -A").await
}

async fn commit_staged(
    worktree: &Path,
    committer_name: &str,
    committer_email: &str,
    author: &str,
    message: &str,
) -> Result<(), String> {
    let output = Command::new("git")
        .args(["commit", "--author", author, "-m", message])
        .env("GIT_COMMITTER_NAME", committer_name)
        .env("GIT_COMMITTER_EMAIL", committer_email)
        .current_dir(worktree)
        .output()
        .await
        .map_err(|e| format!("git commit failed: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

async fn current_head_sha(worktree: &Path) -> Result<String, String> {
    let output = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(worktree)
        .output()
        .await
        .map_err(|e| format!("rev-parse failed: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

async fn run_shell(worktree: &Path, command: &str) -> Result<(), String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
    let output = Command::new(&shell)
        .arg("-c")
        .arg(command)
        .current_dir(worktree)
        .output()
        .await
        .map_err(|e| format!("spawn shell: {}", e))?;
    if !output.status.success() {
        return Err(format!(
            "{} exit {}: {}",
            command,
            output.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(())
}

fn now_epoch() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_default()
}
