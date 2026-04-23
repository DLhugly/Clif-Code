//! Regex-based symbol extraction. No tree-sitter — this keeps the indexer
//! dependency-free and cross-platform without packaging headaches. Trade-off
//! is that we accept some false positives / negatives on unusual code
//! structures (e.g. dynamically-defined classes). In practice that's fine:
//! the goal is "where is UserService defined?" not a formal AST.

use regex::Regex;
use std::sync::OnceLock;

use super::schema::{Symbol, SymbolKind};

/// Detect language from extension. Returns "unknown" for types we don't
/// handle; callers then fall back to "no symbols, text-index only".
pub fn detect_language(path: &str) -> &'static str {
    let lower = path.to_lowercase();
    if lower.ends_with(".ts") || lower.ends_with(".tsx") {
        "typescript"
    } else if lower.ends_with(".js") || lower.ends_with(".jsx") || lower.ends_with(".mjs") || lower.ends_with(".cjs") {
        "javascript"
    } else if lower.ends_with(".py") || lower.ends_with(".pyi") {
        "python"
    } else if lower.ends_with(".rs") {
        "rust"
    } else if lower.ends_with(".go") {
        "go"
    } else if lower.ends_with(".java") {
        "java"
    } else if lower.ends_with(".rb") {
        "ruby"
    } else if lower.ends_with(".swift") {
        "swift"
    } else if lower.ends_with(".kt") || lower.ends_with(".kts") {
        "kotlin"
    } else if lower.ends_with(".cs") {
        "csharp"
    } else if lower.ends_with(".cpp") || lower.ends_with(".cc") || lower.ends_with(".cxx")
        || lower.ends_with(".c") || lower.ends_with(".h") || lower.ends_with(".hpp")
    {
        "cpp"
    } else if lower.ends_with(".php") {
        "php"
    } else {
        "unknown"
    }
}

/// Extract symbols from a source file's text. Returns empty for unknown
/// languages. `path` is the relative workspace path used in the Symbol
/// struct; doesn't affect parsing.
pub fn extract_symbols(path: &str, content: &str) -> Vec<Symbol> {
    let language = detect_language(path);
    if language == "unknown" {
        return Vec::new();
    }

    // Collect (line_no_1_indexed, Symbol) so we can sort stably afterward.
    let mut out: Vec<Symbol> = Vec::new();
    let patterns = patterns_for(language);
    for (line_idx, line) in content.lines().enumerate() {
        // Skip obvious comment-only lines early — cheap optimization.
        let trimmed = line.trim_start();
        if trimmed.starts_with("//") || trimmed.starts_with("#")
            || trimmed.starts_with("/*") || trimmed.starts_with("*")
        {
            continue;
        }
        for (kind, re) in patterns {
            for cap in re.captures_iter(line) {
                if let Some(name_match) = cap.get(1) {
                    let name = name_match.as_str();
                    // Skip one-letter identifiers and a few reserved words that
                    // match some of our permissive patterns.
                    if name.len() < 2 || is_reserved_word(name) {
                        continue;
                    }
                    out.push(Symbol {
                        name: name.to_string(),
                        kind: *kind,
                        file: path.to_string(),
                        line: (line_idx as u32) + 1,
                        language: language.to_string(),
                    });
                }
            }
        }
    }

    // De-dupe: a single (name, file) can match multiple patterns on the same
    // line (e.g. "export class Foo"). Keep the first hit.
    dedupe_by_name_file(&mut out);
    out
}

fn dedupe_by_name_file(symbols: &mut Vec<Symbol>) {
    use std::collections::HashSet;
    let mut seen: HashSet<(String, String, u32)> = HashSet::new();
    symbols.retain(|s| seen.insert((s.name.clone(), s.file.clone(), s.line)));
}

fn is_reserved_word(name: &str) -> bool {
    matches!(
        name,
        "if" | "else" | "for" | "while" | "return" | "let" | "const" | "var"
        | "function" | "class" | "interface" | "type" | "enum" | "struct"
        | "trait" | "impl" | "pub" | "fn" | "def" | "async" | "await"
        | "true" | "false" | "null" | "None" | "True" | "False" | "self"
        | "this" | "super" | "public" | "private" | "protected" | "static"
    )
}

// ---------------------------------------------------------------------------
// Pattern sets per language
// ---------------------------------------------------------------------------

fn re(pattern: &str) -> Regex {
    Regex::new(pattern).expect("valid regex")
}

type PatternSet = &'static [(SymbolKind, &'static Regex)];

fn patterns_for(language: &str) -> PatternSet {
    match language {
        "typescript" | "javascript" => ts_patterns(),
        "python" => py_patterns(),
        "rust" => rust_patterns(),
        "go" => go_patterns(),
        "java" | "kotlin" | "swift" | "csharp" => jvm_like_patterns(),
        _ => &[],
    }
}

// TypeScript / JavaScript -----------------------------------------------------

fn ts_patterns() -> PatternSet {
    static P: OnceLock<Vec<(SymbolKind, Regex)>> = OnceLock::new();
    let v = P.get_or_init(|| {
        vec![
            (SymbolKind::Function, re(r"(?:^|\s)(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)")),
            (SymbolKind::Class, re(r"(?:^|\s)(?:export\s+)?(?:abstract\s+)?class\s+([A-Z][\w$]*)")),
            (SymbolKind::Interface, re(r"(?:^|\s)(?:export\s+)?interface\s+([A-Z][\w$]*)")),
            (SymbolKind::Type, re(r"(?:^|\s)(?:export\s+)?type\s+([A-Z][\w$]*)")),
            (SymbolKind::Enum, re(r"(?:^|\s)(?:export\s+)?(?:const\s+)?enum\s+([A-Z][\w$]*)")),
            // Arrow functions bound to a const — the most common modern pattern.
            (SymbolKind::Function, re(r"(?:^|\s)(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*[^=]+)?=>")),
            // Top-level exported constants that aren't functions.
            (SymbolKind::Constant, re(r"(?:^|\s)export\s+const\s+([A-Z_][A-Z0-9_]*)\s*=")),
        ]
    });
    leak_slice(v)
}

// Python ----------------------------------------------------------------------

fn py_patterns() -> PatternSet {
    static P: OnceLock<Vec<(SymbolKind, Regex)>> = OnceLock::new();
    let v = P.get_or_init(|| {
        vec![
            (SymbolKind::Function, re(r"^\s*(?:async\s+)?def\s+([A-Za-z_][\w]*)")),
            (SymbolKind::Class, re(r"^\s*class\s+([A-Za-z_][\w]*)")),
        ]
    });
    leak_slice(v)
}

// Rust ------------------------------------------------------------------------

fn rust_patterns() -> PatternSet {
    static P: OnceLock<Vec<(SymbolKind, Regex)>> = OnceLock::new();
    let v = P.get_or_init(|| {
        vec![
            (SymbolKind::Function, re(r"(?:^|\s)(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_][\w]*)")),
            (SymbolKind::Struct, re(r"(?:^|\s)(?:pub(?:\([^)]+\))?\s+)?struct\s+([A-Za-z_][\w]*)")),
            (SymbolKind::Enum, re(r"(?:^|\s)(?:pub(?:\([^)]+\))?\s+)?enum\s+([A-Za-z_][\w]*)")),
            (SymbolKind::Trait, re(r"(?:^|\s)(?:pub(?:\([^)]+\))?\s+)?trait\s+([A-Za-z_][\w]*)")),
            (SymbolKind::Type, re(r"(?:^|\s)(?:pub(?:\([^)]+\))?\s+)?type\s+([A-Za-z_][\w]*)")),
            (SymbolKind::Constant, re(r"(?:^|\s)(?:pub(?:\([^)]+\))?\s+)?(?:const|static)\s+([A-Z_][A-Z0-9_]*)\s*:")),
        ]
    });
    leak_slice(v)
}

// Go --------------------------------------------------------------------------

fn go_patterns() -> PatternSet {
    static P: OnceLock<Vec<(SymbolKind, Regex)>> = OnceLock::new();
    let v = P.get_or_init(|| {
        vec![
            // func Name(...)  or  func (r *Recv) Name(...)
            (SymbolKind::Function, re(r"^\s*func\s+(?:\([^)]+\)\s+)?([A-Za-z_][\w]*)")),
            (SymbolKind::Struct, re(r"^\s*type\s+([A-Za-z_][\w]*)\s+struct\b")),
            (SymbolKind::Interface, re(r"^\s*type\s+([A-Za-z_][\w]*)\s+interface\b")),
            (SymbolKind::Type, re(r"^\s*type\s+([A-Za-z_][\w]*)\s+[A-Za-z]")),
        ]
    });
    leak_slice(v)
}

// Java / Kotlin / Swift / C# — permissive shared pattern ----------------------

fn jvm_like_patterns() -> PatternSet {
    static P: OnceLock<Vec<(SymbolKind, Regex)>> = OnceLock::new();
    let v = P.get_or_init(|| {
        vec![
            (SymbolKind::Class, re(r"(?:^|\s)(?:public|private|protected|internal|sealed|abstract|final|open)?\s*class\s+([A-Z][\w]*)")),
            (SymbolKind::Interface, re(r"(?:^|\s)(?:public|private|protected|internal)?\s*interface\s+([A-Z][\w]*)")),
            (SymbolKind::Enum, re(r"(?:^|\s)(?:public|private|protected|internal)?\s*enum(?:\s+class)?\s+([A-Z][\w]*)")),
            (SymbolKind::Function, re(r"^\s*(?:public|private|protected|internal)?\s*(?:static|final|override|open|suspend)?\s*(?:fun|func|void|Task|Future|[A-Za-z_]\w*(?:<[^>]+>)?)\s+([A-Za-z_][\w]*)\s*\(")),
        ]
    });
    leak_slice(v)
}

// Pattern tables are static; convert Vec<(SymbolKind, Regex)> to the &'static
// slice shape patterns_for returns. We intentionally leak via Box::leak —
// exactly once at init per language, negligible.
fn leak_slice(v: &Vec<(SymbolKind, Regex)>) -> PatternSet {
    let leaked: Vec<(SymbolKind, &'static Regex)> = v
        .iter()
        .map(|(k, r)| (*k, Box::leak(Box::new(r.clone())) as &'static Regex))
        .collect();
    Box::leak(leaked.into_boxed_slice())
}
