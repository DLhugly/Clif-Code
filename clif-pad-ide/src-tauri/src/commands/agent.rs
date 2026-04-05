use serde_json::json;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use uuid::Uuid;

use crate::commands::git::get_git_context;

static AGENT_SESSIONS: std::sync::LazyLock<Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>>> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(HashMap::new())));

// Pending command approvals: session_id -> oneshot sender with bool (true=approved)
static COMMAND_APPROVALS: std::sync::LazyLock<Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<bool>>>>> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(HashMap::new())));

/// Frontend calls this to approve or deny a pending run_command
#[tauri::command]
pub async fn agent_approve_command(session_id: String, approved: bool) -> Result<(), String> {
    let tx = {
        let mut map = COMMAND_APPROVALS.lock().map_err(|e| e.to_string())?;
        map.remove(&session_id)
    };
    if let Some(tx) = tx {
        let _ = tx.send(approved);
    }
    Ok(())
}

/// Kill all active agent sessions (called on window close)
pub fn kill_all_agent_sessions() {
    if let Ok(mut sessions) = AGENT_SESSIONS.lock() {
        for (_, tx) in sessions.drain() {
            let _ = tx.send(());
        }
    }
}

/// Strip OpenAI-only fields that cause 400 errors on other providers
fn strip_openai_fields(mut tools: Vec<serde_json::Value>) -> Vec<serde_json::Value> {
    for tool in &mut tools {
        if let Some(func) = tool.get_mut("function").and_then(|f| f.as_object_mut()) {
            func.remove("strict");
            if let Some(params) = func.get_mut("parameters").and_then(|p| p.as_object_mut()) {
                params.remove("additionalProperties");
            }
        }
    }
    tools
}

/// Tool definitions for OpenAI function-calling format
fn tool_definitions() -> Vec<serde_json::Value> {
    vec![
        json!({
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Read the contents of a file. Read files before editing them. Use this to inspect code, configs, and logs before making changes. For large files, use offset and limit to read specific line ranges instead of the whole file.",
                "strict": true,
                "parameters": {
                    "type": "object",
                    "additionalProperties": false,
                    "properties": {
                        "path": { "type": "string", "description": "Path to the file. Prefer paths inside the current workspace." },
                        "offset": { "type": ["integer", "null"], "description": "1-based starting line number. Omit or null to start from line 1." },
                        "limit": { "type": ["integer", "null"], "description": "Maximum number of lines to return. Omit or null to read the entire file." }
                    },
                    "required": ["path", "offset", "limit"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "Write full content to a file, creating it if necessary. Use this for new files or full rewrites. Do not use this for small localized edits; prefer edit_file for targeted changes.",
                "strict": true,
                "parameters": {
                    "type": "object",
                    "additionalProperties": false,
                    "properties": {
                        "path": { "type": "string", "description": "Path to the file to write. Prefer paths inside the current workspace." },
                        "content": { "type": "string", "description": "Full file content to write." }
                    },
                    "required": ["path", "content"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "edit_file",
                "description": "Make a targeted edit by replacing old_string with new_string exactly once. Read the file first. Prefer this over write_file for localized changes. old_string must match the current file contents exactly, including whitespace.",
                "strict": true,
                "parameters": {
                    "type": "object",
                    "additionalProperties": false,
                    "properties": {
                        "path": { "type": "string", "description": "Path to the file to edit. Prefer paths inside the current workspace." },
                        "old_string": { "type": "string", "description": "Exact text to find and replace. Include enough surrounding context to make the match unique when possible." },
                        "new_string": { "type": "string", "description": "Replacement text." }
                    },
                    "required": ["path", "old_string", "new_string"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "list_files",
                "description": "List files and directories at a path. Use this to explore the workspace before reading or editing files.",
                "strict": true,
                "parameters": {
                    "type": "object",
                    "additionalProperties": false,
                    "properties": {
                        "path": { "type": "string", "description": "Directory path to list. Prefer paths inside the current workspace." }
                    },
                    "required": ["path"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "search",
                "description": "Search for text in files within a directory. Prefer this over run_command for codebase exploration.",
                "strict": true,
                "parameters": {
                    "type": "object",
                    "additionalProperties": false,
                    "properties": {
                        "query": { "type": "string", "description": "Text or pattern to search for." },
                        "path": { "type": "string", "description": "Directory to search in. Prefer paths inside the current workspace." }
                    },
                    "required": ["query", "path"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "run_command",
                "description": "Run a shell command and return its output. Use this mainly for build, test, lint, git, or validation tasks. Prefer read/search/list tools over shell commands for basic exploration. Requires user approval before execution.",
                "strict": true,
                "parameters": {
                    "type": "object",
                    "additionalProperties": false,
                    "properties": {
                        "command": { "type": "string", "description": "Shell command to execute." },
                        "working_dir": { "type": "string", "description": "Working directory for the command. Must stay inside the workspace if provided." }
                    },
                    "required": ["command"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "find_file",
                "description": "Find files or directories by partial name anywhere in the workspace. Use this when you do not know the exact location of something.",
                "strict": true,
                "parameters": {
                    "type": "object",
                    "additionalProperties": false,
                    "properties": {
                        "name": { "type": "string", "description": "File or directory name to search for, partial match allowed." },
                        "dir": { "type": "string", "description": "Starting directory. Defaults to the workspace root." }
                    },
                    "required": ["name"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "change_directory",
                "description": "Change the working directory for subsequent tool calls. Use only when the task clearly requires operating from a different folder inside the workspace.",
                "strict": true,
                "parameters": {
                    "type": "object",
                    "additionalProperties": false,
                    "properties": {
                        "path": { "type": "string", "description": "Directory path to switch to. Must stay inside the workspace." }
                    },
                    "required": ["path"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "submit",
                "description": "Finish the task and provide a brief summary. Only call this when the user's request is complete or you are blocked and have clearly explained why.",
                "strict": true,
                "parameters": {
                    "type": "object",
                    "additionalProperties": false,
                    "properties": {
                        "summary": { "type": "string", "description": "Brief summary of what was completed or what is blocking completion." }
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
         CRITICAL: You MUST use function/tool calls to take action. NEVER describe or narrate using a tool \
         without actually calling it. If you need to read a file, call read_file. If you need to edit, call edit_file. \
         Do not say \"Let me read the file\" and then write text — call the tool.\n\n\
         Operating rules:\n\
         - Be concise and direct.\n\
         - Always call tools to take action — never simulate or narrate tool usage in plain text.\n\
         - Use tools to gather information before answering.\n\
         - Read relevant files before editing them.\n\
         - Prefer list_files, find_file, and search for exploration before using run_command.\n\
         - Use edit_file for small targeted changes and write_file only for new files or full rewrites.\n\
         - After meaningful code changes, run verification commands when feasible.\n\
         - If a tool returns an error, fix the arguments or approach and retry deliberately.\n\
         - Do not call submit until the user's request is complete or you are clearly blocked.\n\
         - Always confirm destructive operations before proceeding.\n\
         - Stay inside the current workspace when reading, writing, searching, or changing directories.\n\
         - Format responses in markdown.\n",
        workspace_dir
    );

    // Auto-inject CLIF.md project context if it exists
    let clif_path = std::path::Path::new(workspace_dir).join(".clif").join("CLIF.md");
    if let Ok(clif_content) = std::fs::read_to_string(&clif_path) {
        prompt.push_str("\n\n## Project Context (from .clif/CLIF.md)\n\n");
        prompt.push_str(&clif_content);
        prompt.push_str("\n\n---\n");
    }

    // Load .clifrules project rules file if it exists (user-defined agent instructions)
    let rules_path = std::path::Path::new(workspace_dir).join(".clifrules");
    if let Ok(rules_content) = std::fs::read_to_string(&rules_path) {
        prompt.push_str("\n\n## Project Rules (from .clifrules)\n\n");
        prompt.push_str(&rules_content);
        prompt.push_str("\n\n---\n");
    }

    // Add git context (branch, modified files, recent commits)
    let git_context = get_git_context(workspace_dir);
    prompt.push_str("\n## Current Git State\n\n");
    prompt.push_str(&git_context);

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
            let offset = args.get("offset").and_then(|v| v.as_u64()).map(|v| v as usize);
            let limit = args.get("limit").and_then(|v| v.as_u64()).map(|v| v as usize);
            let full_path = match ensure_path_in_workspace(path, workspace_dir, false) {
                Ok(path) => path,
                Err(e) => return tool_error("PATH_OUTSIDE_WORKSPACE", e, false),
            };
            match tokio::fs::read_to_string(&full_path).await {
                Ok(content) => {
                    let all_lines: Vec<&str> = content.lines().collect();
                    let total_lines = all_lines.len();
                    let start = offset.unwrap_or(1).max(1).min(total_lines + 1) - 1;
                    let end = match limit {
                        Some(n) => (start + n).min(total_lines),
                        None => total_lines,
                    };
                    let slice = &all_lines[start..end];
                    let width = total_lines.max(1).to_string().len();
                    let numbered: String = slice
                        .iter()
                        .enumerate()
                        .map(|(i, line)| format!("{:>width$}|{}", start + i + 1, line, width = width))
                        .collect::<Vec<_>>()
                        .join("\n");

                    let is_partial = start > 0 || end < total_lines;
                    let header = if is_partial {
                        format!("[Lines {}-{} of {}]\n", start + 1, end, total_lines)
                    } else {
                        String::new()
                    };

                    let value = if numbered.len() > 60000 {
                        format!("{}{}\n\n... (truncated, {} total lines)", header, &numbered[..60000], total_lines)
                    } else {
                        format!("{}{}", header, numbered)
                    };
                    tool_success(json!(value))
                }
                Err(e) => tool_error("READ_FAILED", format!("Error reading file: {}", e), true),
            }
        }
        "write_file" => {
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
            let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let full_path = match ensure_path_in_workspace(path, workspace_dir, true) {
                Ok(path) => path,
                Err(e) => return tool_error("PATH_OUTSIDE_WORKSPACE", e, false),
            };

            if let Some(parent) = full_path.parent() {
                let _ = tokio::fs::create_dir_all(parent).await;
            }

            // Check if file existed before write (for metadata)
            let existed = full_path.exists();
            let old_line_count = if existed {
                tokio::fs::read_to_string(&full_path)
                    .await
                    .map(|c| c.lines().count())
                    .unwrap_or(0)
            } else {
                0
            };
            let new_line_count = content.lines().count();

            match tokio::fs::write(&full_path, content).await {
                Ok(()) => {
                    // Build a small preview of the first few lines
                    let preview_lines: Vec<&str> = content.lines().take(8).collect();
                    let preview = if content.lines().count() > 8 {
                        format!("{}\n  ... ({} more lines)", preview_lines.join("\n"), content.lines().count() - 8)
                    } else {
                        preview_lines.join("\n")
                    };

                    json!({
                        "ok": true,
                        "tool": "write_file",
                        "path": path,
                        "summary": if existed {
                            format!("Overwrote {} — {} → {} lines ({} bytes)", path, old_line_count, new_line_count, content.len())
                        } else {
                            format!("Created {} — {} lines ({} bytes)", path, new_line_count, content.len())
                        },
                        "write": {
                            "created": !existed,
                            "old_line_count": old_line_count,
                            "new_line_count": new_line_count,
                            "bytes": content.len(),
                            "preview": preview,
                        },
                    })
                    .to_string()
                }
                Err(e) => tool_error("WRITE_FAILED", format!("Error writing file: {}", e), true),
            }
        }
        "edit_file" => {
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
            let old_string = args.get("old_string").and_then(|v| v.as_str()).unwrap_or("");
            let new_string = args.get("new_string").and_then(|v| v.as_str()).unwrap_or("");
            let full_path = match ensure_path_in_workspace(path, workspace_dir, true) {
                Ok(path) => path,
                Err(e) => return tool_error("PATH_OUTSIDE_WORKSPACE", e, false),
            };

            match tokio::fs::read_to_string(&full_path).await {
                Ok(content) => {
                    let mut match_found = false;
                    let mut actual_old_string = old_string.to_string();

                    if content.contains(old_string) {
                        match_found = true;
                    } else {
                        // Fallback: try whitespace-agnostic matching
                        let normalize = |s: &str| s.split_whitespace().collect::<Vec<_>>().join(" ");
                        let norm_old = normalize(old_string);
                        
                        // Simple sliding window over lines to find a matching block
                        let lines: Vec<&str> = content.lines().collect();
                        let old_lines_count = old_string.lines().count().max(1);
                        
                        for i in 0..=lines.len().saturating_sub(old_lines_count) {
                            for j in i + 1..=lines.len().min(i + old_lines_count * 2) {
                                let block = lines[i..j].join("\n");
                                if normalize(&block) == norm_old {
                                    actual_old_string = block;
                                    match_found = true;
                                    break;
                                }
                            }
                            if match_found { break; }
                        }
                    }

                    if !match_found {
                        return tool_error(
                            "OLD_STRING_NOT_FOUND",
                            format!("old_string not found in {}. Make sure you are matching the exact indentation and whitespace.", path),
                            true
                        );
                    }

                    // Compute line range of the match before replacing
                    let match_byte_start = content.find(&actual_old_string).unwrap_or(0);
                    let start_line = content[..match_byte_start].lines().count().max(1);
                    let old_line_count = actual_old_string.lines().count().max(1);
                    let new_line_count = new_string.lines().count().max(1);
                    let end_line = start_line + old_line_count - 1;

                    // Build a compact unified diff preview
                    let old_lines: Vec<&str> = actual_old_string.lines().collect();
                    let new_lines: Vec<&str> = new_string.lines().collect();
                    let mut diff_preview = format!("@@ -{},{} +{},{} @@\n", start_line, old_line_count, start_line, new_line_count);
                    for l in &old_lines { diff_preview.push_str(&format!("-{}\n", l)); }
                    for l in &new_lines { diff_preview.push_str(&format!("+{}\n", l)); }

                    let new_content = content.replacen(&actual_old_string, new_string, 1);
                    match tokio::fs::write(&full_path, &new_content).await {
                        Ok(()) => {
                            json!({
                                "ok": true,
                                "tool": "edit_file",
                                "path": path,
                                "summary": format!("Edited {} — lines {}-{}", path, start_line, end_line),
                                "edit": {
                                    "start_line": start_line,
                                    "end_line": end_line,
                                    "old_line_count": old_line_count,
                                    "new_line_count": new_line_count,
                                    "before": old_string,
                                    "after": new_string,
                                },
                                "diff_preview": diff_preview,
                            })
                            .to_string()
                        }
                        Err(e) => tool_error("WRITE_FAILED", format!("Error writing file: {}", e), true),
                    }
                }
                Err(e) => tool_error("READ_FAILED", format!("Error reading file: {}", e), true),
            }
        }
        "list_files" => {
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
            let full_path = match ensure_path_in_workspace(path, workspace_dir, false) {
                Ok(path) => path,
                Err(e) => return tool_error("PATH_OUTSIDE_WORKSPACE", e, false),
            };

            match tokio::fs::read_dir(&full_path).await {
                Ok(mut entries) => {
                    let mut items = Vec::new();
                    while let Ok(Some(entry)) = entries.next_entry().await {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if name.starts_with('.') || name == "node_modules" || name == "target" {
                            continue;
                        }
                        let is_dir = entry.file_type().await.map(|t| t.is_dir()).unwrap_or(false);
                        items.push(if is_dir { format!("{}/", name) } else { name });
                    }
                    items.sort();
                    tool_success(json!(items.join("\n")))
                }
                Err(e) => tool_error("LIST_FAILED", format!("Error listing directory: {}", e), true),
            }
        }
        "search" => {
            let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
            let full_path = match ensure_path_in_workspace(path, workspace_dir, false) {
                Ok(path) => path,
                Err(e) => return tool_error("PATH_OUTSIDE_WORKSPACE", e, false),
            };

            // Feature #4: load .clif-ignore and filter results
            let clif_ignore = load_clif_ignore(workspace_dir);

            let results = crate::commands::search::search_files(full_path.to_string_lossy().to_string(), query.to_string(), None);
            match results {
                Ok(items) => {
                    let value = if items.is_empty() {
                        format!("No results found for '{}'", query)
                    } else {
                        items
                            .iter()
                            .filter(|r| {
                                if clif_ignore.is_empty() { return true; }
                                // Get the filename portion for pattern matching
                                let file_name = std::path::Path::new(&r.file)
                                    .file_name()
                                    .map(|n| n.to_string_lossy().to_string())
                                    .unwrap_or_default();
                                !is_clif_ignored(&file_name, &r.file, &clif_ignore)
                            })
                            .take(50)
                            .map(|r| format!("{}:{}: {}", r.file, r.line, r.content.trim()))
                            .collect::<Vec<_>>()
                            .join("\n")
                    };
                    tool_success(json!(value))
                }
                Err(e) => tool_error("SEARCH_FAILED", format!("Search error: {}", e), true),
            }
        }
        "run_command" => {
            let command = args.get("command").and_then(|v| v.as_str()).unwrap_or("");
            let working_dir = args
                .get("working_dir")
                .and_then(|v| v.as_str())
                .unwrap_or(workspace_dir);
            let safe_working_dir = match ensure_path_in_workspace(working_dir, workspace_dir, false) {
                Ok(path) => path,
                Err(e) => return tool_error("PATH_OUTSIDE_WORKSPACE", e, false),
            };

            // Use login shell to inherit user's PATH (NVM, Homebrew, etc.)
            // This sources .zprofile/.bash_profile before running the command.
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
            let output = tokio::time::timeout(
                std::time::Duration::from_secs(30),
                tokio::process::Command::new(&shell)
                    .arg("-l")
                    .arg("-c")
                    .arg(command)
                    .current_dir(&safe_working_dir)
                    .output()
            ).await;

            match output {
                Ok(Ok(out)) => {
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
                    if result.len() > 20000 {
                        result = format!("{}\n\n... (truncated, {} total bytes)", &result[..20000], result.len());
                    }
                    tool_success(json!(result))
                }
                Ok(Err(e)) => tool_error("COMMAND_FAILED", format!("Error running command: {}", e), true),
                Err(_) => tool_error("COMMAND_TIMEOUT", "Error: command timed out after 30 seconds", true),
            }
        }
        "find_file" => {
            let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let dir = args.get("dir").and_then(|v| v.as_str()).unwrap_or(workspace_dir);
            let full_path = match ensure_path_in_workspace(dir, workspace_dir, false) {
                Ok(path) => path,
                Err(e) => return tool_error("PATH_OUTSIDE_WORKSPACE", e, false),
            };

            let output = tokio::process::Command::new("find")
                .args([
                    full_path.to_string_lossy().as_ref(),
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
                    let value = if results.is_empty() {
                        format!("No files found matching '{}'", name)
                    } else {
                        results.join("\n")
                    };
                    tool_success(json!(value))
                }
                Err(e) => tool_error("FIND_FAILED", format!("Find error: {}", e), true),
            }
        }
        "change_directory" => {
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
            let full_path = match ensure_path_in_workspace(path, workspace_dir, false) {
                Ok(path) => path,
                Err(e) => return tool_error("PATH_OUTSIDE_WORKSPACE", e, false),
            };
            if full_path.is_dir() {
                tool_success(json!(format!("Changed workspace to {}", full_path.display())))
            } else {
                tool_error("NOT_A_DIRECTORY", format!("{} is not a directory", full_path.display()), true)
            }
        }
        "submit" => {
            let summary = args.get("summary").and_then(|v| v.as_str()).unwrap_or("Task complete");
            tool_success(json!(format!("Task complete: {}", summary)))
        }
        _ => tool_error("UNKNOWN_TOOL", format!("Unknown tool: {}", name), false),
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

fn workspace_root(workspace_dir: &str) -> Result<PathBuf, String> {
    std::fs::canonicalize(workspace_dir)
        .map_err(|e| format!("Failed to resolve workspace root '{}': {}", workspace_dir, e))
}

fn canonicalize_existing_path(path: &Path) -> Result<PathBuf, String> {
    std::fs::canonicalize(path)
        .map_err(|e| format!("Failed to resolve path '{}': {}", path.display(), e))
}

fn canonicalize_for_write(path: &Path) -> Result<PathBuf, String> {
    if path.exists() {
        return canonicalize_existing_path(path);
    }

    let parent = path
        .parent()
        .ok_or_else(|| format!("Path '{}' has no parent directory", path.display()))?;
    let canonical_parent = std::fs::canonicalize(parent)
        .map_err(|e| format!("Failed to resolve parent directory '{}': {}", parent.display(), e))?;
    let file_name = path
        .file_name()
        .ok_or_else(|| format!("Invalid file path '{}'", path.display()))?;
    Ok(canonical_parent.join(file_name))
}

fn ensure_path_in_workspace(path: &str, workspace_dir: &str, for_write: bool) -> Result<PathBuf, String> {
    let root = workspace_root(workspace_dir)?;
    let joined = if Path::new(path).is_absolute() {
        PathBuf::from(path)
    } else {
        Path::new(workspace_dir).join(path)
    };

    let canonical = if for_write {
        canonicalize_for_write(&joined)?
    } else {
        canonicalize_existing_path(&joined)?
    };

    if canonical.starts_with(&root) {
        Ok(canonical)
    } else {
        Err(format!(
            "Path '{}' is outside the workspace '{}'",
            canonical.display(),
            root.display()
        ))
    }
}

fn validate_tool_args(name: &str, args: &serde_json::Value) -> Result<(), String> {
    let obj = args
        .as_object()
        .ok_or_else(|| "Tool arguments must be a JSON object".to_string())?;

    let allowed: &[&str] = match name {
        "read_file" => &["path", "offset", "limit"],
        "write_file" => &["path", "content"],
        "edit_file" => &["path", "old_string", "new_string"],
        "list_files" => &["path"],
        "search" => &["query", "path"],
        "run_command" => &["command", "working_dir"],
        "find_file" => &["name", "dir"],
        "change_directory" => &["path"],
        "submit" => &["summary"],
        _ => return Err(format!("Unknown tool: {}", name)),
    };

    for key in obj.keys() {
        if !allowed.contains(&key.as_str()) {
            return Err(format!("Unexpected argument '{}' for tool '{}'", key, name));
        }
    }

    let require_string = |field: &str| -> Result<(), String> {
        match obj.get(field) {
            Some(v) if v.is_string() => Ok(()),
            Some(_) => Err(format!("Field '{}' must be a string", field)),
            None => Err(format!("Missing required field '{}'", field)),
        }
    };

    match name {
        "read_file" => {
            require_string("path")?;
            if let Some(v) = obj.get("offset") {
                if !v.is_null() && !v.is_u64() && !v.is_i64() {
                    return Err("Field 'offset' must be an integer or null".to_string());
                }
            }
            if let Some(v) = obj.get("limit") {
                if !v.is_null() && !v.is_u64() && !v.is_i64() {
                    return Err("Field 'limit' must be an integer or null".to_string());
                }
            }
            Ok(())
        }
        "list_files" | "change_directory" => require_string("path"),
        "write_file" => {
            require_string("path")?;
            require_string("content")
        }
        "edit_file" => {
            require_string("path")?;
            require_string("old_string")?;
            require_string("new_string")
        }
        "search" => {
            require_string("query")?;
            require_string("path")
        }
        "run_command" => {
            require_string("command")?;
            if let Some(v) = obj.get("working_dir") {
                if !v.is_string() {
                    return Err("Field 'working_dir' must be a string".to_string());
                }
            }
            Ok(())
        }
        "find_file" => {
            require_string("name")?;
            if let Some(v) = obj.get("dir") {
                if !v.is_string() {
                    return Err("Field 'dir' must be a string".to_string());
                }
            }
            Ok(())
        }
        "submit" => require_string("summary"),
        _ => Err(format!("Unknown tool: {}", name)),
    }
}

fn tool_error(error_code: &str, message: impl Into<String>, retryable: bool) -> String {
    json!({
        "ok": false,
        "error_code": error_code,
        "message": message.into(),
        "retryable": retryable,
    })
    .to_string()
}

fn tool_success(result: serde_json::Value) -> String {
    json!({
        "ok": true,
        "result": result,
    })
    .to_string()
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

/// Load patterns from `.clif-ignore` in the workspace root.
/// Falls back to an empty list if the file doesn't exist.
fn load_clif_ignore(workspace_dir: &str) -> Vec<String> {
    let path = std::path::Path::new(workspace_dir).join(".clif-ignore");
    match std::fs::read_to_string(path) {
        Ok(content) => content
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty() && !l.starts_with('#'))
            .collect(),
        Err(_) => Vec::new(),
    }
}

/// Returns true if the given relative path or filename should be ignored
/// based on the patterns loaded from `.clif-ignore`.
/// Supports exact name matches and simple glob-style `*` prefix/suffix patterns.
fn is_clif_ignored(name: &str, rel_path: &str, patterns: &[String]) -> bool {
    for pattern in patterns {
        let p = pattern.as_str();
        if p == name || p == rel_path {
            return true;
        }
        // Simple glob: starts with `*` → suffix match
        if let Some(suffix) = p.strip_prefix('*') {
            if name.ends_with(suffix) || rel_path.ends_with(suffix) {
                return true;
            }
        }
        // Simple glob: ends with `*` → prefix match
        if let Some(prefix) = p.strip_suffix('*') {
            if name.starts_with(prefix) || rel_path.starts_with(prefix) {
                return true;
            }
        }
    }
    false
}

fn build_workspace_snapshot(workspace_dir: &str) -> String {
    use walkdir::WalkDir;
    let root = std::path::Path::new(workspace_dir);
    let builtin_skip = ["node_modules", ".git", "target", "dist", ".next", "__pycache__", ".venv", "build", "out"];
    // Feature #4: load user-defined ignore patterns from .clif-ignore
    let clif_ignore = load_clif_ignore(workspace_dir);
    let mut lines = Vec::new();
    let cap = 3000;

    for entry in WalkDir::new(root)
        .max_depth(4)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            if e.depth() > 0 && name.starts_with('.') { return false; }
            if e.file_type().is_dir() && builtin_skip.contains(&name.as_ref()) { return false; }
            // Check user-defined ignore patterns
            let rel = e.path().strip_prefix(root).unwrap_or(e.path())
                .to_string_lossy().to_string();
            if is_clif_ignored(&name, &rel, &clif_ignore) { return false; }
            true
        })
    {
        let entry = match entry { Ok(e) => e, Err(_) => continue };
        if entry.depth() == 0 { continue; }
        let _rel = entry.path().strip_prefix(root).unwrap_or(entry.path());
        let indent = "  ".repeat(entry.depth() - 1);
        let name = entry.file_name().to_string_lossy();
        let suffix = if entry.file_type().is_dir() { "/" } else { "" };
        let line = format!("{}{}{}", indent, name, suffix);
        lines.push(line);
        let total: usize = lines.iter().map(|l| l.len() + 1).sum();
        if total > cap {
            lines.push("  ... (truncated)".to_string());
            break;
        }
    }
    lines.join("\n")
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

    // Emit session ID to frontend so it can call agent_stop
    let _ = window.emit("agent_session_id", &session_id);

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

        let _ = app.emit_to(&label, "agent_status", "");
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
    session_id: &str,
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
    // For OpenRouter: Use array content with cache_control for 90% cost reduction on cached prompts
    // For Ollama: Use string content (Ollama doesn't support array content for system messages)
    let use_caching = provider == "openrouter";
    
    let mut conversation: Vec<serde_json::Value> = if use_caching {
        // Build system prompt as array of text parts for cache_control support
        let mut system_parts: Vec<serde_json::Value> = vec![json!({
            "type": "text",
            "text": system_prompt
        })];
        
        // Add context file contents as additional text parts (same system message)
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
                                system_parts.push(json!({
                                    "type": "text",
                                    "text": format!("Content of {}:\n```\n{}\n```", file_path, truncated)
                                }));
                            }
                        }
                    }
                }
            }
        }
        
        // Tag the LAST static block with cache_control for Anthropic/OpenRouter caching
        // This enables 90% cost reduction on subsequent requests with same prefix
        if let Some(last_part) = system_parts.last_mut().and_then(|p| p.as_object_mut()) {
            last_part.insert("cache_control".to_string(), json!({"type": "ephemeral"}));
        }
        
        vec![json!({
            "role": "system",
            "content": system_parts
        })]
    } else {
        // Ollama: use simple string format (no caching, but maximum compatibility)
        let mut conv = vec![json!({
            "role": "system",
            "content": system_prompt,
        })];
        
        // Add context files as separate system messages
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
                                conv.push(json!({
                                    "role": "system",
                                    "content": format!("Content of {}:\n```\n{}\n```", file_path, truncated),
                                }));
                            }
                        }
                    }
                }
            }
        }
        
        conv
    };

    for msg in &initial_messages {
        // Build content as vision multi-part array when images are present,
        // otherwise use a plain string (cheaper tokens, wider model compat).
        let content_value = if let Some(images) = &msg.images {
            if !images.is_empty() {
                let mut parts: Vec<serde_json::Value> = vec![
                    json!({ "type": "text", "text": &msg.content }),
                ];
                for data_url in images {
                    // data_url is "data:image/png;base64,<b64>" — extract media type + data
                    if let Some(comma_pos) = data_url.find(',') {
                        let header = &data_url[5..comma_pos]; // strip "data:"
                        let (media_type, _) = header.split_once(';').unwrap_or((header, ""));
                        let b64_data = &data_url[comma_pos + 1..];
                        parts.push(json!({
                            "type": "image_url",
                            "image_url": {
                                "url": format!("data:{};base64,{}", media_type, b64_data)
                            }
                        }));
                    }
                }
                serde_json::Value::Array(parts)
            } else {
                serde_json::Value::String(msg.content.clone())
            }
        } else {
            serde_json::Value::String(msg.content.clone())
        };

        conversation.push(json!({
            "role": msg.role,
            "content": content_value,
        }));
    }

    let raw_tools = tool_definitions();
    let tools = if provider == "openai" { raw_tools } else { strip_openai_fields(raw_tools) };
    let client = reqwest::Client::new();
    let max_turns = 200; // Safety limit — compaction handles context

    for _turn in 0..max_turns {
        // Periodic context refresh
        if _turn > 0 && _turn % 50 == 0 {
            let snapshot = build_workspace_snapshot(&workspace_dir);
            if !snapshot.is_empty() {
                conversation.push(json!({
                    "role": "system",
                    "content": format!("[Workspace refreshed — current file tree]\n{}", snapshot),
                }));
            }
        }
        if _turn > 0 && _turn % 100 == 0 {
            let clif_path = std::path::Path::new(&workspace_dir).join(".clif").join("CLIF.md");
            if let Ok(clif_content) = std::fs::read_to_string(&clif_path) {
                conversation.push(json!({
                    "role": "system",
                    "content": format!(
                        "[CLIF.md refreshed — current project context]\n{}\n\n\
                         If you have made structural changes to the project during this session \
                         (new files, renamed modules, changed dependencies), update .clif/CLIF.md \
                         to reflect them using write_file.",
                        clif_content
                    ),
                }));
            }
        }

        // Auto-compact when context grows large. Our estimate runs ~40% below
        // actual token count (JSON overhead, tokenizer differences), so 80K estimated
        // maps to roughly 110-130K real tokens — well within 200K model limits.
        let estimated_tokens = estimate_conversation_tokens(&conversation);
        if estimated_tokens > 80_000 {
            compact_conversation(&mut conversation, 40_000);
            let _ = app.emit_to(label, "agent_stream", "\n*[context compacted]*\n");
        }
        // Check cancellation
        if cancel_rx.try_recv().is_ok() {
            return Ok(());
        }

        let status_msg = if _turn == 0 { "Thinking..." } else { "Planning next step..." };
        let _ = app.emit_to(label, "agent_status", status_msg);

        // On the first turn, check if the last user message contains images.
        // If so, use tool_choice "none" — many providers reject vision + tool_choice:"auto"
        // in the same request, and the model should describe the image first anyway.
        let has_vision_turn = _turn == 0 && conversation.iter().rev().any(|m| {
            m.get("role").and_then(|r| r.as_str()) == Some("user")
            && m.get("content").map(|c| c.is_array()).unwrap_or(false)
        });

        let mut request_body = json!({
            "model": model,
            "messages": conversation,
            "tools": tools,
            "tool_choice": if has_vision_turn { "none" } else { "auto" },
            "stream": true,
            "stream_options": { "include_usage": true },
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
        let mut tool_calls_map: HashMap<usize, (String, String, String)> = HashMap::new();
        let mut finish_reason = String::new();
        let mut turn_prompt_tokens: u64 = 0;
        let mut turn_completion_tokens: u64 = 0;

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
                            // Extract usage from final chunk
                            if let Some(usage) = parsed.get("usage") {
                                if let Some(pt) = usage.get("prompt_tokens").and_then(|v| v.as_u64()) {
                                    turn_prompt_tokens = pt;
                                }
                                if let Some(ct) = usage.get("completion_tokens").and_then(|v| v.as_u64()) {
                                    turn_completion_tokens = ct;
                                }
                            }

                            if let Some(choices) = parsed.get("choices").and_then(|c| c.as_array()) {
                                if let Some(choice) = choices.first() {
                                    if let Some(fr) = choice.get("finish_reason").and_then(|v| v.as_str()) {
                                        finish_reason = fr.to_string();
                                    }

                                    if let Some(delta) = choice.get("delta") {
                                        if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                                            assistant_content.push_str(content);
                                            let _ = app.emit_to(label, "agent_stream", content);
                                        }

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
                                                        // INSTANT FEEDBACK: Emit tool name immediately for UI responsiveness
                                                        // This fires before arguments finish streaming, giving ~1-2s faster perceived speed
                                                        let _ = app.emit_to(label, "agent_tool_start", json!({
                                                            "name": name,
                                                            "index": index
                                                        }));
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

        // Emit usage for this turn
        if turn_prompt_tokens > 0 || turn_completion_tokens > 0 {
            let estimated_ctx = estimate_conversation_tokens(&conversation) as u64;
            let _ = app.emit_to(label, "agent_usage", json!({
                "prompt_tokens": turn_prompt_tokens,
                "completion_tokens": turn_completion_tokens,
                "estimated_context": estimated_ctx,
            }));
        }

        // If the model returned nothing at all (empty content, no tool calls) —
        // most likely a vision-incapable model silently ignored the image.
        if assistant_content.is_empty() && tool_calls_map.is_empty() {
            let hint = if has_vision_turn {
                "⚠️ The model returned an empty response. This usually means it doesn't support vision/images. Try switching to **GPT-4o**, **Claude 3.5 Sonnet**, or **Gemini 1.5 Pro** which support image input."
            } else {
                "⚠️ The model returned an empty response. Try rephrasing your message or switching models."
            };
            let _ = app.emit_to(label, "agent_stream", hint);
            let _ = app.emit_to(label, "agent_stream", "[DONE]");
            return Ok(());
        }

        // If no tool calls, check if the model narrated tool usage without calling tools
        if tool_calls_map.is_empty() || finish_reason != "tool_calls" {
            let narrating = assistant_content.contains("Let me read")
                || assistant_content.contains("Let me edit")
                || assistant_content.contains("Let me search")
                || assistant_content.contains("Let me write")
                || assistant_content.contains("Let me run")
                || assistant_content.contains("Let me find")
                || assistant_content.contains("I'll read")
                || assistant_content.contains("I'll edit")
                || assistant_content.contains("I'll search");

            if narrating && _turn < max_turns - 1 {
                conversation.push(json!({
                    "role": "assistant",
                    "content": &assistant_content,
                }));
                conversation.push(json!({
                    "role": "system",
                    "content": "You described using tools but did not actually call them. \
                        Do not narrate — call the tool functions directly.",
                }));
                continue;
            }

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

        // Execute each tool call (with cancellation checks between each)
        for (_, (id, name, args_str)) in &sorted_tool_calls {
            // Check cancellation before each tool execution
            if cancel_rx.try_recv().is_ok() {
                let _ = app.emit_to(label, "agent_stream", "\n*[Stopped by user]*\n");
                let _ = app.emit_to(label, "agent_stream", "[DONE]");
                return Ok(());
            }

            let args: serde_json::Value = match serde_json::from_str(args_str) {
                Ok(value) => value,
                Err(_e) => {
                    // Try to repair common JSON issues from LLM output (malformed strings, trailing commas, etc.)
                    let repaired = repair_json(args_str);
                    match serde_json::from_str(&repaired) {
                        Ok(value) => {
                            log::info!("Repaired malformed JSON for tool '{}'", name);
                            value
                        }
                        Err(e) => {
                            let result = tool_error(
                                "INVALID_TOOL_ARGUMENTS",
                                format!("Failed to parse tool arguments for '{}': {}", name, e),
                                true,
                            );
                            let _ = app.emit_to(
                                label,
                                "agent_tool_call",
                                json!({ "id": id, "name": name, "arguments": args_str }),
                            );
                            let _ = app.emit_to(
                                label,
                                "agent_tool_result",
                                json!({ "tool_call_id": id, "result": &result }),
                            );
                            conversation.push(json!({
                                "role": "tool",
                                "tool_call_id": id,
                                "content": result,
                            }));
                            continue;
                        }
                    }
                }
            };

            if let Err(e) = validate_tool_args(name, &args) {
                let result = tool_error("INVALID_TOOL_ARGUMENTS", e, true);
                let _ = app.emit_to(
                    label,
                    "agent_tool_call",
                    json!({ "id": id, "name": name, "arguments": args_str }),
                );
                let _ = app.emit_to(
                    label,
                    "agent_tool_result",
                    json!({ "tool_call_id": id, "result": &result }),
                );
                conversation.push(json!({
                    "role": "tool",
                    "tool_call_id": id,
                    "content": result,
                }));
                continue;
            }

            // Handle submit specially — emit the summary as a final assistant
            // message rather than a tool call card, then finish the session.
            if name == "submit" {
                let summary = args
                    .get("summary")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Task complete.");
                let _ = app.emit_to(label, "agent_stream", summary);
                let _ = app.emit_to(label, "agent_stream", "[DONE]");
                return Ok(());
            }

            let tool_status = match name.as_str() {
                "read_file" => "Reading file...",
                "write_file" => "Writing file...",
                "edit_file" => "Editing file...",
                "list_files" => "Exploring files...",
                "search" => "Searching codebase...",
                "find_file" => "Finding file...",
                "run_command" => "Running command...",
                "change_directory" => "Changing directory...",
                _ => "Working...",
            };
            let _ = app.emit_to(label, "agent_status", tool_status);

            // Emit tool_call event to frontend
            let _ = app.emit_to(
                label,
                "agent_tool_call",
                json!({ "id": id, "name": name, "arguments": args_str }),
            );

            // For run_command: request user approval before executing.
            // Emit approval request, wait for frontend response (or cancel).
            let result = if name == "run_command" {
                let command_preview = args.get("command").and_then(|v| v.as_str()).unwrap_or("").to_string();

                let (approval_tx, approval_rx) = tokio::sync::oneshot::channel::<bool>();
                {
                    let mut approvals = COMMAND_APPROVALS.lock().unwrap_or_else(|e| e.into_inner());
                    approvals.insert(session_id.to_string(), approval_tx);
                }

                let _ = app.emit_to(label, "agent_command_approval", json!({
                    "session_id": session_id,
                    "command": command_preview,
                    "tool_call_id": id,
                }));

                // Wait for approval or cancel
                let approved = tokio::select! {
                    result = approval_rx => result.unwrap_or(false),
                    _ = async {
                        loop {
                            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                            if cancel_rx.try_recv().is_ok() { break; }
                        }
                    } => {
                        let _ = app.emit_to(label, "agent_stream", "\n*[Stopped by user]*\n");
                        let _ = app.emit_to(label, "agent_stream", "[DONE]");
                        return Ok(());
                    }
                };

                if !approved {
                    "Command blocked by user.".to_string()
                } else {
                    // Execute with cancel-race
                    tokio::select! {
                        res = execute_tool(name, &args, &workspace_dir) => res,
                        _ = async {
                            loop {
                                tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                                if cancel_rx.try_recv().is_ok() { break; }
                            }
                        } => {
                            let _ = app.emit_to(label, "agent_stream", "\n*[Stopped by user]*\n");
                            let _ = app.emit_to(label, "agent_stream", "[DONE]");
                            return Ok(());
                        }
                    }
                }
            } else {
                execute_tool(name, &args, &workspace_dir).await
            };

            // Notify frontend of file changes so open tabs, git status, and file tree update
            // without relying solely on the OS file watcher (which can be delayed on macOS).
            if matches!(name.as_str(), "write_file" | "edit_file") {
                if let Some(path_str) = args.get("path").and_then(|v| v.as_str()) {
                    let full_path = std::path::Path::new(&workspace_dir).join(path_str);
                    let abs_path = full_path.to_string_lossy().to_string();
                    let _ = app.emit_to(label, "file-changed", json!({ "path": abs_path, "kind": "modify" }));
                }
            }

            // Emit full result to frontend (UI can scroll)
            let _ = app.emit_to(
                label,
                "agent_tool_result",
                json!({ "tool_call_id": id, "result": &result }),
            );

            // Cap tool result before adding to conversation to prevent context explosion.
            // A single uncapped read_file or list_files can add 300K+ tokens.
            const MAX_RESULT_CHARS: usize = 12000;
            let context_result = if result.len() > MAX_RESULT_CHARS {
                let head = &result[..MAX_RESULT_CHARS / 2];
                let tail = &result[result.len() - MAX_RESULT_CHARS / 2..];
                format!(
                    "{}\n\n[... {} chars omitted — use read_file with offset for full content ...]\n\n{}",
                    head,
                    result.len() - MAX_RESULT_CHARS,
                    tail
                )
            } else {
                result
            };

            conversation.push(json!({
                "role": "tool",
                "tool_call_id": id,
                "content": context_result,
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

/// Check if a project has been initialized (has .clif/CLIF.md)
#[tauri::command]
pub async fn clif_project_initialized(workspace_dir: String) -> bool {
    std::path::Path::new(&workspace_dir).join(".clif").join("CLIF.md").exists()
}

/// Read CLIF.md content if it exists
#[tauri::command]
pub async fn clif_read_context(workspace_dir: String) -> Option<String> {
    let path = std::path::Path::new(&workspace_dir).join(".clif").join("CLIF.md");
    std::fs::read_to_string(path).ok()
}

/// Initialize project context — runs a focused agent pass to analyze the codebase
/// and write .clif/CLIF.md with architecture, stack, conventions, and key files.
#[tauri::command]
pub async fn clif_init_project(
    window: tauri::Window,
    workspace_dir: String,
    model: String,
    api_key: Option<String>,
    provider: String,
) -> Result<(), String> {
    let app = window.app_handle().clone();
    let label = window.label().to_string();
    let url = get_provider_url(&provider);
    let key = api_key.or_else(|| load_api_key(&provider));

    let clif_dir = std::path::Path::new(&workspace_dir).join(".clif");
    let _ = std::fs::create_dir_all(&clif_dir);

    let system_prompt = format!(
        "You are a senior engineer performing a codebase analysis for ClifPad. \
         Your ONLY job is to analyze the project at '{}' and write a concise, useful \
         CLIF.md file that will help an AI coding agent understand this project quickly.\n\n\
         Use list_files to explore the structure, read key files (README, package.json, Cargo.toml, \
         pyproject.toml, go.mod, main entry points, config files), and search for patterns.\n\n\
         Then write .clif/CLIF.md with exactly these sections:\n\
         # Project Overview\n(1-2 sentences: what this project does)\n\n\
         # Tech Stack\n(bullet list: languages, frameworks, key dependencies with versions)\n\n\
         # Architecture\n(bullet list: key directories and what they do)\n\n\
         # Key Files\n(bullet list: most important files to know about)\n\n\
         # Build & Run\n(exact commands to install, dev, build, test)\n\n\
         # Conventions\n(coding style, naming conventions, patterns used)\n\n\
         # Important Notes\n(gotchas, environment requirements, things not to break)\n\n\
         Be concise — target 300-500 words total. Focus on what an AI agent needs to \
         understand before making changes. When done, call submit with a summary.",
        workspace_dir
    );

    let messages = vec![
        json!({ "role": "system", "content": system_prompt }),
        json!({ "role": "user", "content": "Analyze this project and write .clif/CLIF.md now." }),
    ];

    let raw_tools = tool_definitions();
    let tools = if provider == "openai" { raw_tools } else { strip_openai_fields(raw_tools) };
    let client = reqwest::Client::new();
    let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel::<()>();
    let session_id = uuid::Uuid::new_v4().to_string();

    {
        let mut sessions = AGENT_SESSIONS.lock().map_err(|e| e.to_string())?;
        sessions.insert(session_id.clone(), cancel_tx);
    }

    let _ = app.emit_to(&label, "clif_init_progress", json!({
        "step": 0, "total": 15, "message": "Starting codebase analysis..."
    }));

    let mut conversation = messages;
    let max_turns = 15;
    let mut step = 0usize;
    let start_time = std::time::Instant::now();

    for _turn in 0..max_turns {
        if cancel_rx.try_recv().is_ok() {
            let _ = app.emit_to(&label, "clif_init_done", json!({ "success": false, "message": "Cancelled" }));
            return Ok(());
        }

        let body = json!({
            "model": model,
            "messages": conversation,
            "tools": tools,
            "stream": false,
        });

        let mut req = client.post(&url).header("Content-Type", "application/json");
        if let Some(ref k) = key {
            req = req.header("Authorization", format!("Bearer {}", k));
        }
        if provider == "openrouter" {
            req = req.header("HTTP-Referer", "https://clif.dev").header("X-Title", "ClifPad");
        }

        let resp = req.json(&body).send().await.map_err(|e| format!("Request failed: {}", e))?;
        if !resp.status().is_success() {
            let err = resp.text().await.unwrap_or_default();
            return Err(format!("API error: {}", err));
        }

        let resp_json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        let finish_reason = resp_json.pointer("/choices/0/finish_reason").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let content = resp_json.pointer("/choices/0/message/content").and_then(|v| v.as_str()).unwrap_or("").to_string();

        let tool_calls_raw = resp_json.pointer("/choices/0/message/tool_calls").and_then(|v| v.as_array()).cloned().unwrap_or_default();

        let assistant_msg = if tool_calls_raw.is_empty() {
            json!({ "role": "assistant", "content": content })
        } else {
            json!({ "role": "assistant", "content": serde_json::Value::Null, "tool_calls": tool_calls_raw })
        };
        conversation.push(assistant_msg);

        if tool_calls_raw.is_empty() || finish_reason != "tool_calls" {
            break;
        }

        for tc in &tool_calls_raw {
            let id = tc.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let name = tc.pointer("/function/name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let args_str = tc.pointer("/function/arguments").and_then(|v| v.as_str()).unwrap_or("{}").to_string();
            let args: serde_json::Value = match serde_json::from_str(&args_str) {
                Ok(v) => v,
                Err(e) => {
                    let result = tool_error(
                        "INVALID_TOOL_ARGUMENTS",
                        format!("Failed to parse tool arguments for '{}': {}", name, e),
                        true,
                    );
                    conversation.push(json!({ "role": "tool", "tool_call_id": id, "content": result }));
                    continue;
                }
            };

            if let Err(e) = validate_tool_args(&name, &args) {
                let result = tool_error("INVALID_TOOL_ARGUMENTS", e, true);
                conversation.push(json!({ "role": "tool", "tool_call_id": id, "content": result }));
                continue;
            }

            step += 1;
            let elapsed = start_time.elapsed().as_secs();
            // Human-readable label for each tool
            let friendly = match name.as_str() {
                "list_files" => {
                    let path = args.get("path").and_then(|v| v.as_str()).unwrap_or(".");
                    format!("Exploring {}", path)
                }
                "read_file" => {
                    let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("a file");
                    let name_only = std::path::Path::new(path).file_name()
                        .and_then(|n| n.to_str()).unwrap_or(path);
                    format!("Reading {}", name_only)
                }
                "search" => {
                    let q = args.get("query").and_then(|v| v.as_str()).unwrap_or("...");
                    format!("Searching for \"{}\"", q)
                }
                "write_file" => "Writing .clif/CLIF.md".to_string(),
                "run_command" => {
                    let cmd = args.get("command").and_then(|v| v.as_str()).unwrap_or("...");
                    format!("Running: {}", &cmd[..cmd.len().min(40)])
                }
                "submit" => "Finalizing context file...".to_string(),
                _ => format!("{}...", name),
            };

            let _ = app.emit_to(&label, "clif_init_progress", json!({
                "step": step,
                "total": max_turns,
                "message": friendly,
                "elapsed_secs": elapsed,
            }));

            if name == "submit" {
                let summary = args.get("summary").and_then(|v| v.as_str()).unwrap_or("Project analyzed");
                let clif_path = clif_dir.join("CLIF.md");
                let exists = clif_path.exists();
                let _ = app.emit_to(&label, "clif_init_done", json!({
                    "success": exists,
                    "message": summary,
                    "path": clif_path.to_string_lossy(),
                    "elapsed_secs": start_time.elapsed().as_secs(),
                }));
                let mut sessions = AGENT_SESSIONS.lock().unwrap_or_else(|e| e.into_inner());
                sessions.remove(&session_id);
                return Ok(());
            }

            let result = execute_tool(&name, &args, &workspace_dir).await;
            conversation.push(json!({ "role": "tool", "tool_call_id": id, "content": result }));
        }
    }

    let clif_path = clif_dir.join("CLIF.md");
    let _ = app.emit_to(&label, "clif_init_done", json!({
        "success": clif_path.exists(),
        "message": "Analysis complete",
        "path": clif_path.to_string_lossy(),
    }));
    let mut sessions = AGENT_SESSIONS.lock().unwrap_or_else(|e| e.into_inner());
    sessions.remove(&session_id);
    Ok(())
}

/// Attempt to repair common JSON malformations from LLM output.
/// This handles issues like unescaped newlines, trailing commas, and missing brackets.
fn repair_json(input: &str) -> String {
    let mut s = input.to_string();
    
    // Fix unescaped newlines inside string values
    // This is a simple heuristic - replace actual newlines with \n escape sequence
    // but only inside quoted strings (simplified approach)
    s = s.replace("\\\n", "\\n");
    s = s.replace("\\\r", "\\r");
    s = s.replace("\\\t", "\\t");
    
    // Fix trailing commas before closing brackets
    s = s.replace(",]", "]");
    s = s.replace(",}", "}");
    
    // Fix missing closing quotes (odd number of quotes)
    let open_quotes = s.matches('"').count();
    if open_quotes % 2 != 0 {
        s.push('"');
    }
    
    // Fix missing closing braces
    let open_braces = s.matches('{').count();
    let close_braces = s.matches('}').count();
    for _ in 0..open_braces.saturating_sub(close_braces) {
        s.push('}');
    }
    
    // Fix missing closing brackets
    let open_brackets = s.matches('[').count();
    let close_brackets = s.matches(']').count();
    for _ in 0..open_brackets.saturating_sub(close_brackets) {
        s.push(']');
    }
    
    s
}
