use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use uuid::Uuid;

use super::rules::ReviewConfig;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingComment {
    pub id: String,
    pub pr_number: i64,
    pub author: String,
    pub template_id: String,
    pub body: String,
    pub created_at: String,
    pub auto_post: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_id: Option<String>,
}

pub fn pending_path(workspace_dir: &str) -> PathBuf {
    Path::new(workspace_dir)
        .join(".clif")
        .join("pending-comments.jsonl")
}

/// Render `{{ var }}` placeholders against a variable map. Missing variables
/// render as an empty string.
pub fn render_template(body: &str, vars: &HashMap<String, String>) -> String {
    let mut out = String::with_capacity(body.len());
    let mut iter = body.char_indices().peekable();
    while let Some((i, c)) = iter.next() {
        if c == '{' && matches!(body[i..].chars().nth(1), Some('{')) {
            // Find `}}`
            if let Some(end) = body[i..].find("}}") {
                let key = body[i + 2..i + end].trim();
                let val = vars.get(key).cloned().unwrap_or_default();
                out.push_str(&val);
                // Advance iter by (end + 2) - 1 chars
                for _ in 0..(end + 1) {
                    iter.next();
                }
                continue;
            }
        }
        out.push(c);
    }
    out
}

pub fn draft_comment(
    workspace_dir: &str,
    config: &ReviewConfig,
    pr_number: i64,
    author: impl Into<String>,
    template_id: impl Into<String>,
    variables: HashMap<String, String>,
    rule_id: Option<String>,
) -> Result<PendingComment, String> {
    let template_id = template_id.into();
    let template = config
        .auto_comments
        .templates
        .get(&template_id)
        .ok_or_else(|| format!("unknown auto-comment template '{}'", template_id))?;

    let body = render_template(&template.body, &variables);
    let comment = PendingComment {
        id: Uuid::new_v4().to_string(),
        pr_number,
        author: author.into(),
        template_id,
        body,
        created_at: now_epoch(),
        auto_post: template.auto_post,
        rule_id,
    };
    append_pending(workspace_dir, &comment)?;
    Ok(comment)
}

pub fn list_pending(workspace_dir: &str) -> Vec<PendingComment> {
    let path = pending_path(workspace_dir);
    let Ok(content) = std::fs::read_to_string(&path) else {
        return Vec::new();
    };
    content
        .lines()
        .filter_map(|l| serde_json::from_str::<PendingComment>(l.trim()).ok())
        .collect()
}

pub fn edit_pending(
    workspace_dir: &str,
    id: &str,
    new_body: &str,
) -> Result<(), String> {
    let items = list_pending(workspace_dir);
    let mut found = false;
    let updated: Vec<PendingComment> = items
        .into_iter()
        .map(|mut c| {
            if c.id == id {
                c.body = new_body.to_string();
                found = true;
            }
            c
        })
        .collect();
    if !found {
        return Err(format!("pending comment {} not found", id));
    }
    rewrite_pending(workspace_dir, &updated)
}

pub fn remove_pending(workspace_dir: &str, id: &str) -> Result<(), String> {
    let items = list_pending(workspace_dir);
    let updated: Vec<PendingComment> = items.into_iter().filter(|c| c.id != id).collect();
    rewrite_pending(workspace_dir, &updated)
}

pub fn remove_pending_for_pr(workspace_dir: &str, pr_number: i64) -> Result<(), String> {
    let items = list_pending(workspace_dir);
    let updated: Vec<PendingComment> =
        items.into_iter().filter(|c| c.pr_number != pr_number).collect();
    rewrite_pending(workspace_dir, &updated)
}

pub fn post_comment(
    workspace_dir: &str,
    pr_number: i64,
    body: &str,
) -> Result<(), String> {
    let mut cmd = crate::commands::gh::gh_std_command()?;
    let out = cmd
        .args(["pr", "comment", &pr_number.to_string(), "--body", body])
        .current_dir(workspace_dir)
        .output()
        .map_err(|e| format!("gh pr comment failed: {}", e))?;
    if !out.status.success() {
        return Err(format!(
            "gh pr comment failed: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    Ok(())
}

fn append_pending(workspace_dir: &str, comment: &PendingComment) -> Result<(), String> {
    let path = pending_path(workspace_dir);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir pending: {}", e))?;
    }
    let line = serde_json::to_string(comment).map_err(|e| format!("serialize: {}", e))?;
    let mut f = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("open pending: {}", e))?;
    f.write_all(line.as_bytes())
        .map_err(|e| format!("write: {}", e))?;
    f.write_all(b"\n").map_err(|e| format!("newline: {}", e))?;
    Ok(())
}

fn rewrite_pending(workspace_dir: &str, items: &[PendingComment]) -> Result<(), String> {
    let path = pending_path(workspace_dir);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir pending: {}", e))?;
    }
    let mut body = String::new();
    for c in items {
        body.push_str(&serde_json::to_string(c).map_err(|e| format!("serialize: {}", e))?);
        body.push('\n');
    }
    std::fs::write(&path, body).map_err(|e| format!("write: {}", e))?;
    Ok(())
}

fn now_epoch() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_default()
}
