use serde::{Deserialize, Serialize};
use std::path::Path;

use super::schema::Category;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Profile {
    #[default]
    Chill,
    Assertive,
    Strict,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PathInstruction {
    pub path: String,
    pub instructions: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PolishConfig {
    #[serde(default)]
    pub allowlist: Vec<Category>,
    #[serde(default)]
    pub deny_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ReviewsBlock {
    #[serde(default)]
    pub instructions: String,
    #[serde(default)]
    pub path_instructions: Vec<PathInstruction>,
    #[serde(default)]
    pub path_filters: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ReviewConfig {
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub tone_instructions: Option<String>,
    #[serde(default)]
    pub profile: Profile,
    #[serde(default)]
    pub reviews: ReviewsBlock,
    #[serde(default)]
    pub request_changes_workflow: Option<bool>,
    #[serde(default)]
    pub confidence_threshold: Option<f32>,
    #[serde(default)]
    pub max_findings_per_pr: Option<u32>,
    #[serde(default)]
    pub polish: PolishConfig,

    // Synthesized fields (not part of yaml) — populated from markdown files
    #[serde(skip)]
    pub synthesized_instructions: String,
    #[serde(skip)]
    pub rule_sources: Vec<String>,
}

impl ReviewConfig {
    pub fn max_findings(&self) -> u32 {
        self.max_findings_per_pr.unwrap_or(30)
    }

    pub fn confidence_floor(&self) -> f32 {
        match self.profile {
            Profile::Chill => self.confidence_threshold.unwrap_or(0.55),
            Profile::Assertive => self.confidence_threshold.unwrap_or(0.35),
            Profile::Strict => self.confidence_threshold.unwrap_or(0.7),
        }
    }

    pub fn effective_allowlist(&self) -> Vec<Category> {
        if self.polish.allowlist.is_empty() {
            vec![
                Category::Style,
                Category::Docs,
                Category::Tests,
                Category::Imports,
                Category::Types,
            ]
        } else {
            self.polish.allowlist.clone()
        }
    }
}

pub fn load_review_config(workspace_dir: &str) -> ReviewConfig {
    let root = Path::new(workspace_dir);
    let mut config: ReviewConfig = load_yaml(&root.join(".clifreview.yaml"))
        .or_else(|| load_yaml(&root.join(".clifreview.yml")))
        .unwrap_or_default();

    // Ingest markdown instruction files in inheritance order (higher priority loaded first)
    let sources = [
        (".clifreview.yaml (inline)", !config.reviews.instructions.is_empty() || !config.reviews.path_instructions.is_empty()),
        ("AGENTS.md", root.join("AGENTS.md").exists()),
        ("CLAUDE.md", root.join("CLAUDE.md").exists()),
        (".cursorrules", root.join(".cursorrules").exists()),
        (".github/copilot-instructions.md", root.join(".github").join("copilot-instructions.md").exists()),
        (".clif/CLIF.md", root.join(".clif").join("CLIF.md").exists()),
        (".clifrules", root.join(".clifrules").exists()),
    ];

    let mut synthesized = String::new();
    let mut rule_sources: Vec<String> = Vec::new();

    if !config.reviews.instructions.is_empty() {
        synthesized.push_str(&config.reviews.instructions);
        synthesized.push_str("\n\n");
        rule_sources.push(".clifreview.yaml".to_string());
    }

    for (name, exists) in &sources {
        if !exists {
            continue;
        }
        let abs_path = match *name {
            "AGENTS.md" => root.join("AGENTS.md"),
            "CLAUDE.md" => root.join("CLAUDE.md"),
            ".cursorrules" => root.join(".cursorrules"),
            ".github/copilot-instructions.md" => root.join(".github").join("copilot-instructions.md"),
            ".clif/CLIF.md" => root.join(".clif").join("CLIF.md"),
            ".clifrules" => root.join(".clifrules"),
            _ => continue,
        };
        if let Ok(contents) = std::fs::read_to_string(&abs_path) {
            synthesized.push_str(&format!("## From {}\n\n", name));
            synthesized.push_str(&contents);
            synthesized.push_str("\n\n");
            rule_sources.push(name.to_string());
        }
    }

    config.synthesized_instructions = synthesized;
    config.rule_sources = rule_sources;
    config
}

fn load_yaml(path: &Path) -> Option<ReviewConfig> {
    let contents = std::fs::read_to_string(path).ok()?;
    serde_yaml::from_str::<ReviewConfig>(&contents).ok()
}

pub fn matches_glob(pattern: &str, path: &str) -> bool {
    // Minimal glob matching sufficient for `**/*.ext`, `src/**`, `!dist/**`
    let pat = pattern.trim_start_matches('!');
    glob_match(pat, path)
}

fn glob_match(pattern: &str, path: &str) -> bool {
    let pat_bytes = pattern.as_bytes();
    let path_bytes = path.as_bytes();
    glob_recurse(pat_bytes, 0, path_bytes, 0)
}

fn glob_recurse(pat: &[u8], mut pi: usize, path: &[u8], mut xi: usize) -> bool {
    while pi < pat.len() {
        if pat[pi] == b'*' && pi + 1 < pat.len() && pat[pi + 1] == b'*' {
            // ** matches any number of path segments
            let rest = &pat[(pi + 2)..];
            if rest.is_empty() {
                return true;
            }
            let rest = if rest[0] == b'/' { &rest[1..] } else { rest };
            for j in xi..=path.len() {
                if glob_recurse(rest, 0, path, j) {
                    return true;
                }
            }
            return false;
        } else if pat[pi] == b'*' {
            // * matches within a single segment
            let next = pat.get(pi + 1).copied();
            let mut j = xi;
            while j < path.len() && path[j] != b'/' && Some(path[j]) != next {
                j += 1;
            }
            for k in xi..=j {
                if glob_recurse(&pat[(pi + 1)..], 0, path, k) {
                    return true;
                }
            }
            return false;
        } else if pat[pi] == b'?' {
            if xi >= path.len() || path[xi] == b'/' {
                return false;
            }
            pi += 1;
            xi += 1;
        } else {
            if xi >= path.len() || pat[pi] != path[xi] {
                return false;
            }
            pi += 1;
            xi += 1;
        }
    }
    xi == path.len()
}

pub fn path_is_excluded(config: &ReviewConfig, path: &str) -> bool {
    for f in &config.reviews.path_filters {
        let excluded = f.starts_with('!');
        let pat = if excluded { &f[1..] } else { f.as_str() };
        if matches_glob(pat, path) {
            return excluded;
        }
    }
    // Built-in excludes
    let builtins = [
        "**/node_modules/**",
        "**/dist/**",
        "**/build/**",
        "**/target/**",
        "**/.git/**",
        "**/*.min.js",
        "**/*.min.css",
        "**/*.lock",
        "**/package-lock.json",
        "**/Cargo.lock",
    ];
    for b in &builtins {
        if matches_glob(b, path) {
            return true;
        }
    }
    false
}

pub fn path_instructions_for(config: &ReviewConfig, path: &str) -> Vec<String> {
    let mut out = Vec::new();
    for p in &config.reviews.path_instructions {
        if matches_glob(&p.path, path) {
            out.push(p.instructions.clone());
        }
    }
    out
}
