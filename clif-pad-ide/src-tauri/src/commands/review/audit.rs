use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};

/// Append-only audit log recording every gatekeeper decision.
/// Location: `{workspace}/.clif/audit.jsonl` — one JSON object per line.
///
/// This module is intentionally standalone: every other review module calls
/// `record()` to write an entry. The in-app `AuditLog` view reads via
/// `list_entries()`. Cloud deployments can later swap the sink without
/// touching call sites.

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    pub ts: String,
    pub actor: String,
    pub action: String,
    #[serde(default)]
    pub pr_numbers: Vec<i64>,
    #[serde(default)]
    pub details: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub policy_rule_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment_body: Option<String>,
}

impl AuditEntry {
    pub fn new(action: impl Into<String>) -> Self {
        Self {
            ts: now_iso(),
            actor: current_actor(),
            action: action.into(),
            pr_numbers: Vec::new(),
            details: serde_json::Value::Null,
            policy_rule_id: None,
            comment_body: None,
        }
    }

    pub fn with_pr(mut self, pr: i64) -> Self {
        self.pr_numbers.push(pr);
        self
    }

    pub fn with_prs(mut self, prs: Vec<i64>) -> Self {
        self.pr_numbers.extend(prs);
        self
    }

    pub fn with_details(mut self, details: serde_json::Value) -> Self {
        self.details = details;
        self
    }

    pub fn with_rule(mut self, rule_id: impl Into<String>) -> Self {
        self.policy_rule_id = Some(rule_id.into());
        self
    }

    pub fn with_comment(mut self, body: impl Into<String>) -> Self {
        self.comment_body = Some(body.into());
        self
    }
}

pub fn audit_path(workspace_dir: &str) -> PathBuf {
    Path::new(workspace_dir).join(".clif").join("audit.jsonl")
}

/// Append an entry. Best-effort; errors are logged but never propagate —
/// auditing must never block a review decision.
pub fn record(workspace_dir: &str, entry: AuditEntry) {
    if let Err(e) = write_entry(workspace_dir, &entry) {
        log::warn!("audit: failed to write entry: {}", e);
    }
}

fn write_entry(workspace_dir: &str, entry: &AuditEntry) -> Result<(), String> {
    let path = audit_path(workspace_dir);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir audit: {}", e))?;
    }
    let line = serde_json::to_string(entry).map_err(|e| format!("serialize: {}", e))?;
    let mut f = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("open audit: {}", e))?;
    f.write_all(line.as_bytes())
        .map_err(|e| format!("write audit: {}", e))?;
    f.write_all(b"\n")
        .map_err(|e| format!("write audit newline: {}", e))?;
    Ok(())
}

pub fn list_entries(
    workspace_dir: &str,
    limit: usize,
    actor_filter: Option<&str>,
    action_filter: Option<&str>,
) -> Vec<AuditEntry> {
    let path = audit_path(workspace_dir);
    let Ok(content) = std::fs::read_to_string(&path) else {
        return Vec::new();
    };
    // Iterate newest-first by walking lines in reverse
    let mut out: Vec<AuditEntry> = Vec::new();
    for line in content.lines().rev() {
        if out.len() >= limit {
            break;
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(entry) = serde_json::from_str::<AuditEntry>(trimmed) else {
            continue;
        };
        if let Some(a) = actor_filter {
            if !entry.actor.contains(a) {
                continue;
            }
        }
        if let Some(act) = action_filter {
            if !entry.action.contains(act) {
                continue;
            }
        }
        out.push(entry);
    }
    out
}

pub fn export_entries(workspace_dir: &str, format: &str) -> Result<String, String> {
    let entries = list_entries(workspace_dir, usize::MAX, None, None);
    let export_dir = Path::new(workspace_dir).join(".clif").join("audit-exports");
    std::fs::create_dir_all(&export_dir).map_err(|e| format!("mkdir exports: {}", e))?;

    let stamp = now_iso().replace(':', "-");
    match format {
        "json" => {
            let file = export_dir.join(format!("audit-{}.json", stamp));
            let body =
                serde_json::to_string_pretty(&entries).map_err(|e| format!("json: {}", e))?;
            std::fs::write(&file, body).map_err(|e| format!("write: {}", e))?;
            Ok(file.to_string_lossy().to_string())
        }
        "csv" => {
            let file = export_dir.join(format!("audit-{}.csv", stamp));
            let mut body = String::from("ts,actor,action,pr_numbers,policy_rule_id,comment_body\n");
            for e in &entries {
                let pr_str = e
                    .pr_numbers
                    .iter()
                    .map(|n| n.to_string())
                    .collect::<Vec<_>>()
                    .join(";");
                body.push_str(&format!(
                    "{},{},{},{},{},{}\n",
                    csv_escape(&e.ts),
                    csv_escape(&e.actor),
                    csv_escape(&e.action),
                    csv_escape(&pr_str),
                    csv_escape(e.policy_rule_id.as_deref().unwrap_or("")),
                    csv_escape(e.comment_body.as_deref().unwrap_or("")),
                ));
            }
            std::fs::write(&file, body).map_err(|e| format!("write: {}", e))?;
            Ok(file.to_string_lossy().to_string())
        }
        other => Err(format!("unknown export format: {}", other)),
    }
}

fn csv_escape(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

fn now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Plain unix seconds keeps dependencies minimal; UI can format as needed.
    format!("{}", secs)
}

/// Resolve the GitHub-authenticated actor by shelling out to `gh api user`.
/// Cached for the process lifetime to avoid repeated calls. Falls back to
/// `$USER` or "unknown".
fn current_actor() -> String {
    use std::sync::OnceLock;
    static ACTOR: OnceLock<String> = OnceLock::new();
    ACTOR
        .get_or_init(|| {
            if let Ok(mut cmd) = crate::commands::gh::gh_std_command() {
                if let Ok(out) = cmd.args(["api", "user", "--jq", ".login"]).output() {
                    if out.status.success() {
                        let name = String::from_utf8_lossy(&out.stdout).trim().to_string();
                        if !name.is_empty() {
                            return name;
                        }
                    }
                }
            }
            std::env::var("USER").unwrap_or_else(|_| "unknown".into())
        })
        .clone()
}
