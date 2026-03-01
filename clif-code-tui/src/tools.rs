//! Tool definitions and execution for the ClifCode agent.

use crate::ui;
use serde::{Deserialize, Serialize};
use std::path::Path;

pub const MAX_TURNS: usize = 7;

/// Tool call from the API response (OpenAI format)
#[derive(Debug, Clone)]
pub struct ApiToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

/// Parsed tool call
#[derive(Debug, Clone)]
pub enum ToolCall {
    ReadFile { path: String, offset: Option<usize> },
    FindFile { name: String, dir: Option<String> },
    WriteFile { path: String, content: String },
    EditFile { path: String, old_string: String, new_string: String },
    ListFiles { path: Option<String> },
    Search { query: String, path: Option<String> },
    RunCommand { command: String },
    ChangeDir { path: String },
    Submit { summary: String },
}

impl ToolCall {
    /// Whether this tool call is read-only and safe to run in parallel
    pub fn is_read_only(&self) -> bool {
        matches!(
            self,
            ToolCall::ReadFile { .. }
                | ToolCall::FindFile { .. }
                | ToolCall::ListFiles { .. }
                | ToolCall::Search { .. }
        )
    }

    pub fn from_api(call: &ApiToolCall) -> Option<Self> {
        let args: serde_json::Value = serde_json::from_str(&call.arguments).ok()?;
        match call.name.as_str() {
            "read_file" => Some(ToolCall::ReadFile {
                path: args.get("path")?.as_str()?.to_string(),
                offset: args.get("offset").and_then(|v| v.as_u64()).map(|n| n as usize),
            }),
            "find_file" => Some(ToolCall::FindFile {
                name: args.get("name")?.as_str()?.to_string(),
                dir: args.get("dir").and_then(|v| v.as_str()).map(|s| s.to_string()),
            }),
            "write_file" => Some(ToolCall::WriteFile {
                path: args.get("path")?.as_str()?.to_string(),
                content: args.get("content")?.as_str()?.to_string(),
            }),
            "edit_file" => Some(ToolCall::EditFile {
                path: args.get("path")?.as_str()?.to_string(),
                old_string: args.get("old_string")?.as_str()?.to_string(),
                new_string: args.get("new_string")?.as_str()?.to_string(),
            }),
            "list_files" => Some(ToolCall::ListFiles {
                path: args.get("path").and_then(|v| v.as_str()).map(|s| s.to_string()),
            }),
            "search" => Some(ToolCall::Search {
                query: args.get("query")?.as_str()?.to_string(),
                path: args.get("path").and_then(|v| v.as_str()).map(|s| s.to_string()),
            }),
            "run_command" => Some(ToolCall::RunCommand {
                command: args.get("command")?.as_str()?.to_string(),
            }),
            "change_directory" => Some(ToolCall::ChangeDir {
                path: args.get("path")?.as_str()?.to_string(),
            }),
            "submit" => Some(ToolCall::Submit {
                summary: args.get("summary")?.as_str()?.to_string(),
            }),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub success: bool,
    pub output: String,
}

/// OpenAI-compatible tool definitions — works with all providers
pub fn tool_definitions() -> serde_json::Value {
    serde_json::json!([
        {
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Read a file's contents. Returns up to 16000 chars at a time. Use offset to read further into large files.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "File path (relative to workspace, or absolute)" },
                        "offset": { "type": "integer", "description": "Character offset to start reading from. Use this to continue reading a large file." }
                    },
                    "required": ["path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "find_file",
                "description": "Find files by name anywhere on the filesystem. Searches recursively. Use this when you don't know where a file is.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string", "description": "File or directory name to search for (partial match)" },
                        "dir": { "type": "string", "description": "Starting directory. Defaults to user home (~)." }
                    },
                    "required": ["name"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "Write content to a file (full replacement). Creates parent directories. Use edit_file for targeted changes instead.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "File path relative to workspace" },
                        "content": { "type": "string", "description": "Full file content to write" }
                    },
                    "required": ["path", "content"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "edit_file",
                "description": "Edit a file by replacing a specific string with new text. Preferred over write_file for targeted changes. Uses fuzzy matching if exact match fails.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "File path relative to workspace" },
                        "old_string": { "type": "string", "description": "Exact text to find (include surrounding context for uniqueness)" },
                        "new_string": { "type": "string", "description": "Replacement text" }
                    },
                    "required": ["path", "old_string", "new_string"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_files",
                "description": "List files and directories in a tree view.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Directory path relative to workspace. Defaults to root." }
                    }
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "search",
                "description": "Search for text pattern in files using grep. Returns matching lines with file paths and line numbers.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Text pattern to search for" },
                        "path": { "type": "string", "description": "Directory to search in. Defaults to workspace root." }
                    },
                    "required": ["query"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "run_command",
                "description": "Execute a shell command in the workspace directory. Returns stdout and stderr.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": { "type": "string", "description": "Shell command to execute" }
                    },
                    "required": ["command"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "change_directory",
                "description": "Change the working directory. Use this when the user wants to switch to a different folder. Accepts absolute paths.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the directory to switch to" }
                    },
                    "required": ["path"]
                }
            }
        },
        {
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
        }
    ])
}

/// Parse tool_calls from an OpenAI-format API response
pub fn parse_api_tool_calls(resp: &serde_json::Value) -> Vec<ApiToolCall> {
    let mut calls = Vec::new();
    if let Some(tool_calls) = resp
        .pointer("/choices/0/message/tool_calls")
        .and_then(|v| v.as_array())
    {
        for tc in tool_calls {
            let id = tc.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let name = tc
                .pointer("/function/name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let arguments = tc
                .pointer("/function/arguments")
                .and_then(|v| v.as_str())
                .unwrap_or("{}")
                .to_string();
            if !name.is_empty() {
                calls.push(ApiToolCall { id, name, arguments });
            }
        }
    }
    calls
}

/// Execute a tool call.
/// `confirm_writes` — prompt Y/n before writes (suggest mode).
/// `collapse_diffs` — show collapsed diff with Ctrl+O to expand (auto-edit mode).
pub fn execute_tool(call: &ToolCall, workspace: &str, confirm_writes: bool, collapse_diffs: bool) -> ToolResult {
    match call {
        ToolCall::ReadFile { path, offset } => exec_read_file(workspace, path, *offset),
        ToolCall::FindFile { name, dir } => exec_find_file(name, dir.as_deref()),
        ToolCall::WriteFile { path, content } => exec_write_file(workspace, path, content, confirm_writes, collapse_diffs),
        ToolCall::EditFile { path, old_string, new_string } => {
            exec_edit_file(workspace, path, old_string, new_string, confirm_writes, collapse_diffs)
        }
        ToolCall::ListFiles { path } => exec_list_files(workspace, path.as_deref()),
        ToolCall::Search { query, path } => exec_search(workspace, query, path.as_deref()),
        ToolCall::RunCommand { command } => exec_run_command(workspace, command),
        ToolCall::ChangeDir { path } => {
            // Handled in run_turn — this is a fallback
            ui::print_tool_action("cd", path);
            ToolResult { success: true, output: format!("Changed to {path}") }
        }
        ToolCall::Submit { summary } => {
            ui::print_success(summary);
            ToolResult { success: true, output: format!("Task complete: {summary}") }
        }
    }
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

const READ_CHUNK: usize = 16000;

fn exec_read_file(workspace: &str, path: &str, offset: Option<usize>) -> ToolResult {
    // Support absolute paths too (for find_file results)
    let full = if Path::new(path).is_absolute() {
        Path::new(path).to_path_buf()
    } else {
        Path::new(workspace).join(path)
    };
    let offset = offset.unwrap_or(0);
    ui::print_tool_action("read", &format!("{}", full.display()));
    match std::fs::read_to_string(&full) {
        Ok(content) => {
            let total = content.len();
            let chunk: String = content.chars().skip(offset).take(READ_CHUNK).collect();
            let end = offset + chunk.len();
            if offset > 0 || total > end {
                ui::print_dim(&format!(
                    "    ({total} chars total, showing {offset}..{end})"
                ));
            }
            let mut output = chunk;
            if end < total {
                output.push_str(&format!(
                    "\n\n[{} more chars remaining — call read_file with offset={} to continue]",
                    total - end,
                    end
                ));
            }
            ToolResult { success: true, output }
        }
        Err(e) => {
            ui::print_error(&format!("Cannot read {}: {e}", full.display()));
            ToolResult { success: false, output: format!("Error: {e}") }
        }
    }
}

fn exec_find_file(name: &str, dir: Option<&str>) -> ToolResult {
    let search_dir = dir.unwrap_or_else(|| {
        // Default to home directory
        "~"
    });
    let expanded = if search_dir == "~" {
        std::env::var("HOME").unwrap_or_else(|_| "/".into())
    } else {
        search_dir.to_string()
    };

    ui::print_tool_action("find", &format!("\"{name}\" in {expanded}"));

    let output = std::process::Command::new("find")
        .args([
            &expanded,
            "-maxdepth", "5",
            "-iname", &format!("*{name}*"),
            "-not", "-path", "*/node_modules/*",
            "-not", "-path", "*/.git/*",
            "-not", "-path", "*/target/*",
            "-not", "-path", "*/__pycache__/*",
            "-not", "-path", "*/Library/*",
            "-not", "-path", "*/.Trash/*",
        ])
        .output();

    match output {
        Ok(out) => {
            let text = String::from_utf8_lossy(&out.stdout);
            let results: Vec<&str> = text.lines().take(30).collect();
            let count = results.len();
            if count > 0 {
                ui::print_dim(&format!("    {count} results"));
            } else {
                ui::print_dim("    No results");
            }
            ToolResult { success: true, output: results.join("\n") }
        }
        Err(e) => ToolResult { success: false, output: format!("Find error: {e}") },
    }
}

fn exec_write_file(workspace: &str, path: &str, content: &str, confirm: bool, collapse_diffs: bool) -> ToolResult {
    let full = Path::new(workspace).join(path);
    ui::print_tool_action("write", &format!("{}", full.display()));

    let old_content = std::fs::read_to_string(&full).unwrap_or_default();

    // Show diff if file exists
    if full.exists() {
        let has_changes = if collapse_diffs {
            ui::print_diff_collapsible(path, &old_content, content)
        } else {
            ui::print_diff(path, &old_content, content)
        };
        if !has_changes {
            ui::print_dim("    (no changes)");
            return ToolResult { success: true, output: format!("{path} unchanged") };
        }
    }

    // Confirm in suggest mode
    if confirm && full.exists() {
        if !ui::confirm("Apply this change?") {
            return ToolResult { success: false, output: "User declined the change".into() };
        }
    }

    if let Some(parent) = full.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    match std::fs::write(&full, content) {
        Ok(()) => {
            let lines = content.lines().count();
            ui::print_success(&format!("  Wrote {path} ({lines} lines)"));
            ToolResult { success: true, output: format!("Wrote {path}") }
        }
        Err(e) => {
            ui::print_error(&format!("Cannot write {}: {e}", full.display()));
            ToolResult { success: false, output: format!("Error: {e}") }
        }
    }
}

fn exec_edit_file(
    workspace: &str,
    path: &str,
    old_string: &str,
    new_string: &str,
    confirm: bool,
    collapse_diffs: bool,
) -> ToolResult {
    let full = Path::new(workspace).join(path);
    ui::print_tool_action("edit", &format!("{}", full.display()));

    let content = match std::fs::read_to_string(&full) {
        Ok(c) => c,
        Err(e) => {
            ui::print_error(&format!("Cannot read {}: {e}", full.display()));
            return ToolResult { success: false, output: format!("Error: {e}") };
        }
    };

    // Try exact match first
    if let Some(pos) = content.find(old_string) {
        let new_content = format!(
            "{}{}{}",
            &content[..pos],
            new_string,
            &content[pos + old_string.len()..]
        );
        if collapse_diffs {
            ui::print_diff_collapsible(path, &content, &new_content);
        } else {
            ui::print_diff(path, &content, &new_content);
        }

        if confirm && !ui::confirm("Apply this change?") {
            return ToolResult { success: false, output: "User declined the change".into() };
        }

        match std::fs::write(&full, &new_content) {
            Ok(()) => {
                ui::print_success(&format!("  Edited {path}"));
                ToolResult { success: true, output: format!("Edited {path}") }
            }
            Err(e) => {
                ui::print_error(&format!("Cannot write {}: {e}", full.display()));
                ToolResult { success: false, output: format!("Error: {e}") }
            }
        }
    } else {
        // Fuzzy fallback
        match fuzzy_find(&content, old_string) {
            Some((start, end, score)) => {
                let matched_preview: String = content[start..end].chars().take(60).collect();
                ui::print_dim(&format!("    (fuzzy match, {score}% similar: \"{matched_preview}...\")"));
                let new_content = format!("{}{}{}", &content[..start], new_string, &content[end..]);
                if collapse_diffs {
                    ui::print_diff_collapsible(path, &content, &new_content);
                } else {
                    ui::print_diff(path, &content, &new_content);
                }

                if confirm && !ui::confirm("Apply this fuzzy match?") {
                    return ToolResult { success: false, output: "User declined the change".into() };
                }

                match std::fs::write(&full, &new_content) {
                    Ok(()) => {
                        ui::print_success(&format!("  Edited {path} (fuzzy match)"));
                        ToolResult { success: true, output: format!("Edited {path} (fuzzy match, {score}% similar)") }
                    }
                    Err(e) => ToolResult { success: false, output: format!("Error: {e}") }
                }
            }
            None => {
                ui::print_error("  String not found (exact or fuzzy)");
                ToolResult {
                    success: false,
                    output: "Error: old_string not found in file (exact and fuzzy search failed)".into(),
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Fuzzy matching for edit_file fallback
// ---------------------------------------------------------------------------

/// Find the best fuzzy match for `needle` in `haystack` using line-based sliding window.
/// Returns (start_byte, end_byte, similarity_percent) or None if <60% similar.
fn fuzzy_find(haystack: &str, needle: &str) -> Option<(usize, usize, usize)> {
    if needle.is_empty() || haystack.is_empty() {
        return None;
    }

    let needle_lines: Vec<&str> = needle.lines().collect();
    let haystack_lines: Vec<&str> = haystack.lines().collect();

    if needle_lines.is_empty() || haystack_lines.is_empty() {
        return None;
    }

    let window = needle_lines.len();
    if window > haystack_lines.len() {
        return None;
    }

    let mut best_score = 0usize;
    let mut best_start_line = 0usize;

    for i in 0..=(haystack_lines.len() - window) {
        let candidate: String = haystack_lines[i..i + window].join("\n");
        let score = line_similarity(needle, &candidate);
        if score > best_score {
            best_score = score;
            best_start_line = i;
        }
    }

    // Require at least 60% similarity
    if best_score < 60 {
        return None;
    }

    // Convert line indices to byte offsets
    let mut start_byte = 0;
    for line in &haystack_lines[..best_start_line] {
        start_byte += line.len() + 1; // +1 for newline
    }
    let mut end_byte = start_byte;
    for line in &haystack_lines[best_start_line..best_start_line + window] {
        end_byte += line.len() + 1;
    }
    end_byte = end_byte.min(haystack.len());

    Some((start_byte, end_byte, best_score))
}

/// Line-based similarity (0-100). Compares trimmed lines.
fn line_similarity(a: &str, b: &str) -> usize {
    let a_lines: Vec<&str> = a.lines().collect();
    let b_lines: Vec<&str> = b.lines().collect();
    let max_len = a_lines.len().max(b_lines.len());
    if max_len == 0 {
        return 100;
    }
    let matching = a_lines
        .iter()
        .zip(b_lines.iter())
        .filter(|(a, b)| a.trim() == b.trim())
        .count();
    (matching * 100) / max_len
}

// ---------------------------------------------------------------------------
// list_files and search implementations
// ---------------------------------------------------------------------------

fn exec_list_files(workspace: &str, path: Option<&str>) -> ToolResult {
    let dir = path
        .map(|p| Path::new(workspace).join(p))
        .unwrap_or_else(|| Path::new(workspace).to_path_buf());
    ui::print_tool_action("list", &format!("{}", dir.display()));

    let mut entries = Vec::new();
    list_dir_recursive(&dir, &dir, 0, 3, &mut entries);
    let output = entries.join("\n");
    let count = entries.len();
    ui::print_dim(&format!("    {count} entries"));
    ToolResult { success: true, output }
}

fn list_dir_recursive(
    base: &Path,
    dir: &Path,
    depth: usize,
    max_depth: usize,
    entries: &mut Vec<String>,
) {
    if depth > max_depth || entries.len() > 200 {
        return;
    }

    let skip = [
        "node_modules", ".git", "target", "__pycache__", ".next",
        "dist", "build", ".DS_Store", ".cache", "vendor",
    ];

    let mut items: Vec<_> = match std::fs::read_dir(dir) {
        Ok(rd) => rd.filter_map(|e| e.ok()).collect(),
        Err(_) => return,
    };
    items.sort_by_key(|e| e.file_name());

    for entry in items {
        let name = entry.file_name().to_string_lossy().to_string();
        if skip.contains(&name.as_str()) {
            continue;
        }
        let indent = "  ".repeat(depth);
        let rel = entry
            .path()
            .strip_prefix(base)
            .unwrap_or(&entry.path())
            .to_string_lossy()
            .to_string();

        if entry.path().is_dir() {
            entries.push(format!("{indent}{rel}/"));
            list_dir_recursive(base, &entry.path(), depth + 1, max_depth, entries);
        } else {
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            let size_str = if size > 1024 * 1024 {
                format!("{}MB", size / (1024 * 1024))
            } else if size > 1024 {
                format!("{}KB", size / 1024)
            } else {
                format!("{size}B")
            };
            entries.push(format!("{indent}{rel} ({size_str})"));
        }
    }
}

fn exec_search(workspace: &str, query: &str, path: Option<&str>) -> ToolResult {
    let dir = path
        .map(|p| Path::new(workspace).join(p).to_string_lossy().to_string())
        .unwrap_or_else(|| workspace.to_string());
    ui::print_tool_action("search", &format!("\"{query}\" in {dir}"));

    let output = std::process::Command::new("grep")
        .args([
            "-rn",
            "--include=*.py", "--include=*.rs", "--include=*.ts", "--include=*.tsx",
            "--include=*.js", "--include=*.jsx", "--include=*.go", "--include=*.toml",
            "--include=*.json", "--include=*.md", "--include=*.yaml", "--include=*.yml",
            "--include=*.c", "--include=*.cpp", "--include=*.h", "--include=*.java",
            "--include=*.swift", "--include=*.kt", "--include=*.rb",
            query, &dir,
        ])
        .output();

    match output {
        Ok(out) => {
            let text: String = String::from_utf8_lossy(&out.stdout)
                .chars()
                .take(4096)
                .collect();
            let count = text.lines().count();
            if count > 0 {
                ui::print_dim(&format!("    {count} matches"));
            } else {
                ui::print_dim("    No matches");
            }
            ToolResult { success: true, output: text }
        }
        Err(e) => ToolResult { success: false, output: format!("Search error: {e}") },
    }
}

fn exec_run_command(workspace: &str, command: &str) -> ToolResult {
    ui::print_tool_action("run", command);
    let output = std::process::Command::new("sh")
        .args(["-c", command])
        .current_dir(workspace)
        .output();
    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let stderr = String::from_utf8_lossy(&out.stderr);
            let combined: String = format!("{stdout}{stderr}").chars().take(4096).collect();
            if out.status.success() {
                ui::print_dim(&format!("    exit 0 ({} chars)", combined.len()));
            } else {
                ui::print_error(&format!("    exit {}", out.status));
            }
            ToolResult { success: out.status.success(), output: combined }
        }
        Err(e) => ToolResult { success: false, output: format!("Command error: {e}") },
    }
}
