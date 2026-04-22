use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Critical,
    High,
    Medium,
    Low,
    Nit,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Category {
    Bug,
    Security,
    Perf,
    Style,
    Tests,
    Docs,
    Refactor,
    Api,
    Architecture,
    Types,
    Imports,
}

impl Category {
    pub fn is_default_allowlist(self) -> bool {
        matches!(
            self,
            Category::Style | Category::Docs | Category::Tests | Category::Imports | Category::Types
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Finding {
    pub id: String,
    pub path: String,
    pub line_start: u32,
    pub line_end: u32,
    pub severity: Severity,
    pub category: Category,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_id: Option<String>,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rationale: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggested_patch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f32>,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub dismissed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BlastRadius {
    pub files: Vec<String>,
    pub subsystems: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewChecklistItem {
    pub id: String,
    pub description: String,
    pub required: bool,
    pub passed: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ReviewMetrics {
    pub total: u32,
    pub by_severity: std::collections::HashMap<String, u32>,
    pub by_category: std::collections::HashMap<String, u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolOutput {
    pub name: String,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewResult {
    pub pr_number: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub head_sha: Option<String>,
    pub generated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub risk_score: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blast_radius: Option<BlastRadius>,
    pub findings: Vec<Finding>,
    #[serde(default)]
    pub checklist: Vec<ReviewChecklistItem>,
    #[serde(default)]
    pub metrics: ReviewMetrics,
    #[serde(default)]
    pub tool_outputs: Vec<ToolOutput>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PolishMode {
    Minimal,
    Standard,
    Aggressive,
    Security,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolishChunk {
    pub id: String,
    pub path: String,
    pub category: Category,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_id: Option<String>,
    pub patch: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rationale: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_finding_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolishCommitSpec {
    pub id: String,
    pub category: Category,
    pub message: String,
    pub chunk_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolishValidator {
    pub name: String,
    pub command: String,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolishPlan {
    pub plan_id: String,
    pub pr_number: i64,
    pub mode: PolishMode,
    pub chunks: Vec<PolishChunk>,
    pub commit_plan: Vec<PolishCommitSpec>,
    pub validators: Vec<PolishValidator>,
    pub manifest_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolishValidatorResult {
    pub name: String,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolishCommitRecord {
    pub oid: String,
    pub author: String,
    pub committer: String,
    pub category: Category,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_id: Option<String>,
    pub validator_results: Vec<PolishValidatorResult>,
    pub rollback: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolishManifest {
    pub pr_number: i64,
    pub plan_id: String,
    pub mode: PolishMode,
    pub branch: String,
    pub commits: Vec<PolishCommitRecord>,
    pub generated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolishApplyReport {
    pub plan_id: String,
    pub branch: String,
    pub commits_applied: u32,
    pub manifest_path: String,
}
