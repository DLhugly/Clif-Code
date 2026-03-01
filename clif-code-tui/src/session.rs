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

/// Compact messages when approaching context limit.
/// Keeps system prompt and recent messages, summarizes the middle.
pub fn compact_messages(messages: &mut Vec<serde_json::Value>, max_tokens: usize) {
    let tokens = estimate_tokens(messages);
    if tokens < max_tokens || messages.len() < 6 {
        return;
    }

    // Keep first (system prompt) and last 4 messages
    let keep_start = 1; // right after system prompt
    let keep_end = messages.len().saturating_sub(4);

    if keep_end <= keep_start {
        return;
    }

    // Build summary of compacted messages
    let mut summary_parts = Vec::new();
    for msg in &messages[keep_start..keep_end] {
        let role = msg.get("role").and_then(|v| v.as_str()).unwrap_or("?");
        let content = msg.get("content").and_then(|v| v.as_str()).unwrap_or("");
        let preview: String = content.chars().take(100).collect();
        if !preview.is_empty() {
            summary_parts.push(format!("[{role}] {preview}..."));
        }
    }

    let summary = format!(
        "[Context compacted — {} earlier messages summarized]\n{}",
        keep_end - keep_start,
        summary_parts.join("\n")
    );

    // Replace middle with summary
    let tail: Vec<_> = messages[keep_end..].to_vec();
    messages.truncate(keep_start);
    messages.push(serde_json::json!({
        "role": "system",
        "content": summary
    }));
    messages.extend(tail);
}
