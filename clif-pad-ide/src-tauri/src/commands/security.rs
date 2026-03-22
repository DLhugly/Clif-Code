//! Security scanner — scans files for secrets, dangerous patterns, and
//! common vulnerabilities. Used both for pre-commit checks and full repo scans.

use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityIssue {
    pub file: String,
    pub line: usize,
    pub severity: String, // "critical" | "warning" | "info"
    pub category: String,
    pub description: String,
    pub snippet: String,
}

/// Patterns that indicate hardcoded secrets or dangerous code.
/// Each entry: (regex_text, category, severity, description)
const PATTERNS: &[(&str, &str, &str, &str)] = &[
    // Critical: real secrets
    (r"sk-[a-zA-Z0-9]{20,}", "Secret", "critical", "OpenAI API key"),
    (r"sk-or-v1-[a-zA-Z0-9]{40,}", "Secret", "critical", "OpenRouter API key"),
    (r"AKIA[A-Z0-9]{16}", "Secret", "critical", "AWS Access Key ID"),
    (r"ghp_[a-zA-Z0-9]{36}", "Secret", "critical", "GitHub Personal Access Token"),
    (r"ghs_[a-zA-Z0-9]{36}", "Secret", "critical", "GitHub Actions Secret"),
    (r"glpat-[a-zA-Z0-9\-_]{20,}", "Secret", "critical", "GitLab Personal Access Token"),
    (r"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----", "Secret", "critical", "Private key in file"),
    (r"-----BEGIN PGP PRIVATE KEY BLOCK-----", "Secret", "critical", "PGP private key"),
    (r#"(?i)(password|passwd|pwd)\s*[:=]\s*["'][^"']{4,}"#, "Secret", "critical", "Hardcoded password"),
    (r#"(?i)(api[_-]?key|apikey)\s*[:=]\s*["'][^"']{8,}"#, "Secret", "warning", "Hardcoded API key"),
    (r#"(?i)(secret|token)\s*[:=]\s*["'][^"']{8,}"#, "Secret", "warning", "Hardcoded secret/token"),
    (r"(?i)mongodb(\+srv)?://[^@\s]+:[^@\s]+@", "Secret", "critical", "MongoDB connection string with credentials"),
    (r"(?i)postgres(ql)?://[^@\s]+:[^@\s]+@", "Secret", "critical", "PostgreSQL connection string with credentials"),
    (r"(?i)redis://:[^@\s]+@", "Secret", "warning", "Redis connection string with password"),
    // Warning: dangerous code patterns
    (r"\beval\s*\(", "Dangerous Code", "warning", "Use of eval() — potential code injection"),
    (r"\bexec\s*\(", "Dangerous Code", "warning", "Use of exec() — potential command injection"),
    (r#"(?i)"SELECT\s.+"\s*\+"#, "SQL Injection", "warning", "Potential SQL injection via string concatenation"),
    (r#"(?i)f"SELECT\s.+\{"#, "SQL Injection", "warning", "Potential SQL injection in f-string"),
    (r#"(?i)format!\s*\("SELECT"#, "SQL Injection", "warning", "Potential SQL injection in format!()"),
    (r#"http://(?!localhost|127\.0\.0\.1|0\.0\.0\.0)"#, "Insecure Transport", "info", "HTTP (non-HTTPS) URL in production code"),
    (r"(?i)console\.log\s*\(.*(?:password|token|secret|key)", "Secret Leak", "warning", "Logging sensitive data"),
    (r"(?i)println!\s*\(.*(?:password|token|secret|key)", "Secret Leak", "warning", "Printing sensitive data"),
    // Info: left-behind markers
    (r"(?i)TODO.*security", "TODO", "info", "Security-related TODO comment"),
    (r"(?i)FIXME.*auth", "TODO", "info", "Auth-related FIXME comment"),
    (r"(?i)HACK.*security", "TODO", "info", "Security-related HACK comment"),
];

/// File extensions to skip (binary, assets, lock files)
const SKIP_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "mp4", "mov", "mp3",
    "pdf", "zip", "tar", "gz", "wasm", "exe", "dmg", "pkg",
    "lock", "sum",
];

/// Directories to skip
const SKIP_DIRS: &[&str] = &[
    "node_modules", ".git", "target", "__pycache__", ".next",
    "dist", "build", ".cache", "vendor", ".venv", "venv",
];

fn should_skip_file(path: &str) -> bool {
    let p = Path::new(path);
    if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
        if SKIP_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
            return true;
        }
    }
    // Skip minified files
    if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
        if name.contains(".min.") || name.ends_with(".min.js") || name.ends_with(".min.css") {
            return true;
        }
    }
    false
}

fn scan_content(file_path: &str, content: &str) -> Vec<SecurityIssue> {
    let mut issues = Vec::new();

    for (i, line) in content.lines().enumerate() {
        // Skip comment lines that are just documentation about patterns
        let trimmed = line.trim();
        if trimmed.starts_with("//") || trimmed.starts_with('#') || trimmed.starts_with('*') {
            // Still scan for critical secrets even in comments
            for (pattern, category, severity, description) in PATTERNS {
                if *severity != "critical" {
                    continue;
                }
                if let Ok(re) = regex::Regex::new(pattern) {
                    if re.is_match(line) {
                        let snippet = line.chars().take(120).collect::<String>();
                        issues.push(SecurityIssue {
                            file: file_path.to_string(),
                            line: i + 1,
                            severity: severity.to_string(),
                            category: category.to_string(),
                            description: description.to_string(),
                            snippet,
                        });
                    }
                }
            }
            continue;
        }

        for (pattern, category, severity, description) in PATTERNS {
            if let Ok(re) = regex::Regex::new(pattern) {
                if re.is_match(line) {
                    let snippet = line.chars().take(120).collect::<String>();
                    issues.push(SecurityIssue {
                        file: file_path.to_string(),
                        line: i + 1,
                        severity: severity.to_string(),
                        category: category.to_string(),
                        description: description.to_string(),
                        snippet,
                    });
                    break; // One issue per line (first match wins)
                }
            }
        }
    }

    issues
}

/// Scan a list of specific file paths (used for staged file pre-commit check)
#[tauri::command]
pub async fn scan_files_security(paths: Vec<String>) -> Result<Vec<SecurityIssue>, String> {
    let mut all_issues = Vec::new();

    for path in &paths {
        if should_skip_file(path) {
            continue;
        }
        match std::fs::read_to_string(path) {
            Ok(content) => {
                let issues = scan_content(path, &content);
                all_issues.extend(issues);
            }
            Err(_) => {} // Skip unreadable files silently
        }
    }

    // Sort: critical first, then by file, then by line
    all_issues.sort_by(|a, b| {
        let sev_order = |s: &str| match s { "critical" => 0, "warning" => 1, _ => 2 };
        sev_order(&a.severity)
            .cmp(&sev_order(&b.severity))
            .then(a.file.cmp(&b.file))
            .then(a.line.cmp(&b.line))
    });

    Ok(all_issues)
}

/// Recursively scan an entire directory (full repo scan)
#[tauri::command]
pub async fn scan_repo_security(workspace_dir: String) -> Result<Vec<SecurityIssue>, String> {
    let mut all_issues = Vec::new();
    scan_dir_recursive(&workspace_dir, &workspace_dir, &mut all_issues, 0);

    all_issues.sort_by(|a, b| {
        let sev_order = |s: &str| match s { "critical" => 0, "warning" => 1, _ => 2 };
        sev_order(&a.severity)
            .cmp(&sev_order(&b.severity))
            .then(a.file.cmp(&b.file))
            .then(a.line.cmp(&b.line))
    });

    Ok(all_issues)
}

fn scan_dir_recursive(
    workspace: &str,
    dir: &str,
    issues: &mut Vec<SecurityIssue>,
    depth: usize,
) {
    if depth > 8 {
        return;
    }

    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if path.is_dir() {
            if SKIP_DIRS.contains(&name.as_str()) {
                continue;
            }
            scan_dir_recursive(workspace, &path.to_string_lossy(), issues, depth + 1);
        } else {
            let path_str = path.to_string_lossy().to_string();
            if should_skip_file(&path_str) {
                continue;
            }
            // Use relative path for display
            let display_path = path_str
                .strip_prefix(workspace)
                .unwrap_or(&path_str)
                .trim_start_matches('/')
                .to_string();

            if let Ok(content) = std::fs::read_to_string(&path) {
                let file_issues = scan_content(&display_path, &content);
                issues.extend(file_issues);
            }
        }
    }
}
