//! Minimal unified-diff parser producing per-file add/remove line lists plus
//! metadata (rename, binary, generated).

use super::patterns::{generated_marker_re, is_generated_or_binary_file};

pub struct FileDiff {
    pub path: String,
    pub added_lines: Vec<String>,
    pub removed_lines: Vec<String>,
    pub is_added: bool,
    pub is_removed: bool,
    /// True when the diff header indicates a rename or copy with minimal
    /// content change. Used to suppress size scoring — moving a file is not
    /// inherently risky.
    pub is_rename: bool,
    /// True when the file looks like a build artifact, generated code, or
    /// binary asset. Size / churn scoring ignores these.
    pub is_generated_or_binary: bool,
    /// True if git marked this as a binary diff (no textual content).
    pub is_binary_diff: bool,
}

pub fn parse_diff(diff: &str) -> Vec<FileDiff> {
    let mut files: Vec<FileDiff> = Vec::new();
    let mut current: Option<FileDiff> = None;
    let mut seen_rename_marker = false;

    for line in diff.lines() {
        if line.starts_with("diff --git ") {
            if let Some(f) = finalize(current.take()) {
                files.push(f);
            }
            let path = line
                .split_whitespace()
                .last()
                .map(|s| s.trim_start_matches("b/").to_string())
                .unwrap_or_default();
            let is_gen = is_generated_or_binary_file(&path);
            current = Some(FileDiff {
                path,
                added_lines: Vec::new(),
                removed_lines: Vec::new(),
                is_added: false,
                is_removed: false,
                is_rename: false,
                is_generated_or_binary: is_gen,
                is_binary_diff: false,
            });
            seen_rename_marker = false;
        } else if line.starts_with("new file mode") {
            if let Some(c) = current.as_mut() {
                c.is_added = true;
            }
        } else if line.starts_with("deleted file mode") {
            if let Some(c) = current.as_mut() {
                c.is_removed = true;
            }
        } else if line.starts_with("rename from ") || line.starts_with("rename to ") {
            seen_rename_marker = true;
            if let Some(c) = current.as_mut() {
                c.is_rename = true;
            }
        } else if line.starts_with("copy from ") || line.starts_with("copy to ") {
            if let Some(c) = current.as_mut() {
                c.is_rename = true;
            }
        } else if line.starts_with("similarity index ") {
            // similarity index 95% on a rename → almost-pure move; scoring
            // shouldn't penalize this as if it were a real change.
            if seen_rename_marker {
                if let Some(c) = current.as_mut() {
                    c.is_rename = true;
                }
            }
        } else if line.starts_with("Binary files ") || line.starts_with("GIT binary patch") {
            if let Some(c) = current.as_mut() {
                c.is_binary_diff = true;
            }
        } else if let Some(c) = current.as_mut() {
            if line.starts_with("+++") || line.starts_with("---") || line.starts_with("@@") {
                continue;
            }
            if line.starts_with('+') {
                c.added_lines.push(line[1..].to_string());
            } else if line.starts_with('-') {
                c.removed_lines.push(line[1..].to_string());
            }
        }
    }
    if let Some(f) = finalize(current) {
        files.push(f);
    }
    files
}

/// If the file's own added lines contain a generated-marker, flag it as
/// generated even if its extension didn't match `is_generated_or_binary_file`.
fn finalize(file: Option<FileDiff>) -> Option<FileDiff> {
    let mut f = file?;
    if !f.is_generated_or_binary {
        for line in f.added_lines.iter().take(40) {
            if generated_marker_re().is_match(line) {
                f.is_generated_or_binary = true;
                break;
            }
        }
    }
    Some(f)
}
