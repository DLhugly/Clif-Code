use serde_json::json;
use std::collections::HashMap;
use std::path::Path;

use super::driver::{PrContext, ReviewDriver};
use super::rules::{path_instructions_for, path_is_excluded, Profile, ReviewConfig};
use super::schema::{
    BlastRadius, Category, Finding, ReviewMetrics, ReviewResult, Severity,
};

/// Events the engine reports to the caller during a run.
#[derive(Debug, Clone)]
pub enum ReviewEvent {
    Started,
    Progress(String),
    Finding(Finding),
    Done(ReviewResult),
    Error(String),
}

pub struct ReviewSettings {
    pub model: String,
    pub api_key: Option<String>,
    pub provider: String,
}

const MAX_DIFF_CHARS: usize = 150_000;
const MAX_FILE_CHARS: usize = 25_000;

/// Entry point: runs a review against a PR and emits events via the callback.
pub async fn run_review<F>(
    driver: &dyn ReviewDriver,
    config: &ReviewConfig,
    pr: &PrContext,
    settings: &ReviewSettings,
    emit: F,
) where
    F: Fn(ReviewEvent) + Send + Sync,
{
    emit(ReviewEvent::Started);
    emit(ReviewEvent::Progress("Fetching diff".to_string()));

    let diff = match driver.fetch_diff(pr.number) {
        Ok(d) => d,
        Err(e) => {
            emit(ReviewEvent::Error(e));
            return;
        }
    };

    if diff.trim().is_empty() {
        let empty = empty_review(pr);
        emit(ReviewEvent::Done(empty));
        return;
    }

    emit(ReviewEvent::Progress("Preparing rules".to_string()));
    let compressed = compress_diff(&diff, config);
    let prompt = build_prompt(pr, config, &compressed);

    emit(ReviewEvent::Progress("Calling model".to_string()));
    let raw = match call_llm(settings, &prompt).await {
        Ok(s) => s,
        Err(e) => {
            emit(ReviewEvent::Error(format!("LLM call failed: {}", e)));
            return;
        }
    };

    let parsed = match parse_review_json(&raw) {
        Ok(v) => v,
        Err(e) => {
            emit(ReviewEvent::Error(format!(
                "Model returned invalid review JSON: {}",
                e
            )));
            return;
        }
    };

    emit(ReviewEvent::Progress("Verifying findings".to_string()));
    let verified = verify_findings(parsed.findings, &diff, config);

    // Stream findings as they are confirmed for responsive UI.
    for f in &verified {
        emit(ReviewEvent::Finding(f.clone()));
    }

    let metrics = compute_metrics(&verified);
    let result = ReviewResult {
        pr_number: pr.number,
        head_sha: Some(pr.head_sha.clone()),
        generated_at: chrono_like_now(),
        summary: parsed.summary,
        risk_score: parsed.risk_score,
        blast_radius: parsed.blast_radius,
        findings: verified,
        checklist: parsed.checklist,
        metrics,
        tool_outputs: parsed.tool_outputs,
    };

    emit(ReviewEvent::Done(result));
}

fn empty_review(pr: &PrContext) -> ReviewResult {
    ReviewResult {
        pr_number: pr.number,
        head_sha: Some(pr.head_sha.clone()),
        generated_at: chrono_like_now(),
        summary: Some("Empty diff — nothing to review.".into()),
        risk_score: Some(0),
        blast_radius: None,
        findings: Vec::new(),
        checklist: Vec::new(),
        metrics: ReviewMetrics::default(),
        tool_outputs: Vec::new(),
    }
}

fn compress_diff(diff: &str, config: &ReviewConfig) -> String {
    // 1. Filter out excluded files.
    // 2. Per-file cap at MAX_FILE_CHARS.
    // 3. Overall cap at MAX_DIFF_CHARS.
    let mut out = String::new();
    let mut current_file: Option<String> = None;
    let mut current_kept = 0usize;
    let mut skip_current = false;

    for line in diff.lines() {
        if line.starts_with("diff --git ") {
            current_file = line
                .split_whitespace()
                .last()
                .map(|s| s.trim_start_matches("b/").to_string());
            skip_current = current_file
                .as_deref()
                .map(|p| path_is_excluded(config, p))
                .unwrap_or(false);
            current_kept = 0;
        }
        if skip_current {
            continue;
        }
        if out.len() + line.len() + 1 > MAX_DIFF_CHARS {
            out.push_str("\n[truncated — diff too large; see gh pr diff for full content]\n");
            break;
        }
        if current_kept > MAX_FILE_CHARS {
            if !out.ends_with("[file truncated]\n") {
                out.push_str("[file truncated]\n");
            }
            continue;
        }
        out.push_str(line);
        out.push('\n');
        current_kept += line.len();
    }
    out
}

fn build_prompt(pr: &PrContext, config: &ReviewConfig, diff: &str) -> String {
    let mut instructions = String::new();
    if !config.synthesized_instructions.is_empty() {
        instructions.push_str("## Team review rules (authoritative)\n\n");
        instructions.push_str(&config.synthesized_instructions);
        instructions.push_str("\n\n");
    }
    if !config.reviews.path_instructions.is_empty() {
        instructions.push_str("## Path-scoped rules\n\n");
        for p in &config.reviews.path_instructions {
            instructions.push_str(&format!("- `{}`: {}\n", p.path, p.instructions));
        }
        instructions.push('\n');
    }
    let tone = config
        .tone_instructions
        .clone()
        .unwrap_or_else(|| "Be direct, concise, and factual. Explain why, not just what.".into());
    let profile = match config.profile {
        Profile::Chill => "chill (suppress nits, focus on substantive issues)",
        Profile::Assertive => "assertive (flag borderline issues)",
        Profile::Strict => "strict (hold the line on required rules)",
    };

    format!(
        "You are Clif Review, an expert code reviewer. Review the following pull request diff and emit a JSON object matching the schema.\n\n\
## Pull request\nNumber: {}\nTitle: {}\nAuthor: {}\nBranches: {} -> {}\n\n\
## Profile\n{}\n\n\
## Tone\n{}\n\n\
{}\n\n\
## Diff\n```diff\n{}\n```\n\n\
## Output schema (JSON)\n\
Return a single JSON object. No prose. No code fences.\n\n\
Schema:\n\
{{\n\
  \"summary\": string,\n\
  \"risk_score\": integer 0-100,\n\
  \"blast_radius\": {{ \"files\": string[], \"subsystems\": string[] }},\n\
  \"findings\": [\n\
    {{\n\
      \"id\": string,\n\
      \"path\": string,\n\
      \"line_start\": integer,\n\
      \"line_end\": integer,\n\
      \"severity\": \"critical\"|\"high\"|\"medium\"|\"low\"|\"nit\",\n\
      \"category\": \"bug\"|\"security\"|\"perf\"|\"style\"|\"tests\"|\"docs\"|\"refactor\"|\"api\"|\"architecture\"|\"types\"|\"imports\",\n\
      \"rule_id\": string|null,\n\
      \"message\": string,\n\
      \"rationale\": string,\n\
      \"suggested_patch\": string|null,\n\
      \"confidence\": number 0..1\n\
    }}\n\
  ],\n\
  \"checklist\": [ {{ \"id\": string, \"description\": string, \"required\": boolean, \"passed\": boolean|null }} ],\n\
  \"tool_outputs\": []\n\
}}\n\n\
Rules for findings:\n\
- Every finding MUST include path, line_start, line_end that match a file and line present in the diff. Do not invent locations.\n\
- Prefer fewer, high-signal findings. Cap at {} findings total.\n\
- Confidence must reflect uncertainty honestly.\n\
- Use severity `nit` sparingly; in chill profile prefer omitting nits entirely.\n\
- Suggested patches should be valid unified diffs or omitted.\n",
        pr.number,
        pr.title,
        pr.author,
        pr.base_ref_name,
        pr.head_ref_name,
        profile,
        tone,
        instructions,
        diff,
        config.max_findings()
    )
}

#[derive(Default)]
struct ParsedReview {
    summary: Option<String>,
    risk_score: Option<u32>,
    blast_radius: Option<BlastRadius>,
    findings: Vec<Finding>,
    checklist: Vec<super::schema::ReviewChecklistItem>,
    tool_outputs: Vec<super::schema::ToolOutput>,
}

fn parse_review_json(raw: &str) -> Result<ParsedReview, String> {
    // Strip common wrapping (code fences) if present.
    let trimmed = raw.trim();
    let stripped = if trimmed.starts_with("```") {
        let without_first = trimmed.trim_start_matches("```json").trim_start_matches("```");
        let end = without_first.rfind("```").unwrap_or(without_first.len());
        &without_first[..end]
    } else {
        trimmed
    };

    let value: serde_json::Value = serde_json::from_str(stripped.trim())
        .map_err(|e| format!("{} (preview: {})", e, &stripped.chars().take(120).collect::<String>()))?;

    let summary = value.get("summary").and_then(|v| v.as_str()).map(|s| s.to_string());
    let risk_score = value.get("risk_score").and_then(|v| v.as_u64()).map(|v| v.min(100) as u32);
    let blast_radius: Option<BlastRadius> = value
        .get("blast_radius")
        .and_then(|v| serde_json::from_value(v.clone()).ok());

    let mut findings: Vec<Finding> = Vec::new();
    if let Some(arr) = value.get("findings").and_then(|v| v.as_array()) {
        for item in arr {
            match serde_json::from_value::<Finding>(item.clone()) {
                Ok(f) => findings.push(f),
                Err(_) => continue,
            }
        }
    }

    let checklist = value
        .get("checklist")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| serde_json::from_value(v.clone()).ok())
                .collect()
        })
        .unwrap_or_default();

    let tool_outputs = value
        .get("tool_outputs")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| serde_json::from_value(v.clone()).ok())
                .collect()
        })
        .unwrap_or_default();

    Ok(ParsedReview {
        summary,
        risk_score,
        blast_radius,
        findings,
        checklist,
        tool_outputs,
    })
}

fn verify_findings(
    raw: Vec<Finding>,
    diff: &str,
    config: &ReviewConfig,
) -> Vec<Finding> {
    let touched_files = collect_files_from_diff(diff);
    let mut seen = HashMap::<String, bool>::new();
    let max = config.max_findings() as usize;
    let floor = config.confidence_floor();

    let mut verified: Vec<Finding> = Vec::new();
    for mut f in raw {
        if f.dismissed {
            continue;
        }
        if !touched_files.contains(&f.path) {
            continue;
        }
        if path_is_excluded(config, &f.path) {
            continue;
        }
        if let Some(c) = f.confidence {
            if c < floor {
                continue;
            }
        }
        if f.line_start == 0 || f.line_end < f.line_start {
            continue;
        }
        let dedupe_key = format!("{}:{}:{:?}:{}", f.path, f.line_start, f.severity, f.message);
        if seen.insert(dedupe_key, true).is_some() {
            continue;
        }
        // Attach path-scoped rule reminder to rationale if rule missing
        if f.rule_id.is_none() {
            let scoped = path_instructions_for(config, &f.path);
            if !scoped.is_empty() {
                let note = scoped.join(" | ");
                let base = f.rationale.clone().unwrap_or_default();
                f.rationale = Some(if base.is_empty() {
                    format!("Path rule context: {}", note)
                } else {
                    format!("{}\n\nPath rule context: {}", base, note)
                });
            }
        }
        verified.push(f);
        if verified.len() >= max {
            break;
        }
    }
    verified
}

fn collect_files_from_diff(diff: &str) -> std::collections::HashSet<String> {
    let mut set = std::collections::HashSet::new();
    for line in diff.lines() {
        if let Some(rest) = line.strip_prefix("+++ b/") {
            set.insert(rest.trim().to_string());
        }
    }
    set
}

fn compute_metrics(findings: &[Finding]) -> ReviewMetrics {
    let mut by_severity: HashMap<String, u32> = HashMap::new();
    let mut by_category: HashMap<String, u32> = HashMap::new();
    for f in findings {
        let sev = format!("{:?}", f.severity).to_lowercase();
        *by_severity.entry(sev).or_insert(0) += 1;
        let cat = format!("{:?}", f.category).to_lowercase();
        *by_category.entry(cat).or_insert(0) += 1;
    }
    ReviewMetrics {
        total: findings.len() as u32,
        by_severity,
        by_category,
    }
}

fn chrono_like_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{}", secs)
}

async fn call_llm(settings: &ReviewSettings, prompt: &str) -> Result<String, String> {
    let url = match settings.provider.as_str() {
        "ollama" => "http://localhost:11434/v1/chat/completions".to_string(),
        _ => "https://openrouter.ai/api/v1/chat/completions".to_string(),
    };
    let client = reqwest::Client::new();
    let body = json!({
        "model": settings.model,
        "messages": [
            {"role": "system", "content": "You are a careful, grounded code reviewer. Always return a single JSON object matching the required schema. Never use markdown code fences."},
            {"role": "user", "content": prompt}
        ],
        "stream": false,
        "response_format": { "type": "json_object" }
    });

    let mut req = client.post(&url).header("Content-Type", "application/json");
    if let Some(key) = &settings.api_key {
        req = req.header("Authorization", format!("Bearer {}", key));
    }
    if settings.provider == "openrouter" {
        req = req
            .header("HTTP-Referer", "https://clif.dev")
            .header("X-Title", "ClifPad Review");
    }

    let resp = req
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("request error: {}", e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let txt = resp.text().await.unwrap_or_default();
        return Err(format!("{}: {}", status, txt));
    }
    let json_resp: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("decode error: {}", e))?;
    let content = json_resp
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing choices[0].message.content".to_string())?;
    Ok(content.to_string())
}

pub fn cache_path(workspace_dir: &str, pr_number: i64) -> std::path::PathBuf {
    Path::new(workspace_dir)
        .join(".clif")
        .join("reviews")
        .join(format!("pr-{}.json", pr_number))
}

pub fn save_result(workspace_dir: &str, result: &ReviewResult) -> Result<(), String> {
    let path = cache_path(workspace_dir, result.pr_number);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir cache: {}", e))?;
    }
    let data = serde_json::to_string_pretty(result)
        .map_err(|e| format!("serialize review: {}", e))?;
    std::fs::write(&path, data).map_err(|e| format!("write cache: {}", e))?;
    Ok(())
}

pub fn load_result(workspace_dir: &str, pr_number: i64) -> Option<ReviewResult> {
    let path = cache_path(workspace_dir, pr_number);
    let data = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&data).ok()
}

pub fn list_cached(workspace_dir: &str) -> Vec<ReviewResult> {
    let dir = Path::new(workspace_dir).join(".clif").join("reviews");
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        if let Ok(data) = std::fs::read_to_string(entry.path()) {
            if let Ok(r) = serde_json::from_str::<ReviewResult>(&data) {
                out.push(r);
            }
        }
    }
    out
}

// Exposed for category allowlist filtering in polish module
pub fn is_allowlisted(category: Category, allowlist: &[Category]) -> bool {
    allowlist.contains(&category) || category.is_default_allowlist()
}

// Reference severity type so it's exposed for tests later
#[allow(dead_code)]
pub fn severity_rank(s: Severity) -> u8 {
    match s {
        Severity::Critical => 0,
        Severity::High => 1,
        Severity::Medium => 2,
        Severity::Low => 3,
        Severity::Nit => 4,
    }
}
