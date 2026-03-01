//! Model backend abstraction — API and stub.

use crate::tools::{ApiToolCall, parse_api_tool_calls};
use crate::ui;
use anyhow::Result;
use std::io::{BufRead, BufReader};

/// Token usage from a single API call
#[derive(Debug, Clone, Default)]
pub struct TokenUsage {
    pub prompt_tokens: usize,
    pub completion_tokens: usize,
}

/// Result of a chat call — may contain text, tool calls, or both
pub struct ChatResponse {
    pub content: String,
    pub tool_calls: Vec<ApiToolCall>,
    /// The raw assistant message for re-sending in conversation
    pub raw_message: serde_json::Value,
    /// Whether content was already streamed to terminal (skip print_assistant)
    pub streamed: bool,
    /// Token usage (if available from API)
    pub usage: Option<TokenUsage>,
}

pub enum ModelBackend {
    /// OpenAI-compatible API (OpenRouter, OpenAI, Anthropic, Ollama, etc.)
    Api {
        url: String,
        key: Option<String>,
        model: String,
        max_tokens: usize,
    },
    /// Testing stub (no model)
    Stub,
}

impl ModelBackend {
    pub fn name(&self) -> &str {
        match self {
            ModelBackend::Api { model, .. } => model.as_str(),
            ModelBackend::Stub => "stub",
        }
    }

    pub fn chat_with_tools(
        &self,
        messages: &[serde_json::Value],
        tools: Option<&serde_json::Value>,
    ) -> Result<ChatResponse> {
        match self {
            ModelBackend::Api { url, key, model, max_tokens } => {
                api_chat_with_tools(url, key.as_deref(), model, messages, *max_tokens, tools)
            }
            ModelBackend::Stub => stub_response(messages),
        }
    }

    /// Streaming chat — prints tokens live for API, falls back to non-streaming for others.
    pub fn chat_stream(
        &self,
        messages: &[serde_json::Value],
        tools: Option<&serde_json::Value>,
    ) -> Result<ChatResponse> {
        match self {
            ModelBackend::Api { url, key, model, max_tokens } => {
                api_chat_stream(url, key.as_deref(), model, messages, *max_tokens, tools)
            }
            // Local and stub don't support streaming — fall back
            _ => self.chat_with_tools(messages, tools),
        }
    }
}

// ---------------------------------------------------------------------------
// Stub backend
// ---------------------------------------------------------------------------

fn stub_response(messages: &[serde_json::Value]) -> Result<ChatResponse> {
    let last_content = messages
        .last()
        .and_then(|m| m.get("content"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let has_tool_results = messages
        .iter()
        .any(|m| m.get("role").and_then(|v| v.as_str()) == Some("tool"));

    if has_tool_results {
        Ok(ChatResponse {
            content: String::new(),
            tool_calls: vec![ApiToolCall {
                id: "stub_1".into(),
                name: "submit".into(),
                arguments: r#"{"summary":"Explored the workspace."}"#.into(),
            }],
            raw_message: serde_json::json!({
                "role": "assistant",
                "content": null,
                "tool_calls": [{
                    "id": "stub_1",
                    "type": "function",
                    "function": {
                        "name": "submit",
                        "arguments": "{\"summary\":\"Explored the workspace.\"}"
                    }
                }]
            }),
            streamed: false,
            usage: None,
        })
    } else if last_content.len() < 20 {
        Ok(ChatResponse {
            content: "Hello! I'm ClifCode. Give me a coding task and I'll get to work.".into(),
            tool_calls: vec![],
            raw_message: serde_json::json!({
                "role": "assistant",
                "content": "Hello! I'm ClifCode. Give me a coding task and I'll get to work."
            }),
            streamed: false,
            usage: None,
        })
    } else {
        Ok(ChatResponse {
            content: "Let me explore the project.".into(),
            tool_calls: vec![ApiToolCall {
                id: "stub_0".into(),
                name: "run_command".into(),
                arguments: r#"{"command":"ls -la"}"#.into(),
            }],
            raw_message: serde_json::json!({
                "role": "assistant",
                "content": "Let me explore the project.",
                "tool_calls": [{
                    "id": "stub_0",
                    "type": "function",
                    "function": {
                        "name": "run_command",
                        "arguments": "{\"command\":\"ls -la\"}"
                    }
                }]
            }),
            streamed: false,
            usage: None,
        })
    }
}

// ---------------------------------------------------------------------------
// API backend (OpenAI-compatible)
// ---------------------------------------------------------------------------

fn api_chat_with_tools(
    base_url: &str,
    api_key: Option<&str>,
    model: &str,
    messages: &[serde_json::Value],
    max_tokens: usize,
    tools: Option<&serde_json::Value>,
) -> Result<ChatResponse> {
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));

    let mut body = serde_json::json!({
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.7,
    });

    if let Some(tools) = tools {
        body["tools"] = tools.clone();
    }

    let mut req = ureq::post(&url).set("Content-Type", "application/json");

    if let Some(key) = api_key {
        req = req.set("Authorization", &format!("Bearer {key}"));
    }

    let resp = req
        .send_string(&body.to_string())
        .map_err(|e| anyhow::anyhow!("API request failed: {e}"))?;

    let resp_body: serde_json::Value = resp.into_json()?;

    let content = resp_body
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let tool_calls = parse_api_tool_calls(&resp_body);

    let raw_message = resp_body
        .pointer("/choices/0/message")
        .cloned()
        .unwrap_or_else(|| serde_json::json!({"role": "assistant", "content": content}));

    let usage = extract_usage(&resp_body);

    Ok(ChatResponse { content, tool_calls, raw_message, streamed: false, usage })
}

// ---------------------------------------------------------------------------
// Streaming API (SSE)
// ---------------------------------------------------------------------------

fn api_chat_stream(
    base_url: &str,
    api_key: Option<&str>,
    model: &str,
    messages: &[serde_json::Value],
    max_tokens: usize,
    tools: Option<&serde_json::Value>,
) -> Result<ChatResponse> {
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));

    let mut body = serde_json::json!({
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.7,
        "stream": true,
        "stream_options": { "include_usage": true },
    });

    if let Some(tools) = tools {
        body["tools"] = tools.clone();
    }

    let mut req = ureq::post(&url).set("Content-Type", "application/json");
    if let Some(key) = api_key {
        req = req.set("Authorization", &format!("Bearer {key}"));
    }

    let resp = req
        .send_string(&body.to_string())
        .map_err(|e| anyhow::anyhow!("API stream request failed: {e}"))?;

    let reader = BufReader::new(resp.into_reader());

    let mut full_content = String::new();
    let mut started_printing = false;
    let mut usage: Option<TokenUsage> = None;

    // Streaming markdown state
    let mut line_buffer = String::new();
    let mut in_code_block = false;

    // Tool call accumulators: index -> (id, name, arguments_buffer)
    let mut tool_acc: Vec<(String, String, String)> = Vec::new();

    for line_result in reader.lines() {
        let line = match line_result {
            Ok(l) => l,
            Err(_) => break,
        };

        // SSE format: empty lines are separators, "data: " prefix carries payload
        if line.is_empty() || !line.starts_with("data: ") {
            continue;
        }

        let data = &line[6..]; // strip "data: "

        // End of stream
        if data == "[DONE]" {
            break;
        }

        let chunk: serde_json::Value = match serde_json::from_str(data) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let delta = match chunk.pointer("/choices/0/delta") {
            Some(d) => d,
            None => {
                // Final chunk may have usage but no delta
                if let Some(u) = chunk.get("usage") {
                    usage = extract_usage_from_obj(u);
                }
                continue;
            }
        };

        // Stream text content with line-buffered markdown rendering
        if let Some(token) = delta.get("content").and_then(|v| v.as_str()) {
            if !token.is_empty() {
                if !started_printing {
                    print!("\n  {}{}\u{2726} ClifCode{}  ", ui::BOLD, ui::BRIGHT_MAGENTA, ui::RESET);
                    started_printing = true;
                }
                full_content.push_str(token);
                line_buffer.push_str(token);

                // Process completed lines
                while let Some(nl_pos) = line_buffer.find('\n') {
                    let completed_line: String = line_buffer[..nl_pos].to_string();
                    line_buffer = line_buffer[nl_pos + 1..].to_string();

                    // Track code block state
                    if completed_line.trim_start().starts_with("```") {
                        in_code_block = !in_code_block;
                    }

                    let rendered = ui::render_streaming_line(&completed_line, in_code_block && !completed_line.trim_start().starts_with("```"));
                    println!("{rendered}");
                }
            }
        }

        // Extract usage from final chunk (OpenAI/OpenRouter include it)
        if let Some(u) = chunk.get("usage") {
            usage = extract_usage_from_obj(u);
        }

        // Accumulate tool call deltas
        if let Some(tc_array) = delta.get("tool_calls").and_then(|v| v.as_array()) {
            for tc in tc_array {
                let idx = tc.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as usize;

                // Grow accumulator if needed
                while tool_acc.len() <= idx {
                    tool_acc.push((String::new(), String::new(), String::new()));
                }

                // Capture tool call id (only sent in first delta for each tool call)
                if let Some(id) = tc.get("id").and_then(|v| v.as_str()) {
                    if !id.is_empty() {
                        tool_acc[idx].0 = id.to_string();
                    }
                }

                // Capture function name (only sent in first delta)
                if let Some(name) = tc.pointer("/function/name").and_then(|v| v.as_str()) {
                    if !name.is_empty() {
                        tool_acc[idx].1 = name.to_string();
                    }
                }

                // Accumulate function arguments (streamed across multiple deltas)
                if let Some(args) = tc.pointer("/function/arguments").and_then(|v| v.as_str()) {
                    tool_acc[idx].2.push_str(args);
                }
            }
        }
    }

    // Flush remaining line buffer
    if !line_buffer.is_empty() {
        if !started_printing {
            print!("\n  {}{}\u{2726} ClifCode{}  ", ui::BOLD, ui::BRIGHT_MAGENTA, ui::RESET);
            started_printing = true;
        }
        if line_buffer.trim_start().starts_with("```") {
            in_code_block = !in_code_block;
        }
        let rendered = ui::render_streaming_line(&line_buffer, in_code_block && !line_buffer.trim_start().starts_with("```"));
        println!("{rendered}");
    }

    // Finish the streamed output
    if started_printing {
        println!();
    }

    // Build tool calls from accumulated deltas
    let tool_calls: Vec<ApiToolCall> = tool_acc
        .into_iter()
        .filter(|(_, name, _)| !name.is_empty())
        .map(|(id, name, arguments)| ApiToolCall { id, name, arguments })
        .collect();

    // Build raw_message for conversation history
    let raw_message = if tool_calls.is_empty() {
        serde_json::json!({"role": "assistant", "content": full_content})
    } else {
        let tc_json: Vec<serde_json::Value> = tool_calls
            .iter()
            .map(|tc| {
                serde_json::json!({
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.name,
                        "arguments": tc.arguments
                    }
                })
            })
            .collect();

        if full_content.is_empty() {
            serde_json::json!({
                "role": "assistant",
                "content": null,
                "tool_calls": tc_json
            })
        } else {
            serde_json::json!({
                "role": "assistant",
                "content": full_content,
                "tool_calls": tc_json
            })
        }
    };

    Ok(ChatResponse {
        content: full_content,
        tool_calls,
        raw_message,
        streamed: started_printing,
        usage,
    })
}

// ---------------------------------------------------------------------------
// Token usage extraction
// ---------------------------------------------------------------------------

fn extract_usage(resp: &serde_json::Value) -> Option<TokenUsage> {
    resp.get("usage").and_then(extract_usage_from_obj)
}

fn extract_usage_from_obj(u: &serde_json::Value) -> Option<TokenUsage> {
    let prompt = u.get("prompt_tokens").and_then(|v| v.as_u64())? as usize;
    let completion = u.get("completion_tokens").and_then(|v| v.as_u64())? as usize;
    Some(TokenUsage { prompt_tokens: prompt, completion_tokens: completion })
}

/// Quick check if Ollama is running locally
pub fn detect_ollama() -> bool {
    ureq::get("http://localhost:11434/api/tags").call().is_ok()
}
