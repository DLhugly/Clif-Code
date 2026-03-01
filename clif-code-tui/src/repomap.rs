//! Workspace scanning — builds a repo map for LLM context.

use std::path::Path;

const IDENTITY_FILES: &[&str] = &[
    "README.md", "README.rst", "README.txt", "README",
    "Cargo.toml", "package.json", "pyproject.toml", "setup.py", "setup.cfg",
    "go.mod", "Gemfile", "build.gradle", "pom.xml", "Makefile",
    "docker-compose.yml", "Dockerfile",
    ".clifcode.toml",
];

const SKIP_DIRS: &[&str] = &[
    "node_modules", ".git", "target", "__pycache__", ".next",
    "dist", "build", ".cache", "vendor", ".venv", "venv",
    ".tox", "coverage", ".mypy_cache", ".pytest_cache",
];

const SKIP_FILES: &[&str] = &[
    ".DS_Store", "Thumbs.db", "package-lock.json", "yarn.lock", "Cargo.lock",
];

const CODE_EXTENSIONS: &[&str] = &[
    "rs", "py", "ts", "tsx", "js", "jsx", "go", "c", "cpp", "h",
    "java", "kt", "swift", "rb", "toml", "yaml", "yml", "json",
    "md", "txt", "sh", "bash", "zsh", "css", "scss", "html",
];

/// Scan the workspace and return a concise repo map string for LLM context.
pub fn scan_workspace(workspace: &str) -> String {
    let mut lines = Vec::new();
    let root = Path::new(workspace);
    lines.push(format!("Workspace: {workspace}"));
    lines.push(String::new());
    walk_dir(root, root, 0, &mut lines);

    // Truncate to ~4000 chars for LLM context window
    let mut result = String::new();
    for line in &lines {
        if result.len() + line.len() > 4000 {
            result.push_str("  ... (truncated)\n");
            break;
        }
        result.push_str(line);
        result.push('\n');
    }
    result
}

fn walk_dir(base: &Path, dir: &Path, depth: usize, lines: &mut Vec<String>) {
    if depth > 4 {
        return;
    }

    let mut entries: Vec<_> = match std::fs::read_dir(dir) {
        Ok(rd) => rd.filter_map(|e| e.ok()).collect(),
        Err(_) => return,
    };
    entries.sort_by_key(|e| e.file_name());

    let indent = "  ".repeat(depth);
    let mut dirs = Vec::new();
    let mut files = Vec::new();

    for entry in &entries {
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();

        if path.is_dir() {
            if !SKIP_DIRS.contains(&name.as_str()) {
                dirs.push((name, path));
            }
        } else if !SKIP_FILES.contains(&name.as_str()) {
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            if CODE_EXTENSIONS.contains(&ext)
                || name == "Makefile"
                || name == "Dockerfile"
            {
                files.push(name);
            }
        }
    }

    // Directories first, then files
    for (name, path) in &dirs {
        lines.push(format!("{indent}{name}/"));
        walk_dir(base, path, depth + 1, lines);
    }
    for name in &files {
        lines.push(format!("{indent}{name}"));
    }
}

/// Auto-detect and read project identity files for LLM context.
/// Returns Vec<(filename, truncated_content)>.
pub fn auto_context(workspace: &str) -> Vec<(String, String)> {
    let root = Path::new(workspace);
    let mut results = Vec::new();
    let mut total_chars = 0usize;
    const MAX_TOTAL: usize = 8000; // cap total auto-context
    const MAX_PER_FILE: usize = 2000;

    for &name in IDENTITY_FILES {
        let path = root.join(name);
        if path.is_file() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                let budget = MAX_PER_FILE.min(MAX_TOTAL.saturating_sub(total_chars));
                if budget == 0 {
                    break;
                }
                let truncated: String = content.chars().take(budget).collect();
                total_chars += truncated.len();
                results.push((name.to_string(), truncated));
            }
        }
    }

    results
}
