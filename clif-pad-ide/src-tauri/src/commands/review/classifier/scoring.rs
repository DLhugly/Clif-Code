//! Scoring rules for the PR classifier.

use serde::{Deserialize, Serialize};

use super::parser::FileDiff;
use super::patterns::*;
use crate::commands::security::{scan_content, SecurityIssue};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Signal {
    pub id: &'static str,
    pub label: String,
    pub points: u32,
    pub severity: &'static str, // "info" | "warning" | "critical"
    pub detail: Option<String>,
    pub locator: Option<String>,
}

pub struct ScoringOutput {
    pub score: u32,
    pub signals: Vec<Signal>,
    pub hard_override: Option<&'static str>,
    pub security_issues: Vec<SecurityIssue>,
}

pub fn score_diff(files: &[FileDiff], commit_messages: &[String]) -> ScoringOutput {
    let mut signals: Vec<Signal> = Vec::new();
    let mut score: u32 = 0;
    let mut hard_override: Option<&'static str> = None;
    let mut security_issues: Vec<SecurityIssue> = Vec::new();

    score_filenames(files, &mut score, &mut signals, &mut hard_override);
    score_content(files, &mut score, &mut signals, &mut hard_override);
    run_security_scan(files, &mut score, &mut signals, &mut hard_override, &mut security_issues);
    score_structure(files, &mut score, &mut signals);
    score_size(files, &mut score, &mut signals);
    score_test_coverage(files, &mut score, &mut signals);
    score_logic_density(files, &mut score, &mut signals);
    score_logging_removal(files, &mut score, &mut signals);
    score_dependency_bumps(files, &mut score, &mut signals);
    score_suppressions(files, &mut signals);
    score_commit_messages(commit_messages, &mut score, &mut signals, &mut hard_override);

    ScoringOutput {
        score,
        signals,
        hard_override,
        security_issues,
    }
}

// ----- Filename-based signals -------------------------------------------------

fn score_filenames(
    files: &[FileDiff],
    score: &mut u32,
    signals: &mut Vec<Signal>,
    hard_override: &mut Option<&'static str>,
) {
    let mut ci = 0u32;
    let mut secrets = 0u32;
    let mut infra = 0u32;
    let mut migration = 0u32;

    for f in files {
        let p = &f.path;
        if is_secrets_file(p) {
            secrets += 1;
        }
        if is_ci_config(p) {
            ci += 1;
        }
        if is_infra_file(p) || is_k8s_yaml(p, &f.added_lines.join("\n")) {
            infra += 1;
        }
        if is_migration_file(p) {
            migration += 1;
        }
    }

    if secrets > 0 {
        *hard_override = Some("touches secrets file");
        *score = score.saturating_add(50);
        signals.push(Signal {
            id: "secrets_file",
            label: format!("Touches {} secrets-like file(s)", secrets),
            points: 50,
            severity: "critical",
            detail: Some(".env/.pem/.key/credentials/secrets patterns detected.".into()),
            locator: None,
        });
    }
    if ci > 0 {
        *score = score.saturating_add(25);
        signals.push(Signal {
            id: "ci_config",
            label: format!("Touches {} CI config file(s)", ci),
            points: 25,
            severity: "warning",
            detail: None,
            locator: None,
        });
    }
    if infra > 0 {
        *score = score.saturating_add(20);
        signals.push(Signal {
            id: "infra_code",
            label: format!("Touches {} infra/IaC file(s)", infra),
            points: 20,
            severity: "warning",
            detail: None,
            locator: None,
        });
    }
    if migration > 0 {
        *score = score.saturating_add(20);
        signals.push(Signal {
            id: "migration",
            label: format!("Touches {} DB migration file(s)", migration),
            points: 20,
            severity: "warning",
            detail: None,
            locator: None,
        });
    }
}

// ----- Content-based signals --------------------------------------------------

fn score_content(
    files: &[FileDiff],
    score: &mut u32,
    signals: &mut Vec<Signal>,
    hard_override: &mut Option<&'static str>,
) {
    for f in files {
        let combined = format!("{}\n{}", f.added_lines.join("\n"), f.removed_lines.join("\n"));
        if destructive_sql_re().is_match(&combined) && !signals.iter().any(|s| s.id == "destructive_sql") {
            *hard_override = Some("destructive SQL");
            *score = score.saturating_add(40);
            signals.push(Signal {
                id: "destructive_sql",
                label: "Destructive SQL detected".into(),
                points: 40,
                severity: "critical",
                detail: Some("DROP/TRUNCATE/DELETE-FROM pattern found.".into()),
                locator: Some(f.path.clone()),
            });
        }
        if schema_ddl_re().is_match(&combined) && !signals.iter().any(|s| s.id == "schema_ddl") {
            *score = score.saturating_add(15);
            signals.push(Signal {
                id: "schema_ddl",
                label: "Schema DDL (CREATE/ALTER)".into(),
                points: 15,
                severity: "warning",
                detail: None,
                locator: Some(f.path.clone()),
            });
        }
        if auth_re().is_match(&combined) && !signals.iter().any(|s| s.id == "auth_code") {
            *score = score.saturating_add(20);
            signals.push(Signal {
                id: "auth_code",
                label: "Auth / session / JWT code".into(),
                points: 20,
                severity: "warning",
                detail: None,
                locator: Some(f.path.clone()),
            });
        }
        if payment_re().is_match(&combined) && !signals.iter().any(|s| s.id == "payment_code") {
            *score = score.saturating_add(20);
            signals.push(Signal {
                id: "payment_code",
                label: "Payment / billing code".into(),
                points: 20,
                severity: "warning",
                detail: None,
                locator: Some(f.path.clone()),
            });
        }
        if crypto_re().is_match(&combined) && !signals.iter().any(|s| s.id == "crypto_code") {
            *score = score.saturating_add(15);
            signals.push(Signal {
                id: "crypto_code",
                label: "Crypto primitives".into(),
                points: 15,
                severity: "warning",
                detail: None,
                locator: Some(f.path.clone()),
            });
        }
    }
}

// ----- Security scanner (reuse existing) -------------------------------------

fn run_security_scan(
    files: &[FileDiff],
    score: &mut u32,
    signals: &mut Vec<Signal>,
    hard_override: &mut Option<&'static str>,
    security_issues: &mut Vec<SecurityIssue>,
) {
    for f in files {
        if f.is_removed || f.is_generated_or_binary || f.is_binary_diff || f.is_rename {
            continue;
        }
        let issues = scan_content(&f.path, &f.added_lines.join("\n"));
        for issue in issues {
            let pts = match issue.severity.as_str() {
                "critical" => 50,
                "warning" => 10,
                _ => 2,
            };
            *score = score.saturating_add(pts);
            if issue.severity == "critical" && hard_override.is_none() {
                *hard_override = Some("critical security scanner hit");
            }
            signals.push(Signal {
                id: "security_scan",
                label: format!("{} ({})", issue.description, issue.category),
                points: pts,
                severity: match issue.severity.as_str() {
                    "critical" => "critical",
                    "warning" => "warning",
                    _ => "info",
                },
                detail: Some(issue.snippet.clone()),
                locator: Some(format!("{}:{}", issue.file, issue.line)),
            });
            security_issues.push(issue);
        }
    }
}

// ----- Structural signals -----------------------------------------------------

fn score_structure(files: &[FileDiff], score: &mut u32, signals: &mut Vec<Signal>) {
    // Dependency manifest additions
    let mut dep_manifest_count = 0u32;
    let mut added_lines_in_manifests = 0u32;
    for f in files {
        if is_dependency_manifest(&f.path) {
            dep_manifest_count += 1;
            added_lines_in_manifests += f.added_lines.len() as u32;
        }
    }
    if dep_manifest_count > 0 && added_lines_in_manifests > 0 {
        let pts = (added_lines_in_manifests / 2).min(20) + 5;
        *score = score.saturating_add(pts);
        signals.push(Signal {
            id: "new_dependencies",
            label: format!(
                "Possibly adds dependencies ({} manifest file(s), {} added lines)",
                dep_manifest_count, added_lines_in_manifests
            ),
            points: pts,
            severity: "warning",
            detail: None,
            locator: None,
        });
    }

    // Removed tests
    let removed_test_files = files
        .iter()
        .filter(|f| f.is_removed && is_test_file(&f.path))
        .count() as u32;
    if removed_test_files > 0 {
        *score = score.saturating_add(15);
        signals.push(Signal {
            id: "removed_tests",
            label: format!("Removed {} test file(s)", removed_test_files),
            points: 15,
            severity: "warning",
            detail: None,
            locator: None,
        });
    }

    // Removed error handling
    let mut removed_handlers = 0u32;
    for f in files {
        for l in &f.removed_lines {
            if removed_error_handling_re().is_match(l) {
                removed_handlers += 1;
            }
        }
    }
    if removed_handlers > 0 {
        let pts = (removed_handlers * 2).min(10);
        *score = score.saturating_add(pts);
        signals.push(Signal {
            id: "removed_error_handling",
            label: format!("Removed {} error-handling line(s)", removed_handlers),
            points: pts,
            severity: "warning",
            detail: None,
            locator: None,
        });
    }

    // Exported symbols delta
    let mut added_exports = 0u32;
    let mut removed_exports = 0u32;
    for f in files {
        for l in &f.added_lines {
            if exported_symbol_re().is_match(l) {
                added_exports += 1;
            }
        }
        for l in &f.removed_lines {
            if exported_symbol_re().is_match(l) {
                removed_exports += 1;
            }
        }
    }
    if added_exports > 0 {
        let pts = added_exports.min(4) * 5;
        *score = score.saturating_add(pts);
        signals.push(Signal {
            id: "new_exports",
            label: format!("Adds {} exported symbol(s)", added_exports),
            points: pts,
            severity: "info",
            detail: None,
            locator: None,
        });
    }
    if removed_exports > 0 {
        *score = score.saturating_add(20);
        signals.push(Signal {
            id: "removed_exports",
            label: format!(
                "Removes {} exported symbol(s) (potential breaking change)",
                removed_exports
            ),
            points: 20,
            severity: "warning",
            detail: None,
            locator: None,
        });
    }
}

// Size / logic-density / logging / dep-bump / suppression signals live in
// `scoring_dynamic.rs` to keep this file under the LOC cap. See there for
// the research notes and weights.
use super::scoring_dynamic::{
    score_dependency_bumps, score_logging_removal, score_logic_density, score_size,
    score_suppressions,
};

// ----- Test coverage ---------------------------------------------------------

fn score_test_coverage(files: &[FileDiff], score: &mut u32, signals: &mut Vec<Signal>) {
    let mut source_count = 0u32;
    let mut test_count = 0u32;
    let mut content_count = 0u32;
    let mut lock_count = 0u32;

    for f in files {
        let p = &f.path;
        if is_test_file(p) {
            test_count += 1;
        } else if is_content_file(p) {
            content_count += 1;
        } else if is_lock_or_generated(p) {
            lock_count += 1;
        } else {
            source_count += 1;
        }
    }

    if source_count > 0 && test_count == 0 {
        *score = score.saturating_add(10);
        signals.push(Signal {
            id: "source_without_tests",
            label: "Source changes without test changes".into(),
            points: 10,
            severity: "warning",
            detail: None,
            locator: None,
        });
    } else if test_count > 0 && source_count == 0 && content_count == 0 && lock_count == 0 {
        let reduction = (*score).min(20);
        *score = score.saturating_sub(reduction);
        signals.push(Signal {
            id: "tests_only",
            label: "Tests-only change".into(),
            points: 0,
            severity: "info",
            detail: Some(format!("Reduced score by {}.", reduction)),
            locator: None,
        });
    }
}

// ----- Commit messages --------------------------------------------------------

fn score_commit_messages(
    commit_messages: &[String],
    score: &mut u32,
    signals: &mut Vec<Signal>,
    hard_override: &mut Option<&'static str>,
) {
    let joined = commit_messages.join("\n");
    if breaking_change_re().is_match(&joined) {
        *hard_override = Some("BREAKING CHANGE marker");
        *score = score.saturating_add(30);
        signals.push(Signal {
            id: "breaking_change",
            label: "Commit marks breaking change".into(),
            points: 30,
            severity: "critical",
            detail: None,
            locator: None,
        });
    }
    if risk_keyword_re().is_match(&joined) {
        *score = score.saturating_add(10);
        signals.push(Signal {
            id: "risk_keywords",
            label: "Risk keywords in commit messages".into(),
            points: 10,
            severity: "warning",
            detail: None,
            locator: None,
        });
    }
}
