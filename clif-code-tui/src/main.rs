//! ClifCode — AI coding assistant.
//!
//! A TUI that runs in any terminal.
//! Supports multiple backends:
//!   - API: OpenRouter, OpenAI, Anthropic, or any OpenAI-compatible endpoint
//!   - Ollama: local LLM server
//!   - Stub: testing mode (no model needed)
//!
//! Install: cargo install --path clifcode
//! Usage:
//!   clifcode                                    # auto-detect backend
//!   clifcode --backend api --api-model gpt-4o
//!   clifcode --backend ollama --api-model codellama

mod backend;
mod config;
mod git;
mod repomap;
mod session;
mod tools;
mod ui;

use anyhow::Result;
use clap::{Parser, ValueEnum};
use std::io::{self, BufRead, Write};
use std::path::PathBuf;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

#[derive(Clone, ValueEnum, Debug)]
enum Backend {
    /// Auto-detect: try api → ollama → stub
    Auto,
    /// OpenAI-compatible API
    Api,
    /// Ollama local server
    Ollama,
    /// Testing stub (no model)
    Stub,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Autonomy {
    /// Show diff, ask Y/n before each write/edit
    Suggest,
    /// Show diff, apply automatically
    AutoEdit,
    /// Apply silently
    FullAuto,
}

impl std::fmt::Display for Autonomy {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Autonomy::Suggest => write!(f, "suggest"),
            Autonomy::AutoEdit => write!(f, "auto-edit"),
            Autonomy::FullAuto => write!(f, "full-auto"),
        }
    }
}

#[derive(Parser)]
#[command(
    name = "clifcode",
    about = "ClifCode — AI coding assistant",
    long_about = "AI coding assistant with tool-calling agent loop.\n\
        Works with any OpenAI-compatible API, Ollama, or local models.\n\
        Runs in any terminal."
)]
struct Cli {
    /// Backend to use
    #[arg(long, value_enum, default_value = "auto")]
    backend: Backend,

    /// API base URL (default: OpenRouter)
    #[arg(long, env = "CLIFCODE_API_URL")]
    api_url: Option<String>,

    /// API key
    #[arg(long, env = "CLIFCODE_API_KEY")]
    api_key: Option<String>,

    /// Model name for API calls
    #[arg(long, env = "CLIFCODE_API_MODEL")]
    api_model: Option<String>,

    /// Working directory (defaults to cwd)
    #[arg(long, short = 'w')]
    workspace: Option<PathBuf>,

    /// Max tokens to generate per response
    #[arg(long, default_value = "1024")]
    max_tokens: usize,

    /// Non-interactive: run a single prompt and exit
    #[arg(long, short = 'p')]
    prompt: Option<String>,

    /// Autonomy level: suggest, auto-edit, full-auto
    #[arg(long, default_value = "auto-edit")]
    autonomy: String,

    /// Resume a previous session by ID
    #[arg(long)]
    resume: Option<String>,
}

// ---------------------------------------------------------------------------
// Conversation state
// ---------------------------------------------------------------------------

struct Conversation {
    messages: Vec<serde_json::Value>,
}

impl Conversation {
    fn new(workspace: &str, autonomy: &Autonomy, context_files: &[String]) -> Self {
        let repo_map = repomap::scan_workspace(workspace);
        let auto_ctx = repomap::auto_context(workspace);

        let mut system_parts = vec![
            format!(
                "You are ClifCode, an AI assistant that helps with coding and file tasks.\n\
                 Workspace: {workspace}\n\
                 Mode: {autonomy}\n\
                 Max turns: {}\n\n\
                 CRITICAL BEHAVIOR RULES:\n\
                 1. BE PROACTIVE. When the user asks a question, READ files to find the answer. NEVER say \"could you provide more details\" or \"let me know\" when you can look it up yourself.\n\
                 2. When the user asks \"which is best/most likely/top\", READ the relevant data files and ANALYZE them. Give a direct answer with reasoning.\n\
                 3. If a file was truncated, use read_file with offset to get the rest. Read the ENTIRE file before answering.\n\
                 4. Use find_file to locate files by name when you don't know the path.\n\
                 5. Use change_directory when the user wants to switch to a different folder.\n\
                 6. Prefer edit_file for targeted changes, write_file for new files.\n\
                 7. Call submit when a coding task is done.\n\
                 8. Remember context from earlier in the conversation.\n\
                 9. NEVER ask the user to clarify something you can figure out from the files.\n\
                 10. READ COMPREHENSIVELY. When asked to analyze, summarize, or make recommendations about a directory or project, FIRST use list_files to see everything available, THEN read ALL relevant files — not just 1-2. Read every doc, every config, every data file that could inform your answer. Use multiple read_file calls in the same turn. Partial reading leads to bad answers.\n\
                 11. When creating a file based on analysis, make sure you have read ALL source material first. If there are 10 relevant files, read all 10 before writing your summary.",
                tools::MAX_TURNS
            ),
            format!("Repo map:\n{repo_map}"),
        ];

        // Auto-context: inject project identity files (README, Cargo.toml, etc.)
        if !auto_ctx.is_empty() {
            let names: Vec<&str> = auto_ctx.iter().map(|(n, _)| n.as_str()).collect();
            ui::print_dim(&format!("  Auto-context: {}", names.join(", ")));
            for (name, content) in &auto_ctx {
                system_parts.push(format!("Project file {name}:\n```\n{content}\n```"));
            }
        }

        // Manually added context files
        for file_path in context_files {
            let full = std::path::Path::new(workspace).join(file_path);
            if let Ok(content) = std::fs::read_to_string(&full) {
                let truncated: String = content.chars().take(4000).collect();
                system_parts.push(format!("File {file_path}:\n```\n{truncated}\n```"));
            }
        }

        let system_content = system_parts.join("\n\n");

        Conversation {
            messages: vec![serde_json::json!({"role": "system", "content": system_content})],
        }
    }
}

// ---------------------------------------------------------------------------
// Agent loop — operates on a persistent conversation
// ---------------------------------------------------------------------------

fn run_turn(
    bk: &backend::ModelBackend,
    conv: &mut Conversation,
    input: &str,
    workspace: &mut String,
    autonomy: &Autonomy,
    auto_commit: bool,
) -> Result<backend::TokenUsage> {
    // Add the user message to the ongoing conversation
    conv.messages
        .push(serde_json::json!({"role": "user", "content": input}));

    let tool_defs = tools::tool_definitions();
    let confirm_writes = *autonomy == Autonomy::Suggest;
    let collapse_diffs = *autonomy == Autonomy::AutoEdit;
    let mut files_changed = Vec::new();
    let mut turn_usage = backend::TokenUsage::default();

    for turn in 1..=tools::MAX_TURNS {
        ui::print_turn_indicator(turn, tools::MAX_TURNS);
        ui::print_thinking();

        // Use streaming for API backend — tokens print live
        let response = bk.chat_stream(&conv.messages, Some(&tool_defs))?;
        ui::clear_thinking();

        // Accumulate token usage
        if let Some(ref u) = response.usage {
            turn_usage.prompt_tokens += u.prompt_tokens;
            turn_usage.completion_tokens += u.completion_tokens;
        }

        // Only print via render_markdown if content wasn't already streamed
        if !response.content.is_empty() && !response.streamed {
            ui::print_assistant(&response.content);
        }

        // No tool calls — model just responded with text, conversation continues
        if response.tool_calls.is_empty() {
            conv.messages.push(response.raw_message);
            return Ok(turn_usage);
        }

        conv.messages.push(response.raw_message.clone());

        // Parse all tool calls, track order for message insertion
        let parsed: Vec<(usize, &tools::ApiToolCall, Option<tools::ToolCall>)> = response
            .tool_calls
            .iter()
            .enumerate()
            .map(|(i, api_call)| (i, api_call, tools::ToolCall::from_api(api_call)))
            .collect();

        // Allocate result slots (index -> tool message JSON)
        let mut result_slots: Vec<Option<serde_json::Value>> = vec![None; parsed.len()];

        // --- Phase 1: Handle control-flow calls (submit, change_directory) immediately ---
        for (idx, api_call, tool_call) in &parsed {
            if let Some(tools::ToolCall::Submit { ref summary }) = tool_call {
                if response.content.is_empty() {
                    ui::print_assistant(summary);
                }
                conv.messages.push(serde_json::json!({
                    "role": "tool",
                    "tool_call_id": api_call.id,
                    "content": format!("Task complete: {summary}")
                }));
                if auto_commit && !files_changed.is_empty() && git::is_git_repo(workspace) {
                    let msg = format!(
                        "ClifCode: {}",
                        summary.chars().take(72).collect::<String>()
                    );
                    match git::git_auto_commit(workspace, &msg) {
                        Ok(hash) => ui::print_dim(&format!("    [committed {hash}]")),
                        Err(e) => ui::print_dim(&format!("    [commit skipped: {e}]")),
                    }
                }
                return Ok(turn_usage);
            }

            if let Some(tools::ToolCall::ChangeDir { ref path }) = tool_call {
                let target = std::path::Path::new(path);
                if target.is_dir() {
                    let canonical = target.canonicalize().unwrap_or_else(|_| target.to_path_buf());
                    *workspace = canonical.to_string_lossy().to_string();
                    ui::print_tool_action("cd", workspace);
                    ui::print_success(&format!("  Workspace: {workspace}"));
                    result_slots[*idx] = Some(serde_json::json!({
                        "role": "tool",
                        "tool_call_id": api_call.id,
                        "content": format!("Changed workspace to {}. The repo map for this directory:\n{}", workspace, repomap::scan_workspace(workspace))
                    }));
                } else {
                    ui::print_error(&format!("  Not a directory: {path}"));
                    result_slots[*idx] = Some(serde_json::json!({
                        "role": "tool",
                        "tool_call_id": api_call.id,
                        "content": format!("Error: {path} is not a directory")
                    }));
                }
            }
        }

        // --- Phase 2: Partition remaining into parallel (read-only) and sequential ---
        let mut parallel_indices = Vec::new();
        let mut sequential_indices = Vec::new();

        for (idx, api_call, tool_call) in &parsed {
            if result_slots[*idx].is_some() {
                continue; // Already handled (change_directory)
            }
            match tool_call {
                None => {
                    result_slots[*idx] = Some(serde_json::json!({
                        "role": "tool",
                        "tool_call_id": api_call.id,
                        "content": format!("Unknown tool: {}", api_call.name)
                    }));
                }
                Some(tc) if tc.is_read_only() => {
                    parallel_indices.push(*idx);
                }
                Some(_) => {
                    sequential_indices.push(*idx);
                }
            }
        }

        // --- Phase 3: Run parallel batch on threads ---
        if parallel_indices.len() > 1 {
            let ws: &str = workspace;
            let parallel_items: Vec<(usize, &tools::ToolCall, &str)> = parallel_indices
                .iter()
                .filter_map(|&idx| {
                    parsed[idx].2.as_ref().map(|tc| (idx, tc, parsed[idx].1.id.as_str()))
                })
                .collect();

            let results: Vec<(usize, String, String)> = std::thread::scope(|s| {
                let handles: Vec<_> = parallel_items
                    .iter()
                    .map(|&(idx, tc, call_id)| {
                        s.spawn(move || {
                            let result = tools::execute_tool(tc, ws, false, false);
                            let json = serde_json::to_string(&result).unwrap_or_default();
                            (idx, call_id.to_string(), json)
                        })
                    })
                    .collect();
                handles.into_iter().map(|h| h.join().unwrap()).collect()
            });

            for (idx, call_id, result_json) in results {
                result_slots[idx] = Some(serde_json::json!({
                    "role": "tool",
                    "tool_call_id": call_id,
                    "content": result_json
                }));
            }
        } else if parallel_indices.len() == 1 {
            // Single read-only call — no need for threads
            let idx = parallel_indices[0];
            if let Some(ref tc) = parsed[idx].2 {
                let result = tools::execute_tool(tc, workspace, confirm_writes, collapse_diffs);
                let result_json = serde_json::to_string(&result)?;
                result_slots[idx] = Some(serde_json::json!({
                    "role": "tool",
                    "tool_call_id": parsed[idx].1.id,
                    "content": result_json
                }));
            }
        }

        // --- Phase 4: Run sequential batch in order ---
        for idx in sequential_indices {
            if let Some(ref tc) = parsed[idx].2 {
                // Track file changes
                match tc {
                    tools::ToolCall::WriteFile { path, .. }
                    | tools::ToolCall::EditFile { path, .. } => {
                        if !files_changed.contains(path) {
                            files_changed.push(path.clone());
                        }
                    }
                    _ => {}
                }

                let result = tools::execute_tool(tc, workspace, confirm_writes, collapse_diffs);
                let result_json = serde_json::to_string(&result)?;
                result_slots[idx] = Some(serde_json::json!({
                    "role": "tool",
                    "tool_call_id": parsed[idx].1.id,
                    "content": result_json
                }));
            }
        }

        // --- Phase 5: Push results in original order ---
        for slot in result_slots {
            if let Some(msg) = slot {
                conv.messages.push(msg);
            }
        }

        // Context compaction
        session::compact_messages(&mut conv.messages, 8000);
    }

    ui::print_dim("  (reached turn limit)");

    if auto_commit && !files_changed.is_empty() && git::is_git_repo(workspace) {
        let msg = format!("ClifCode: modified {}", files_changed.join(", "));
        match git::git_auto_commit(workspace, &msg) {
            Ok(hash) => ui::print_dim(&format!("    [committed {hash}]")),
            Err(e) => ui::print_dim(&format!("    [commit skipped: {e}]")),
        }
    }

    Ok(turn_usage)
}

/// Simple ISO-ish timestamp without external deps
fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Convert to rough YYYY-MM-DD HH:MM (good enough for session listing)
    let days = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    // Days since 1970-01-01 → approximate date
    let mut y = 1970i64;
    let mut remaining = days as i64;
    loop {
        let days_in_year = if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) { 366 } else { 365 };
        if remaining < days_in_year {
            break;
        }
        remaining -= days_in_year;
        y += 1;
    }
    let leap = y % 4 == 0 && (y % 100 != 0 || y % 400 == 0);
    let mdays = [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut m = 0;
    for (i, &d) in mdays.iter().enumerate() {
        if remaining < d {
            m = i + 1;
            break;
        }
        remaining -= d;
    }
    let day = remaining + 1;
    format!("{y:04}-{m:02}-{day:02} {hours:02}:{minutes:02}")
}

// ---------------------------------------------------------------------------
// Backend resolution
// ---------------------------------------------------------------------------

fn resolve_backend(cli: &Cli) -> Result<backend::ModelBackend> {
    match cli.backend {
        Backend::Api => {
            let url = cli
                .api_url
                .clone()
                .unwrap_or_else(|| "https://openrouter.ai/api/v1".into());
            let key = cli.api_key.clone();
            let model = cli
                .api_model
                .clone()
                .unwrap_or_else(|| "anthropic/claude-sonnet-4".into());
            Ok(backend::ModelBackend::Api {
                url,
                key,
                model,
                max_tokens: cli.max_tokens,
            })
        }
        Backend::Ollama => {
            let url = cli
                .api_url
                .clone()
                .unwrap_or_else(|| "http://localhost:11434/v1".into());
            let model = cli
                .api_model
                .clone()
                .unwrap_or_else(|| "qwen2.5-coder:7b".into());
            Ok(backend::ModelBackend::Api {
                url,
                key: None,
                model,
                max_tokens: cli.max_tokens,
            })
        }
        Backend::Stub => Ok(backend::ModelBackend::Stub),
        Backend::Auto => {
            // 1. CLI/env API key
            if cli.api_key.is_some() {
                let url = cli
                    .api_url
                    .clone()
                    .unwrap_or_else(|| "https://openrouter.ai/api/v1".into());
                let model = cli
                    .api_model
                    .clone()
                    .unwrap_or_else(|| "anthropic/claude-sonnet-4".into());
                return Ok(backend::ModelBackend::Api {
                    url,
                    key: cli.api_key.clone(),
                    model,
                    max_tokens: cli.max_tokens,
                });
            }
            // 3. Saved config
            if let Some(key) = config::saved_api_key() {
                let url = cli
                    .api_url
                    .clone()
                    .or_else(config::saved_api_url)
                    .unwrap_or_else(|| "https://openrouter.ai/api/v1".into());
                let model = cli
                    .api_model
                    .clone()
                    .or_else(config::saved_api_model)
                    .unwrap_or_else(|| "anthropic/claude-sonnet-4".into());
                return Ok(backend::ModelBackend::Api {
                    url,
                    key: Some(key),
                    model,
                    max_tokens: cli.max_tokens,
                });
            }
            // 4. Ollama
            if backend::detect_ollama() {
                let model = cli
                    .api_model
                    .clone()
                    .unwrap_or_else(|| "qwen2.5-coder:7b".into());
                return Ok(backend::ModelBackend::Api {
                    url: "http://localhost:11434/v1".into(),
                    key: None,
                    model,
                    max_tokens: cli.max_tokens,
                });
            }
            // 5. Interactive setup
            if let Some((key, url, model)) = config::interactive_setup() {
                return Ok(backend::ModelBackend::Api {
                    url,
                    key: Some(key),
                    model,
                    max_tokens: cli.max_tokens,
                });
            }
            // 6. Stub fallback
            Ok(backend::ModelBackend::Stub)
        }
    }
}

// ---------------------------------------------------------------------------
// Slash commands help
// ---------------------------------------------------------------------------

fn print_help() {
    println!();
    println!(
        "  {}{}Commands{}",
        ui::BOLD, ui::WHITE, ui::RESET
    );
    println!(
        "  {}Type any coding task and ClifCode will solve it.{}",
        ui::DIM, ui::RESET
    );
    println!();

    // Session group
    println!(
        "  {}{}\u{25c6} Session{}",
        ui::BOLD, ui::BRIGHT_CYAN, ui::RESET
    );
    let session_cmds = [
        ("new", "Start a new conversation"),
        ("sessions", "List saved sessions"),
        ("resume", "Resume a saved session"),
        ("cost", "Show token usage and cost"),
        ("clear", "Clear screen"),
        ("quit", "Exit ClifCode"),
    ];
    for (cmd, desc) in &session_cmds {
        println!(
            "    {}{}{:<12}{} {}{}{}",
            ui::BOLD, ui::BRIGHT_CYAN, cmd, ui::RESET,
            ui::DIM, desc, ui::RESET
        );
    }
    println!();

    // Workspace group
    println!(
        "  {}{}\u{25c6} Workspace{}",
        ui::BOLD, ui::BRIGHT_MAGENTA, ui::RESET
    );
    let workspace_cmds = [
        ("cd <dir>", "Change workspace directory"),
        ("add <file>", "Add file to context"),
        ("drop <file>", "Remove file from context"),
        ("context", "Show context files"),
    ];
    for (cmd, desc) in &workspace_cmds {
        println!(
            "    {}{}{:<12}{} {}{}{}",
            ui::BOLD, ui::BRIGHT_MAGENTA, cmd, ui::RESET,
            ui::DIM, desc, ui::RESET
        );
    }
    println!();

    // Tools group
    println!(
        "  {}{}\u{25c6} Settings{}",
        ui::BOLD, ui::BRIGHT_YELLOW, ui::RESET
    );
    let tools_cmds = [
        ("mode", "Switch autonomy level"),
        ("backend", "Show current backend"),
        ("config", "Re-run provider setup"),
    ];
    for (cmd, desc) in &tools_cmds {
        println!(
            "    {}{}{:<12}{} {}{}{}",
            ui::BOLD, ui::BRIGHT_YELLOW, cmd, ui::RESET,
            ui::DIM, desc, ui::RESET
        );
    }
    println!();

    // Git group
    println!(
        "  {}{}\u{25c6} Git{}",
        ui::BOLD, ui::BRIGHT_GREEN, ui::RESET
    );
    let git_cmds = [
        ("status", "Git status"),
        ("undo", "Undo last ClifCode commit"),
    ];
    for (cmd, desc) in &git_cmds {
        println!(
            "    {}{}{:<12}{} {}{}{}",
            ui::BOLD, ui::BRIGHT_GREEN, cmd, ui::RESET,
            ui::DIM, desc, ui::RESET
        );
    }

    println!();
    println!(
        "  {}{}Tip:{} {}{}{} to expand diffs in auto-edit mode",
        ui::BOLD, ui::WHITE, ui::RESET,
        ui::BOLD, "Ctrl+O", ui::RESET
    );
    println!();
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

fn main() -> Result<()> {
    // Ctrl+C handler — ensure clean exit even if raw mode is active
    ctrlc::set_handler(move || {
        // Restore terminal state before exiting
        let _ = crossterm::terminal::disable_raw_mode();
        print!("\x1b[0m"); // reset ANSI
        println!();
        println!("  \x1b[2mInterrupted.\x1b[0m");
        std::process::exit(0);
    })
    .ok();

    let cli = Cli::parse();

    let workspace = cli
        .workspace
        .clone()
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
    let mut workspace_str = workspace.to_string_lossy().to_string();

    // Non-interactive mode
    if cli.prompt.is_some() {
        let bk = resolve_backend(&cli)?;
        let mut conv = Conversation::new(&workspace_str, &Autonomy::AutoEdit, &[]);
        let usage = run_turn(&bk, &mut conv, cli.prompt.as_ref().unwrap(), &mut workspace_str, &Autonomy::AutoEdit, false)?;
        if usage.prompt_tokens > 0 || usage.completion_tokens > 0 {
            ui::print_usage(usage.prompt_tokens, usage.completion_tokens);
        }
        return Ok(());
    }

    // Interactive mode
    ui::print_logo();
    let mut bk = resolve_backend(&cli)?;

    let mut autonomy = match cli.autonomy.as_str() {
        "suggest" => Autonomy::Suggest,
        "full" | "full-auto" => Autonomy::FullAuto,
        _ => Autonomy::AutoEdit,
    };

    let mut context_files: Vec<String> = Vec::new();
    let auto_commit = git::is_git_repo(&workspace_str);
    let mut session_prompt_tokens: usize = 0;
    let mut session_completion_tokens: usize = 0;
    let mut session_id = session::new_session_id();

    // Persistent conversation — remembers context across turns
    let mut conv;

    // Resume previous session if requested
    if let Some(ref resume_id) = cli.resume {
        match session::load_session(resume_id) {
            Ok(s) => {
                session_id = s.id.clone();
                workspace_str = s.workspace.clone();
                context_files = s.context_files.clone();
                autonomy = match s.autonomy.as_str() {
                    "suggest" => Autonomy::Suggest,
                    "full-auto" => Autonomy::FullAuto,
                    _ => Autonomy::AutoEdit,
                };
                conv = Conversation { messages: s.messages };
                ui::print_success(&format!("  Resumed session {resume_id}"));
            }
            Err(e) => {
                ui::print_error(&format!("  Cannot resume: {e}"));
                conv = Conversation::new(&workspace_str, &autonomy, &context_files);
            }
        }
    } else {
        conv = Conversation::new(&workspace_str, &autonomy, &context_files);
    }

    println!();
    ui::print_banner(&workspace_str, bk.name(), &autonomy.to_string());

    let stdin = io::stdin();
    loop {
        ui::print_prompt();

        let mut input = String::new();
        if stdin.lock().read_line(&mut input)? == 0 {
            break;
        }
        let input = input.trim();
        if input.is_empty() {
            continue;
        }

        // Normalize: strip leading `/`, lowercase for command matching
        let cmd = input.trim_start_matches('/').to_lowercase();
        let parts: Vec<&str> = cmd.splitn(2, ' ').collect();

        match parts[0] {
            "quit" | "exit" | "q" => {
                println!("  {}Goodbye.{}", ui::DIM, ui::RESET);
                break;
            }
            "help" | "h" | "?" => {
                print_help();
                continue;
            }
            "new" | "reset" => {
                session_id = session::new_session_id();
                conv = Conversation::new(&workspace_str, &autonomy, &context_files);
                session_prompt_tokens = 0;
                session_completion_tokens = 0;
                ui::print_dim("  New conversation started.");
                continue;
            }
            "sessions" => {
                let sessions = session::list_sessions();
                if sessions.is_empty() {
                    ui::print_dim("  No saved sessions.");
                } else {
                    println!();
                    println!("  {}Saved sessions{}", ui::BOLD, ui::RESET);
                    for (id, date, preview) in &sessions {
                        println!(
                            "  {}{}{} {}{}{} {}",
                            ui::CYAN, id, ui::RESET,
                            ui::DIM, date, ui::RESET,
                            preview
                        );
                    }
                    println!();
                }
                continue;
            }
            "resume" => {
                let resume_id = if let Some(id) = parts.get(1) {
                    id.trim().to_string()
                } else {
                    // Show sessions and let user pick
                    let sessions = session::list_sessions();
                    if sessions.is_empty() {
                        ui::print_dim("  No saved sessions.");
                        continue;
                    }
                    println!();
                    for (i, (id, date, preview)) in sessions.iter().enumerate() {
                        println!(
                            "  {}{}.{} {}{}{} {} {}",
                            ui::CYAN, i + 1, ui::RESET,
                            ui::DIM, date, ui::RESET,
                            id, preview
                        );
                    }
                    println!();
                    let choice = ui::prompt_input("  Session #:");
                    let idx: usize = match choice.parse::<usize>() {
                        Ok(n) if n >= 1 && n <= sessions.len() => n - 1,
                        _ => {
                            ui::print_error("  Invalid selection.");
                            continue;
                        }
                    };
                    sessions[idx].0.clone()
                };
                match session::load_session(&resume_id) {
                    Ok(s) => {
                        session_id = s.id.clone();
                        workspace_str = s.workspace.clone();
                        context_files = s.context_files.clone();
                        autonomy = match s.autonomy.as_str() {
                            "suggest" => Autonomy::Suggest,
                            "full-auto" => Autonomy::FullAuto,
                            _ => Autonomy::AutoEdit,
                        };
                        conv = Conversation { messages: s.messages };
                        session_prompt_tokens = 0;
                        session_completion_tokens = 0;
                        ui::print_success(&format!("  Resumed session {resume_id}"));
                    }
                    Err(e) => {
                        ui::print_error(&format!("  Cannot resume: {e}"));
                    }
                }
                continue;
            }
            "cd" => {
                if let Some(dir) = parts.get(1) {
                    let dir = dir.trim();
                    let target = if dir.starts_with('/') || dir.starts_with('~') {
                        let expanded = dir.replace('~', &std::env::var("HOME").unwrap_or_default());
                        PathBuf::from(expanded)
                    } else {
                        PathBuf::from(&workspace_str).join(dir)
                    };
                    if target.is_dir() {
                        let canonical = target.canonicalize().unwrap_or(target);
                        workspace_str = canonical.to_string_lossy().to_string();
                        conv = Conversation::new(&workspace_str, &autonomy, &context_files);
                        context_files.clear();
                        ui::print_success(&format!("  Workspace: {workspace_str}"));
                    } else {
                        ui::print_error(&format!("  Not a directory: {}", target.display()));
                    }
                } else {
                    // cd with no args → go home
                    workspace_str = std::env::var("HOME").unwrap_or_else(|_| ".".into());
                    conv = Conversation::new(&workspace_str, &autonomy, &context_files);
                    context_files.clear();
                    ui::print_success(&format!("  Workspace: {workspace_str}"));
                }
                continue;
            }
            "add" => {
                if let Some(file) = parts.get(1) {
                    let file = file.trim().to_string();
                    let full = std::path::Path::new(&workspace_str).join(&file);
                    if full.exists() {
                        if !context_files.contains(&file) {
                            context_files.push(file.clone());
                        }
                        ui::print_success(&format!("  Added {file} to context"));
                    } else {
                        ui::print_error(&format!("  File not found: {file}"));
                    }
                } else {
                    ui::print_dim("  Usage: add <file>");
                }
                continue;
            }
            "drop" => {
                if let Some(file) = parts.get(1) {
                    let file = file.trim();
                    context_files.retain(|f| f != file);
                    ui::print_success(&format!("  Dropped {file} from context"));
                } else {
                    ui::print_dim("  Usage: drop <file>");
                }
                continue;
            }
            "context" | "ctx" => {
                let msg_count = conv.messages.len() - 1; // minus system prompt
                if context_files.is_empty() && msg_count == 0 {
                    ui::print_dim("  Empty conversation. No context files.");
                } else {
                    println!();
                    println!(
                        "  {}Conversation:{} {} messages",
                        ui::BOLD, ui::RESET, msg_count
                    );
                    if !context_files.is_empty() {
                        println!("  {}Files:{}", ui::BOLD, ui::RESET);
                        for f in &context_files {
                            println!("    {}{}{}", ui::CYAN, f, ui::RESET);
                        }
                    }
                    println!();
                }
                continue;
            }
            "mode" => {
                let modes = &["suggest", "auto-edit", "full-auto"];
                if let Some(choice) = ui::select_menu("Autonomy level:", modes) {
                    autonomy = match choice {
                        0 => Autonomy::Suggest,
                        1 => Autonomy::AutoEdit,
                        _ => Autonomy::FullAuto,
                    };
                    ui::print_success(&format!("  Mode: {autonomy}"));
                }
                continue;
            }
            "undo" => {
                match git::git_undo(&workspace_str) {
                    Ok(msg) => ui::print_success(&format!("  {msg}")),
                    Err(e) => ui::print_error(&format!("  {e}")),
                }
                continue;
            }
            "status" | "st" => {
                match git::git_status(&workspace_str) {
                    Ok(s) if s.is_empty() => ui::print_dim("  Clean working tree"),
                    Ok(s) => {
                        println!();
                        for line in s.lines() {
                            println!("    {line}");
                        }
                        println!();
                    }
                    Err(e) => ui::print_error(&format!("  {e}")),
                }
                continue;
            }
            "backend" => {
                println!();
                match &bk {
                    backend::ModelBackend::Api { url, model, .. } => {
                        println!("  Backend: {}api{}", ui::CYAN, ui::RESET);
                        println!("  Model:   {}{}{}", ui::CYAN, model, ui::RESET);
                        println!("  URL:     {}{}{}", ui::DIM, url, ui::RESET);
                    }
                    backend::ModelBackend::Stub => {
                        println!(
                            "  Backend: {}stub{} (testing)",
                            ui::YELLOW, ui::RESET
                        );
                    }
                }
                println!();
                continue;
            }
            "config" | "setup" => {
                if let Some((key, url, model)) = config::interactive_setup() {
                    let key_opt = if key.is_empty() { None } else { Some(key) };
                    bk = backend::ModelBackend::Api {
                        url: url.clone(),
                        key: key_opt,
                        model: model.clone(),
                        max_tokens: cli.max_tokens,
                    };
                    println!();
                    ui::print_success(&format!(
                        "  Switched to {}{}{} via {}",
                        ui::CYAN, model, ui::RESET, url
                    ));
                }
                println!();
                continue;
            }
            "cost" | "usage" | "tokens" => {
                ui::print_session_cost(session_prompt_tokens, session_completion_tokens);
                continue;
            }
            "clear" => {
                conv = Conversation::new(&workspace_str, &autonomy, &context_files);
                print!("\x1b[2J\x1b[H");
                io::stdout().flush().unwrap();
                ui::print_logo();
                println!();
                ui::print_banner(&workspace_str, bk.name(), &autonomy.to_string());
                continue;
            }
            _ => {}
        }

        // It's a message — send to the ongoing conversation
        match run_turn(
            &bk,
            &mut conv,
            input,
            &mut workspace_str,
            &autonomy,
            auto_commit,
        ) {
            Ok(usage) => {
                if usage.prompt_tokens > 0 || usage.completion_tokens > 0 {
                    ui::print_usage(usage.prompt_tokens, usage.completion_tokens);
                    session_prompt_tokens += usage.prompt_tokens;
                    session_completion_tokens += usage.completion_tokens;
                }
            }
            Err(e) => {
                ui::print_error(&format!("  Error: {e}"));
            }
        }

        // Auto-save session after each turn
        let _ = session::save_session(&session::Session {
            id: session_id.clone(),
            workspace: workspace_str.clone(),
            messages: conv.messages.clone(),
            context_files: context_files.clone(),
            autonomy: autonomy.to_string(),
            created_at: chrono_now(),
        });

        println!();
    }

    Ok(())
}
