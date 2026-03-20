use serde_json::json;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use uuid::Uuid;

static AGENT_SESSIONS: std::sync::LazyLock<Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>>> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(HashMap::new())));

/// Tool definitions for OpenAI function-calling format
fn tool_definitions() -> Vec<serde_json::Value> {
    vec![
        json!({
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Read the contents of a file at the given path",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the file" }
                    },
                    "required": ["path"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "Write content to a file at the given path, creating it if necessary",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the file" },
                        "content": { "type": "string", "description": "Content to write" }
                    },
                    "required": ["path", "content"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "edit_file",
                "description": "Replace old_string with new_string in the file. old_string must match exactly.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the file" },
                        "old_string": { "type": "string", "description": "Exact text to find and replace" },
                        "new_string": { "type": "string", "description": "Replacement text" }
                    },
                    "required": ["path", "old_string", "new_string"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "list_files",
                "description": "List files and directories at the given path",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Directory path to list" }
                    },
                    "required": ["path"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "search",
                "description": "Search for text in files within a directory",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Text to search for" },
                        "path": { "type": "string", "description": "Directory to search in" }
                    },
                    "required": ["query", "path"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "run_command",
                "description": "Run a shell command and return its output. Use for build, test, git, etc.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": { "type": "string", "description": "Shell command to execute" },
                        "working_dir": { "type": "string", "description": "Working directory (optional)" }
                    },
                    "required": ["command"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "find_file",
                "description": "Find files by name anywhere in the workspace. Searches recursively. Use when you don't know where a file is.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string", "description": "File or directory name to search for (partial match)" },
                        "dir": { "type": "string", "description": "Starting directory. Defaults to workspace root." }
                    },
                    "required": ["name"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "change_directory",
                "description": "Change the working directory for subsequent tool calls. Use when the user wants to switch to a different folder.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the directory to switch to" }
                    },
                    "required": ["path"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "submit",
                "description": "Mark the task as complete. Call when finished with the user's request.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "summary": { "type": "string", "description": "Brief summary of what was accomplished" }
                    },
                    "required": ["summary"]
                }
            }
        }),
    ]
}

/// Build the system prompt
fn build_system_prompt(workspace_dir: &str, context: Option<&str>) -> String {
    let mut prompt = format!(
        "You are an AI coding assistant embedded in ClifPad, a desktop code editor. \
         You help users with their code by reading files, making edits, searching codebases, and running commands.\n\n\
         The current workspace is: {}\n\n\
         Guidelines:\n\
         - Be concise and direct.\n\
         - Use tools to gather information before answering.\n\
         - When editing files, use edit_file for small changes and write_file for new files or rewrites.\n\
         - Always confirm destructive operations before proceeding.\n\
         - Format responses in markdown.\n",
        workspace_dir
    );

    if let Some(ctx) = context {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(ctx) {
            if let Some(active_file) = parsed.get("activeFile").and_then(|v| v.as_str()) {
                prompt.push_str(&format!("\nCurrently active file: {}\n", active_file));
            }
            if let Some(branch) = parsed.get("gitBranch").and_then(|v| v.as_str()) {
                prompt.push_str(&format!("Current git branch: {}\n", branch));
            }
            if let Some(files) = parsed.get("files").and_then(|v| v.as_array()) {
                let file_list: Vec<&str> = files.iter().filter_map(|v| v.as_str()).collect();
                if !file_list.is_empty() {
                    prompt.push_str(&format!("\nAttached files for context: {}\n", file_list.join(", ")));
                }
            }
        }
    }

    prompt
}

/// Execute a tool call and return the result
async fn execute_tool(name: &str, args: &serde_json::Value, workspace_dir: &str) -> String {
    match name {
        "read_file" => {
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
            let full_path = resolve_path(path, workspace_dir);
            match tokio::fs::read_to_string(&full_path).await {
                Ok(content) => {
                    if content.len() > 50000 {
                        format!("{}\n\n... (truncated, {} total bytes)", &content[..50000], content.len())
                    } else {
                        content
                    }
                }
                Err(e) => format!("Error reading file: {}", e),
            }
        }
        "write_file" => {
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
            let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let full_path = resolve_path(path, workspace_dir);

            // Ensure parent dir exists
            if let Some(parent) = std::path::Path::new(&full_path).parent() {
                let _ = tokio::fs::create_dir_all(parent).await;
            }

            match tokio::fs::write(&full_path, content).await {
                Ok(()) => format!("Successfully wrote {} bytes to {}", content.len(), path),
                Err(e) => format!("Error writing file: {}", e),
            }
        }
        "edit_file" => {
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
            let old_string = args.get("old_string").and_then(|v| v.as_str()).unwrap_or("");
            let new_string = args.get("new_string").and_then(|v| v.as_str()).unwrap_or("");
            let full_path = resolve_path(path, workspace_dir);

            match tokio::fs::read_to_string(&full_path).await {
                Ok(content) => {
                    if !content.contains(old_string) {
                        return format!("Error: old_string not found in {}", path);
                    }
                    let new_content = content.replacen(old_string, new_string, 1);
                    match tokio::fs::write(&full_path, &new_content).await {
                        Ok(()) => format!("Successfully edited {}", path),
                        Err(e) => format!("Error writing file: {}", e),
                    }
                }
                Err(e) => format!("Error reading file: {}", e),
            }
        }
        "list_files" => {
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
            let full_path = resolve_path(path, workspace_dir);

            match tokio::fs::read_dir(&full_path).await {
                Ok(mut entries) => {
                    let mut items = Vec::new();
                    while let Ok(Some(entry)) = entries.next_entry().await {
                        let name = entry.file_name().to_string_lossy().to_string();
                        // Skip hidden dirs and common noise
                        if name.starts_with('.') || name == "node_modules" || name == "target" {
                            continue;
                        }
                        let is_dir = entry.file_type().await.map(|t| t.is_dir()).unwrap_or(false);
                        items.push(if is_dir { format!("{}/", name) } else { name });
                    }
                    items.sort();
                    items.join("\n")
                }
                Err(e) => format!("Error listing directory: {}", e),
            }
        }
        "search" => {
            let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
            let full_path = resolve_path(path, workspace_dir);

            // Use the search command logic inline
            let results = crate::commands::search::search_files(
                full_path,
                query.to_string(),
                None,
            );
            match results {
                Ok(items) => {
                    if items.is_empty() {
                        format!("No results found for '{}'", query)
                    } else {
                        items
                            .iter()
                            .take(50)
                            .map(|r| format!("{}:{}: {}", r.file, r.line, r.content.trim()))
                            .collect::<Vec<_>>()
                            .join("\n")
                    }
                }
                Err(e) => format!("Search error: {}", e),
            }
        }
        "run_command" => {
            let command = args.get("command").and_then(|v| v.as_str()).unwrap_or("");
            let working_dir = args
                .get("working_dir")
                .and_then(|v| v.as_str())
                .unwrap_or(workspace_dir);

            let output = tokio::process::Command::new("sh")
                .arg("-c")
                .arg(command)
                .current_dir(working_dir)
                .output()
                .await;

            match output {
                Ok(out) => {
                    let stdout = String::from_utf8_lossy(&out.stdout);
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    let mut result = String::new();
                    if !stdout.is_empty() {
                        result.push_str(&stdout);
                    }
                    if !stderr.is_empty() {
                        if !result.is_empty() {
                            result.push_str("\n--- stderr ---\n");
                        }
                        result.push_str(&stderr);
                    }
                    if result.is_empty() {
                        result = format!("Command completed with exit code {}", out.status.code().unwrap_or(-1));
                    }
                    // Truncate long output
                    if result.len() > 20000 {
                        result = format!("{}\n\n... (truncated, {} total bytes)", &result[..20000], result.len());
                    }
                    result
                }
                Err(e) => format!("Error running command: {}", e),
            }
        }
        "find_file" => {
            let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let dir = args
                .get("dir")
                .and_then(|v| v.as_str())
                .unwrap_or(workspace_dir);
            let full_path = resolve_path(dir, workspace_dir);

            let output = tokio::process::Command::new("find")
                .args([
                    &full_path,
                    "-maxdepth", "5",
                    "-iname", &format!("*{}*", name),
                    "-not", "-path", "*/node_modules/*",
                    "-not", "-path", "*/.git/*",
                    "-not", "-path", "*/target/*",
                    "-not", "-path", "*/__pycache__/*",
                ])
                .output()
                .await;

            match output {
                Ok(out) => {
                    let text = String::from_utf8_lossy(&out.stdout);
                    let results: Vec<&str> = text.lines().take(30).collect();
                    if results.is_empty() {
                        format!("No files found matching '{}'", name)
                    } else {
                        results.join("\n")
                    }
                }
                Err(e) => format!("Find error: {}", e),
            }
        }
        "change_directory" => {
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
            let full_path = resolve_path(path, workspace_dir);
            if std::path::Path::new(&full_path).is_dir() {
                format!("Changed workspace to {}", full_path)
            } else {
                format!("Error: {} is not a directory", full_path)
            }
        }
        "submit" => {
            let summary = args.get("summary").and_then(|v| v.as_str()).unwrap_or("Task complete");
            format!("Task complete: {}", summary)
        }
        _ => format!("Unknown tool: {}", name),
    }
}

/// Resolve a path relative to the workspace if not absolute
fn resolve_path(path: &str, workspace_dir: &str) -> String {
    if path.starts_with('/') || path.starts_with('\\') {
        path.to_string()
    } else {
        format!("{}/{}", workspace_dir, path)
    }
}

/// Estimate token count for the conversation (~4 chars per token).
fn estimate_conversation_tokens(conversation: &[serde_json::Value]) -> usize {
    conversation
        .iter()
        .map(|msg| {
            let mut chars: usize = 0;
            if let Some(c) = msg.get("content").and_then(|v| v.as_str()) {
                chars += c.len();
            }
            if let Some(tcs) = msg.get("tool_calls").and_then(|v| v.as_array()) {
                for tc in tcs {
                    if let Some(args) = tc.pointer("/function/arguments").and_then(|v| v.as_str()) {
                        chars += args.len();
                    }
                }
            }
            chars += 20;
            chars / 4
        })
        .sum()
}

/// Claude Code-style tiered context compaction.
///
/// 1. Truncate large tool results (>2000 chars) to first/last 30 lines
/// 2. Stub old tool results (beyond recent 8 messages) to "[compacted]"
/// 3. Drop old conversation turns, keeping system prompt + recent 8 messages
fn compact_conversation(conversation: &mut Vec<serde_json::Value>, target_tokens: usize) {
    if estimate_conversation_tokens(conversation) < target_tokens || conversation.len() < 8 {
        return;
    }

    // Tier 1: Truncate large tool results
    for msg in conversation.iter_mut() {
        if msg.get("role").and_then(|v| v.as_str()) != Some("tool") {
            continue;
        }
        let content = match msg.get("content").and_then(|v| v.as_str()) {
            Some(c) if c.len() > 2000 => c.to_string(),
            _ => continue,
        };
        let lines: Vec<&str> = content.lines().collect();
        if lines.len() <= 60 {
            continue;
        }
        let head: Vec<&str> = lines[..30].to_vec();
        let tail: Vec<&str> = lines[lines.len() - 30..].to_vec();
        let truncated = format!(
            "{}\n\n[... {} lines omitted ...]\n\n{}",
            head.join("\n"),
            lines.len() - 60,
            tail.join("\n")
        );
        msg["content"] = serde_json::Value::String(truncated);
    }

    if estimate_conversation_tokens(conversation) < target_tokens {
        return;
    }

    // Tier 2: Stub old tool results (keep recent 8 messages intact)
    let recent_start = conversation.len().saturating_sub(8);
    for (i, msg) in conversation.iter_mut().enumerate() {
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

    if estimate_conversation_tokens(conversation) < target_tokens {
        return;
    }

    // Tier 3: Drop old turns, keep system prompt (index 0) + recent 8
    let keep_start = 1;
    let keep_end = conversation.len().saturating_sub(8);
    if keep_end <= keep_start {
        return;
    }

    let mut summary_parts = Vec::new();
    for msg in &conversation[keep_start..keep_end] {
        let role = msg.get("role").and_then(|v| v.as_str()).unwrap_or("?");
        if role == "tool" {
            continue;
        }
        let content = msg.get("content").and_then(|v| v.as_str()).unwrap_or("");
        let preview: String = content.chars().take(150).collect();
        if !preview.is_empty() {
            summary_parts.push(format!("[{}] {}...", role, preview));
        }
    }

    let summary = format!(
        "[Context compacted — {} earlier messages summarized]\n{}",
        keep_end - keep_start,
        summary_parts.join("\n")
    );

    let tail: Vec<_> = conversation[keep_end..].to_vec();
    conversation.truncate(keep_start);
    conversation.push(json!({
        "role": "system",
        "content": summary,
    }));
    conversation.extend(tail);
}

/// Get the provider URL
fn get_provider_url(provider: &str) -> String {
    match provider {
        "ollama" => "http://localhost:11434/v1/chat/completions".to_string(),
        _ => "https://openrouter.ai/api/v1/chat/completions".to_string(),
    }
}

/// Load API key from stored keys
fn load_api_key(provider: &str) -> Option<String> {
    let home = std::env::var("HOME").ok()?;
    let keys_path = format!("{}/.clif/api_keys.json", home);
    let content = std::fs::read_to_string(keys_path).ok()?;
    let keys: serde_json::Value = serde_json::from_str(&content).ok()?;
    keys.get(provider).and_then(|k| k.as_str()).map(|s| s.to_string())
}

#[tauri::command]
pub async fn agent_chat(
    window: tauri::Window,
    messages: Vec<super::ai::ChatMessage>,
    model: String,
    api_key: Option<String>,
    provider: String,
    workspace_dir: String,
    context: Option<String>,
) -> Result<(), String> {
    let session_id = Uuid::new_v4().to_string();
    let app = window.app_handle().clone();
    let label = window.label().to_string();

    let (cancel_tx, cancel_rx) = tokio::sync::oneshot::channel::<()>();

    {
        let mut sessions = AGENT_SESSIONS
            .lock()
            .map_err(|e| format!("Failed to lock sessions: {}", e))?;
        sessions.insert(session_id.clone(), cancel_tx);
    }

    let sid = session_id.clone();

    tokio::spawn(async move {
        let result = run_agent_loop(
            app.clone(),
            &label,
            &sid,
            messages,
            model,
            api_key,
            provider,
            workspace_dir,
            context,
            cancel_rx,
        )
        .await;

        if let Err(e) = result {
            let _ = app.emit_to(&label, "agent_error", e);
        }

        let _ = app.emit_to(&label, "agent_done", ());

        if let Ok(mut sessions) = AGENT_SESSIONS.lock() {
            sessions.remove(&sid);
        }
    });

    Ok(())
}

async fn run_agent_loop(
    app: tauri::AppHandle,
    label: &str,
    _session_id: &str,
    initial_messages: Vec<super::ai::ChatMessage>,
    model: String,
    api_key: Option<String>,
    provider: String,
    workspace_dir: String,
    context: Option<String>,
    mut cancel_rx: tokio::sync::oneshot::Receiver<()>,
) -> Result<(), String> {
    let url = get_provider_url(&provider);
    let key = api_key.or_else(|| load_api_key(&provider));

    let system_prompt = build_system_prompt(&workspace_dir, context.as_deref());

    // Build conversation from initial messages
    let mut conversation: Vec<serde_json::Value> = vec![json!({
        "role": "system",
        "content": system_prompt,
    })];

    // Add context file contents for attached files
    if let Some(ref ctx) = context {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(ctx) {
            if let Some(files) = parsed.get("files").and_then(|v| v.as_array()) {
                for file_val in files {
                    if let Some(file_path) = file_val.as_str() {
                        let full_path = resolve_path(file_path, &workspace_dir);
                        if let Ok(content) = tokio::fs::read_to_string(&full_path).await {
                            let truncated = if content.len() > 30000 {
                                format!("{}... (truncated)", &content[..30000])
                            } else {
                                content
                            };
                            conversation.push(json!({
                                "role": "system",
                                "content": format!("Content of {}:\n```\n{}\n```", file_path, truncated),
                            }));
                        }
                    }
                }
            }
        }
    }

    for msg in &initial_messages {
        conversation.push(json!({
            "role": msg.role,
            "content": msg.content,
        }));
    }

    let tools = tool_definitions();
    let client = reqwest::Client::new();
    let max_turns = 200; // Safety limit — compaction handles context

    for _turn in 0..max_turns {
        // Auto-compact when context is getting large (~75% of 200K window)
        let estimated_tokens = estimate_conversation_tokens(&conversation);
        if estimated_tokens > 150_000 {
            compact_conversation(&mut conversation, 80_000);
            let _ = app.emit_to(label, "agent_stream", "\n*[context compacted]*\n");
        }
        // Check cancellation
        if cancel_rx.try_recv().is_ok() {
            return Ok(());
        }

        let mut request_body = json!({
            "model": model,
            "messages": conversation,
            "tools": tools,
            "stream": true,
        });

        if provider == "openrouter" {
            if let Some(obj) = request_body.as_object_mut() {
                obj.insert("transforms".to_string(), json!(["middle-out"]));
            }
        }

        let mut req_builder = client
            .post(&url)
            .header("Content-Type", "application/json");

        if let Some(ref k) = key {
            req_builder = req_builder.header("Authorization", format!("Bearer {}", k));
        }

        if provider == "openrouter" {
            req_builder = req_builder
                .header("HTTP-Referer", "https://clif.dev")
                .header("X-Title", "ClifPad");
        }

        let response = req_builder
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();

            // Context overflow — compact and retry once
            if status.as_u16() == 400 && (body.contains("context_length") || body.contains("too many tokens") || body.contains("maximum context")) {
                let _ = app.emit_to(label, "agent_stream", "\n*[context too large — compacting...]*\n");
                compact_conversation(&mut conversation, 20_000);

                let mut retry_body = json!({
                    "model": model,
                    "messages": conversation,
                    "tools": tools,
                    "stream": true,
                });
                if provider == "openrouter" {
                    if let Some(obj) = retry_body.as_object_mut() {
                        obj.insert("transforms".to_string(), json!(["middle-out"]));
                    }
                }

                let mut retry_req = client.post(&url).header("Content-Type", "application/json");
                if let Some(ref k) = key {
                    retry_req = retry_req.header("Authorization", format!("Bearer {}", k));
                }
                if provider == "openrouter" {
                    retry_req = retry_req
                        .header("HTTP-Referer", "https://clif.dev")
                        .header("X-Title", "ClifPad");
                }

                let retry_response = retry_req.json(&retry_body).send().await
                    .map_err(|e| format!("Retry failed: {}", e))?;

                if !retry_response.status().is_success() {
                    let retry_body = retry_response.text().await.unwrap_or_default();
                    return Err(format!("API error after compaction: {}", retry_body));
                }
                // Continue with retry_response — but we need to re-enter the stream parsing.
                // For simplicity, signal the user to continue.
                let _ = app.emit_to(label, "agent_stream", "\n*[Compacted. Send another message to continue.]*\n");
                let _ = app.emit_to(label, "agent_stream", "[DONE]");
                return Ok(());
            }

            return Err(format!("API error {}: {}", status, body));
        }

        // Parse the streaming response
        let mut stream = response.bytes_stream();
        use futures::StreamExt;

        let mut buffer = String::new();
        let mut assistant_content = String::new();
        let mut tool_calls_map: HashMap<usize, (String, String, String)> = HashMap::new(); // index -> (id, name, args)
        let mut finish_reason = String::new();

        while let Some(chunk_result) = stream.next().await {
            // Check cancellation between chunks
            if cancel_rx.try_recv().is_ok() {
                return Ok(());
            }

            match chunk_result {
                Ok(chunk) => {
                    let chunk_str = String::from_utf8_lossy(&chunk);
                    buffer.push_str(&chunk_str);

                    while let Some(newline_pos) = buffer.find('\n') {
                        let line = buffer[..newline_pos].trim().to_string();
                        buffer = buffer[newline_pos + 1..].to_string();

                        if line.is_empty() || !line.starts_with("data: ") {
                            continue;
                        }

                        let data = &line[6..];
                        if data == "[DONE]" {
                            break;
                        }

                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                            if let Some(choices) = parsed.get("choices").and_then(|c| c.as_array()) {
                                if let Some(choice) = choices.first() {
                                    // Check finish_reason
                                    if let Some(fr) = choice.get("finish_reason").and_then(|v| v.as_str()) {
                                        finish_reason = fr.to_string();
                                    }

                                    if let Some(delta) = choice.get("delta") {
                                        // Stream text content
                                        if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                                            assistant_content.push_str(content);
                                            let _ = app.emit_to(label, "agent_stream", content);
                                        }

                                        // Accumulate tool calls
                                        if let Some(tcs) = delta.get("tool_calls").and_then(|t| t.as_array()) {
                                            for tc in tcs {
                                                let index = tc.get("index").and_then(|i| i.as_u64()).unwrap_or(0) as usize;
                                                let entry = tool_calls_map.entry(index).or_insert_with(|| {
                                                    (String::new(), String::new(), String::new())
                                                });

                                                if let Some(id) = tc.get("id").and_then(|v| v.as_str()) {
                                                    entry.0 = id.to_string();
                                                }
                                                if let Some(func) = tc.get("function") {
                                                    if let Some(name) = func.get("name").and_then(|v| v.as_str()) {
                                                        entry.1 = name.to_string();
                                                    }
                                                    if let Some(args) = func.get("arguments").and_then(|v| v.as_str()) {
                                                        entry.2.push_str(args);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    return Err(format!("Stream read error: {}", e));
                }
            }
        }

        // If no tool calls, we're done
        if tool_calls_map.is_empty() || finish_reason != "tool_calls" {
            // Signal stream done
            let _ = app.emit_to(label, "agent_stream", "[DONE]");
            return Ok(());
        }

        // Add assistant message with tool calls to conversation
        let mut sorted_tool_calls: Vec<(usize, (String, String, String))> =
            tool_calls_map.into_iter().collect();
        sorted_tool_calls.sort_by_key(|(idx, _)| *idx);

        let tc_json: Vec<serde_json::Value> = sorted_tool_calls
            .iter()
            .map(|(_, (id, name, args))| {
                json!({
                    "id": id,
                    "type": "function",
                    "function": {
                        "name": name,
                        "arguments": args,
                    }
                })
            })
            .collect();

        let mut assistant_msg = json!({
            "role": "assistant",
            "tool_calls": tc_json,
        });
        if !assistant_content.is_empty() {
            assistant_msg["content"] = json!(assistant_content);
        }
        conversation.push(assistant_msg);

        // Execute each tool call
        for (_, (id, name, args_str)) in &sorted_tool_calls {
            let args: serde_json::Value =
                serde_json::from_str(args_str).unwrap_or(json!({}));

            // Emit tool_call event to frontend
            let _ = app.emit_to(
                label,
                "agent_tool_call",
                json!({ "id": id, "name": name, "arguments": args_str }),
            );

            // Execute the tool
            let result = execute_tool(name, &args, &workspace_dir).await;

            // Emit tool_result event
            let _ = app.emit_to(
                label,
                "agent_tool_result",
                json!({ "tool_call_id": id, "result": &result }),
            );

            // Add to conversation
            conversation.push(json!({
                "role": "tool",
                "tool_call_id": id,
                "content": result,
            }));
        }

        // Reset for next iteration
        assistant_content = String::new();
    }

    // Safety limit reached (should rarely happen with compaction)
    let _ = app.emit_to(label, "agent_stream", "\n\n*Paused — send a message to continue.*");
    let _ = app.emit_to(label, "agent_stream", "[DONE]");

    Ok(())
}

#[tauri::command]
pub async fn agent_stop(session_id: String) -> Result<(), String> {
    let cancel_tx = {
        let mut sessions = AGENT_SESSIONS
            .lock()
            .map_err(|e| format!("Failed to lock sessions: {}", e))?;
        sessions.remove(&session_id)
    };

    match cancel_tx {
        Some(tx) => {
            let _ = tx.send(());
            Ok(())
        }
        None => Err(format!("Session not found: {}", session_id)),
    }
}
