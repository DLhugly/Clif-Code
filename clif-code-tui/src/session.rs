//! Session persistence and context compaction.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub workspace: String,
    pub messages: Vec<serde_json::Value>,
    #[serde(default)]
    pub context_files: Vec<String>,
    #[serde(default)]
    pub autonomy: String,
    pub created_at: String,
}

fn sessions_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join(".clifcode").join("sessions")
}

/// Save a session to disk
pub fn save_session(session: &Session) -> Result<(), String> {
    let dir = sessions_dir();
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join(format!("{}.json", session.id));
    let json = serde_json::to_string_pretty(session)
        .map_err(|e| format!("Serialize error: {e}"))?;
    std::fs::write(path, json).map_err(|e| format!("Write error: {e}"))
}

/// Load a session by ID
pub fn load_session(id: &str) -> Result<Session, String> {
    let path = sessions_dir().join(format!("{id}.json"));
    let text = std::fs::read_to_string(&path).map_err(|e| format!("Read error: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("Parse error: {e}"))
}

/// List all saved sessions: (id, created_at, preview)
pub fn list_sessions() -> Vec<(String, String, String)> {
    let dir = sessions_dir();
    let mut sessions = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".json") {
                let id = name.trim_end_matches(".json").to_string();
                if let Ok(session) = load_session(&id) {
                    let preview = session
                        .messages
                        .iter()
                        .find(|m| m.get("role").and_then(|v| v.as_str()) == Some("user"))
                        .and_then(|m| m.get("content"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("(empty)")
                        .chars()
                        .take(50)
                        .collect::<String>();
                    sessions.push((id, session.created_at, preview));
                }
            }
        }
    }
    sessions.sort_by(|a, b| b.1.cmp(&a.1)); // newest first
    sessions
}

/// Generate a short session ID from timestamp
pub fn new_session_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("{ts:x}")
}

/// Rough token estimate (~4 chars per token)
pub fn estimate_tokens(messages: &[serde_json::Value]) -> usize {
    messages
        .iter()
        .map(|m| {
            m.get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .len()
                / 4
        })
        .sum()
}

/// Tiered context compaction — runs automatically before each API call.
///
/// Strategy (in order):
///   1. Truncate oversized tool results (>2000 chars) to first/last 40 lines
///   2. Replace old tool results (beyond recent 6 messages) with "[compacted]"
///   3. Last resort: drop old conversation turns, keep system prompt + last 6
///
/// Each tier re-checks the token count and stops as soon as we're under budget.
pub fn compact_messages(messages: &mut Vec<serde_json::Value>, max_tokens: usize) {
    if estimate_tokens(messages) < max_tokens || messages.len() < 6 {
        return;
    }

    // --- Tier 1: Truncate large tool results ---
    // Tool messages with big content get trimmed to first/last 40 lines.
    // This preserves the structure (the model still sees the tool was called)
    // while freeing the most space with the least information loss.
    const TRUNCATE_THRESHOLD: usize = 2000; // chars
    const KEEP_LINES: usize = 40;

    for msg in messages.iter_mut() {
        if msg.get("role").and_then(|v| v.as_str()) != Some("tool") {
            continue;
        }
        let content = match msg.get("content").and_then(|v| v.as_str()) {
            Some(c) if c.len() > TRUNCATE_THRESHOLD => c.to_string(),
            _ => continue,
        };
        let lines: Vec<&str> = content.lines().collect();
        if lines.len() <= KEEP_LINES * 2 {
            continue;
        }
        let head: Vec<&str> = lines[..KEEP_LINES].to_vec();
        let tail: Vec<&str> = lines[lines.len() - KEEP_LINES..].to_vec();
        let truncated = format!(
            "{}\n\n[... {} lines omitted ...]\n\n{}",
            head.join("\n"),
            lines.len() - KEEP_LINES * 2,
            tail.join("\n")
        );
        msg["content"] = serde_json::Value::String(truncated);
    }

    if estimate_tokens(messages) < max_tokens {
        return;
    }

    // --- Tier 2: Replace old tool results with stubs ---
    // Keep recent messages intact (last 6), but replace older tool message
    // content with a short stub. The assistant's tool_calls still show what
    // was called, so the model retains the action history.
    let recent_start = messages.len().saturating_sub(6);
    for (i, msg) in messages.iter_mut().enumerate() {
        if i >= recent_start {
            break;
        }
        if msg.get("role").and_then(|v| v.as_str()) != Some("tool") {
            continue;
        }
        let content = msg.get("content").and_then(|v| v.as_str()).unwrap_or("");
        if content.len() > 200 {
            msg["content"] = serde_json::Value::String("[compacted — tool result omitted]".into());
        }
    }

    if estimate_tokens(messages) < max_tokens {
        return;
    }

    // --- Tier 3: Drop old conversation turns ---
    // Keep system prompt (index 0) and last 6 messages.
    // Summarize everything in between with a brief recap.
    let keep_start = 1;
    let keep_end = messages.len().saturating_sub(6);

    if keep_end <= keep_start {
        return;
    }

    let mut summary_parts = Vec::new();
    for msg in &messages[keep_start..keep_end] {
        let role = msg.get("role").and_then(|v| v.as_str()).unwrap_or("?");
        // Skip tool messages in summary — they were already compacted
        if role == "tool" {
            continue;
        }
        let content = msg.get("content").and_then(|v| v.as_str()).unwrap_or("");
        let preview: String = content.chars().take(120).collect();
        if !preview.is_empty() {
            summary_parts.push(format!("[{role}] {preview}..."));
        }
    }

    let summary = format!(
        "[Context compacted — {} earlier messages summarized]\n{}",
        keep_end - keep_start,
        summary_parts.join("\n")
    );

    let tail: Vec<_> = messages[keep_end..].to_vec();
    messages.truncate(keep_start);
    messages.push(serde_json::json!({
        "role": "system",
        "content": summary
    }));
    messages.extend(tail);
}
