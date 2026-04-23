//! Dynamic / diff-shape signals: size, logic density, logging removal,
//! dependency bumps, and suppression bookkeeping. Split from `scoring.rs` to
//! keep each file under the project LOC cap.

use std::path::Path;

use super::parser::FileDiff;
use super::patterns::*;
use super::scoring::Signal;

/// Shared scoring gate — exclude files that are generated, renamed, or
/// binary so we don't inflate size / churn from lockfile bumps, renames, or
/// image assets.
pub fn is_scorable(f: &FileDiff) -> bool {
    !f.is_generated_or_binary && !f.is_binary_diff && !f.is_rename
}

// ----- Size signals -----------------------------------------------------------
//
// Research note (Codequiry 2026): raw LOC has correlation r=0.12 with
// defects, cyclomatic complexity r=0.18, while AST-level semantic churn
// reaches r=0.74. We keep size signals but weight them conservatively and
// exclude non-logic files from the count so a 50k-line lockfile bump doesn't
// drown real code review.
pub fn score_size(files: &[FileDiff], score: &mut u32, signals: &mut Vec<Signal>) {
    let scorable: Vec<&FileDiff> = files.iter().filter(|f| is_scorable(f)).collect();
    let total_added: usize = scorable.iter().map(|f| f.added_lines.len()).sum();
    let total_removed: usize = scorable.iter().map(|f| f.removed_lines.len()).sum();
    let total_changed = (total_added + total_removed) as u32;

    if total_changed > 1500 {
        *score = score.saturating_add(8);
        signals.push(Signal {
            id: "size_very_large",
            label: format!("Very large diff ({} lines of real code)", total_changed),
            points: 8,
            severity: "info",
            detail: Some("LOC alone is a weak defect predictor (r≈0.12). See logic-density.".into()),
            locator: None,
        });
    } else if total_changed > 500 {
        *score = score.saturating_add(4);
        signals.push(Signal {
            id: "size_large",
            label: format!("Large diff ({} lines of real code)", total_changed),
            points: 4,
            severity: "info",
            detail: None,
            locator: None,
        });
    }

    let file_count = scorable.len() as u32;
    if file_count > 50 {
        *score = score.saturating_add(10);
        signals.push(Signal {
            id: "files_very_many",
            label: format!("Very many source files touched ({})", file_count),
            points: 10,
            severity: "warning",
            detail: None,
            locator: None,
        });
    } else if file_count > 20 {
        *score = score.saturating_add(5);
        signals.push(Signal {
            id: "files_many",
            label: format!("Many source files touched ({})", file_count),
            points: 5,
            severity: "info",
            detail: None,
            locator: None,
        });
    }

    let dir_count = {
        use std::collections::HashSet;
        let mut set = HashSet::new();
        for f in &scorable {
            if let Some(parent) = Path::new(&f.path).parent() {
                set.insert(parent.to_string_lossy().to_string());
            }
        }
        set.len() as u32
    };
    if dir_count > 5 {
        *score = score.saturating_add(5);
        signals.push(Signal {
            id: "cross_cutting",
            label: format!("Cross-cutting ({} directories)", dir_count),
            points: 5,
            severity: "info",
            detail: None,
            locator: None,
        });
    }
}

// ----- Logic density (cheap AST proxy) ---------------------------------------
//
// Counts control-flow keyword occurrences in added vs removed lines. Delta
// approximates behavior change independent of LOC.
pub fn score_logic_density(files: &[FileDiff], score: &mut u32, signals: &mut Vec<Signal>) {
    let re = control_flow_re();
    let mut added_cf: u32 = 0;
    let mut removed_cf: u32 = 0;
    for f in files {
        if !is_scorable(f) {
            continue;
        }
        for line in &f.added_lines {
            added_cf = added_cf.saturating_add(re.find_iter(line).count() as u32);
        }
        for line in &f.removed_lines {
            removed_cf = removed_cf.saturating_add(re.find_iter(line).count() as u32);
        }
    }
    let net = added_cf.saturating_sub(removed_cf);
    if net > 60 {
        *score = score.saturating_add(20);
        signals.push(Signal {
            id: "logic_density_high",
            label: format!("Heavy logic change (net +{} control-flow tokens)", net),
            points: 20,
            severity: "warning",
            detail: Some("Cheap proxy for AST-level semantic churn. Strong defect predictor.".into()),
            locator: None,
        });
    } else if net > 30 {
        *score = score.saturating_add(10);
        signals.push(Signal {
            id: "logic_density_med",
            label: format!("Significant logic change (net +{} control-flow tokens)", net),
            points: 10,
            severity: "info",
            detail: None,
            locator: None,
        });
    } else if net == 0 && added_cf > 10 {
        signals.push(Signal {
            id: "logic_density_refactor",
            label: "Logic unchanged (refactor)".into(),
            points: 0,
            severity: "info",
            detail: Some("Same control-flow token count in ↑ and ↓ lines.".into()),
            locator: None,
        });
    }
}

// ----- Logging / telemetry removal -------------------------------------------
pub fn score_logging_removal(files: &[FileDiff], score: &mut u32, signals: &mut Vec<Signal>) {
    let re = logging_call_re();
    let mut removed: u32 = 0;
    let mut first_locator: Option<String> = None;
    for f in files {
        if !is_scorable(f) {
            continue;
        }
        for line in &f.removed_lines {
            if re.is_match(line) {
                removed = removed.saturating_add(1);
                if first_locator.is_none() {
                    first_locator = Some(f.path.clone());
                }
            }
        }
    }
    if removed >= 3 {
        let pts = (removed.min(8)) + 5;
        *score = score.saturating_add(pts);
        signals.push(Signal {
            id: "logging_removal",
            label: format!("Removed {} logging / print call(s)", removed),
            points: pts,
            severity: "warning",
            detail: Some("Watch for silenced errors or deleted instrumentation.".into()),
            locator: first_locator,
        });
    }
}

// ----- Dependency version bumps ----------------------------------------------
pub fn score_dependency_bumps(files: &[FileDiff], score: &mut u32, signals: &mut Vec<Signal>) {
    let re = dep_manifest_line_re();
    let mut major_bumps = 0u32;
    let mut bump_details: Vec<String> = Vec::new();
    for f in files {
        if !is_dependency_manifest(&f.path) {
            continue;
        }
        use std::collections::HashMap;
        let mut removed: HashMap<String, u32> = HashMap::new();
        let mut added: HashMap<String, u32> = HashMap::new();
        for line in &f.removed_lines {
            if let Some(cap) = re.captures(line) {
                if let (Some(pkg), Some(major)) = (cap.get(1), cap.get(2)) {
                    if let Ok(m) = major.as_str().parse::<u32>() {
                        removed.insert(pkg.as_str().to_string(), m);
                    }
                }
            }
        }
        for line in &f.added_lines {
            if let Some(cap) = re.captures(line) {
                if let (Some(pkg), Some(major)) = (cap.get(1), cap.get(2)) {
                    if let Ok(m) = major.as_str().parse::<u32>() {
                        added.insert(pkg.as_str().to_string(), m);
                    }
                }
            }
        }
        for (pkg, new_major) in &added {
            if let Some(old_major) = removed.get(pkg) {
                if new_major > old_major {
                    major_bumps = major_bumps.saturating_add(1);
                    if bump_details.len() < 5 {
                        bump_details.push(format!("{}: {}.x → {}.x", pkg, old_major, new_major));
                    }
                }
            }
        }
    }
    if major_bumps > 0 {
        let pts = (major_bumps * 8).min(20);
        *score = score.saturating_add(pts);
        signals.push(Signal {
            id: "dep_major_bump",
            label: format!(
                "{} major-version dep bump{}",
                major_bumps,
                if major_bumps == 1 { "" } else { "s" }
            ),
            points: pts,
            severity: "warning",
            detail: Some(bump_details.join("; ")),
            locator: None,
        });
    }
}

// ----- Informational: what we suppressed -------------------------------------
pub fn score_suppressions(files: &[FileDiff], signals: &mut Vec<Signal>) {
    let mut gen_count = 0u32;
    let mut rename_count = 0u32;
    let mut binary_count = 0u32;
    let mut suppressed_lines = 0u32;
    for f in files {
        let touched = (f.added_lines.len() + f.removed_lines.len()) as u32;
        if f.is_rename {
            rename_count += 1;
            suppressed_lines += touched;
        } else if f.is_generated_or_binary || f.is_binary_diff {
            if f.is_binary_diff {
                binary_count += 1;
            } else {
                gen_count += 1;
            }
            suppressed_lines += touched;
        }
    }
    let total = gen_count + rename_count + binary_count;
    if total == 0 {
        return;
    }
    let mut parts: Vec<String> = Vec::new();
    if gen_count > 0 {
        parts.push(format!("{} generated/lockfile", gen_count));
    }
    if rename_count > 0 {
        parts.push(format!("{} rename", rename_count));
    }
    if binary_count > 0 {
        parts.push(format!("{} binary", binary_count));
    }
    signals.push(Signal {
        id: "suppressed_files",
        label: format!("Ignored {} non-logic file(s)", total),
        points: 0,
        severity: "info",
        detail: Some(format!(
            "{} — ~{} lines excluded from size/churn scoring.",
            parts.join(", "),
            suppressed_lines
        )),
        locator: None,
    });
}
