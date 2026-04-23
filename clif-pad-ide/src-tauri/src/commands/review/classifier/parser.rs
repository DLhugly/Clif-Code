//! Minimal unified-diff parser producing per-file add/remove line lists.

pub struct FileDiff {
    pub path: String,
    pub added_lines: Vec<String>,
    pub removed_lines: Vec<String>,
    pub is_added: bool,
    pub is_removed: bool,
}

pub fn parse_diff(diff: &str) -> Vec<FileDiff> {
    let mut files: Vec<FileDiff> = Vec::new();
    let mut current: Option<FileDiff> = None;

    for line in diff.lines() {
        if line.starts_with("diff --git ") {
            if let Some(f) = current.take() {
                files.push(f);
            }
            let path = line
                .split_whitespace()
                .last()
                .map(|s| s.trim_start_matches("b/").to_string())
                .unwrap_or_default();
            current = Some(FileDiff {
                path,
                added_lines: Vec::new(),
                removed_lines: Vec::new(),
                is_added: false,
                is_removed: false,
            });
        } else if line.starts_with("new file mode") {
            if let Some(c) = current.as_mut() {
                c.is_added = true;
            }
        } else if line.starts_with("deleted file mode") {
            if let Some(c) = current.as_mut() {
                c.is_removed = true;
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
    if let Some(f) = current {
        files.push(f);
    }
    files
}
