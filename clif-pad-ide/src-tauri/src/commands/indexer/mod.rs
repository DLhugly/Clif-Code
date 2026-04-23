//! Deterministic codebase indexer. Zero LLM, zero network. Produces a
//! symbol table + BM25 text index + recency scores under
//! `<workspace>/.clif/index/snapshot.json`. The agent queries it via
//! `index_find_symbol` and `index_search`, and the frontend surfaces build
//! progress in the status bar.
//!
//! Layout: schema.rs (types), symbols.rs (regex extraction), bm25.rs
//! (ranked text), recency.rs (git-log timestamps), store.rs (persistence).

mod bm25;
mod recency;
pub mod schema;
mod store;
mod symbols;

use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter};

use schema::{
    Bm25Index, FileStats, IndexProgress, IndexSnapshot, IndexStatusReport, SearchHit, Symbol,
    SymbolHit,
};

/// Active build tasks keyed by workspace dir, so concurrent `index_build`
/// calls coalesce instead of stepping on each other.
static BUILD_LOCKS: std::sync::LazyLock<Arc<Mutex<std::collections::HashSet<String>>>> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(std::collections::HashSet::new())));

// Walk helpers ---------------------------------------------------------------

const MAX_FILE_BYTES: u64 = 512 * 1024; // skip huge files; they're rarely source
const MAX_FILES: usize = 20_000; // safety cap

fn is_skip_dir(name: &str) -> bool {
    matches!(
        name,
        "node_modules" | ".git" | "dist" | "build" | "target" | ".next" | ".nuxt"
        | ".svelte-kit" | ".parcel-cache" | ".cache" | ".turbo" | "out" | "coverage"
        | "__pycache__" | ".pytest_cache" | ".venv" | "venv" | "env"
        | ".gradle" | ".mvn" | "vendor" | "bin" | "obj"
        | ".DS_Store" | ".idea" | ".vscode" | ".clif"
    )
}

fn is_text_ext(path: &str) -> bool {
    let lower = path.to_lowercase();
    matches!(
        Path::new(&lower).extension().and_then(|e| e.to_str()),
        Some("ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs" | "py" | "pyi"
            | "rs" | "go" | "java" | "kt" | "kts" | "swift" | "cs"
            | "rb" | "php" | "cpp" | "cc" | "cxx" | "c" | "h" | "hpp"
            | "md" | "mdx" | "txt" | "yaml" | "yml" | "json" | "toml"
            | "html" | "css" | "scss" | "sql")
    )
}

fn walk_source_files(workspace_dir: &str) -> Vec<(String, u64)> {
    let mut out: Vec<(String, u64)> = Vec::new();
    let root = Path::new(workspace_dir);
    let mut stack: Vec<std::path::PathBuf> = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else { continue };
            if name.starts_with('.') && name != ".env" && name != ".gitignore" {
                if is_skip_dir(name) {
                    continue;
                }
            }
            if path.is_dir() {
                if !is_skip_dir(name) {
                    stack.push(path);
                }
                continue;
            }
            let Ok(meta) = entry.metadata() else { continue };
            if meta.len() > MAX_FILE_BYTES {
                continue;
            }
            let rel = path
                .strip_prefix(root)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            if rel.is_empty() {
                continue;
            }
            if !is_text_ext(&rel) {
                continue;
            }
            out.push((rel, meta.len()));
            if out.len() >= MAX_FILES {
                return out;
            }
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Build pipeline
// ---------------------------------------------------------------------------

fn emit(app: &Option<AppHandle>, progress: IndexProgress) {
    if let Some(app) = app.as_ref() {
        let _ = app.emit("index_progress", &progress);
    }
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Pure build logic. Idempotent; reads the repo and writes a snapshot. Emits
/// progress events when an AppHandle is available.
fn build_snapshot(workspace_dir: &str, app: Option<AppHandle>) -> Result<IndexSnapshot, String> {
    // 1) Walk.
    emit(&app, IndexProgress {
        phase: "scan",
        current: 0,
        total: 0,
        message: "Scanning repository…".into(),
    });
    let files = walk_source_files(workspace_dir);
    let total = files.len() as u32;
    if total == 0 {
        return Err("no indexable source files found".into());
    }

    // 2) Recency (do this up-front so it covers every file).
    emit(&app, IndexProgress {
        phase: "recency",
        current: 0,
        total,
        message: "Reading git history…".into(),
    });
    let recency_map = recency::collect(workspace_dir);

    // 3) Per-file symbols + tokens.
    let mut all_symbols: Vec<Symbol> = Vec::new();
    let mut file_stats: Vec<FileStats> = Vec::with_capacity(files.len());
    for (idx, (rel, size)) in files.iter().enumerate() {
        let full = Path::new(workspace_dir).join(rel);
        let content = match std::fs::read_to_string(&full) {
            Ok(s) => s,
            Err(_) => continue, // binary / unreadable
        };

        let language = symbols::detect_language(rel);
        let syms = symbols::extract_symbols(rel, &content);
        let line_count = content.lines().count() as u32;
        let tokens = bm25::tokenize(&content);
        let touched = recency_map
            .get(rel)
            .copied()
            .unwrap_or_else(|| recency::mtime_seconds(workspace_dir, rel));

        file_stats.push(FileStats {
            path: rel.clone(),
            language: language.to_string(),
            size_bytes: *size,
            line_count,
            symbol_count: syms.len() as u32,
            last_touched: touched,
            tokens,
        });
        all_symbols.extend(syms);

        if idx % 50 == 0 {
            emit(&app, IndexProgress {
                phase: "symbols",
                current: (idx + 1) as u32,
                total,
                message: format!("Parsing {}", rel),
            });
        }
    }

    // 4) BM25 postings.
    emit(&app, IndexProgress {
        phase: "postings",
        current: file_stats.len() as u32,
        total: file_stats.len() as u32,
        message: "Building search index…".into(),
    });
    let bm25_index: Bm25Index = bm25::build(file_stats);

    let snapshot = IndexSnapshot {
        workspace_dir: workspace_dir.to_string(),
        version: IndexSnapshot::CURRENT_VERSION,
        built_at: now_secs(),
        symbols: all_symbols,
        bm25: bm25_index,
    };

    emit(&app, IndexProgress {
        phase: "save",
        current: total,
        total,
        message: "Saving index…".into(),
    });
    store::save(workspace_dir, &snapshot)?;

    emit(&app, IndexProgress {
        phase: "done",
        current: total,
        total,
        message: format!(
            "Indexed {} files · {} symbols",
            snapshot.bm25.total_docs,
            snapshot.symbols.len()
        ),
    });

    Ok(snapshot)
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn index_build(app: AppHandle, workspace_dir: String) -> Result<IndexStatusReport, String> {
    {
        let mut locks = BUILD_LOCKS.lock().map_err(|e| e.to_string())?;
        if !locks.insert(workspace_dir.clone()) {
            return Err("index build already in progress for this workspace".into());
        }
    }
    let ws = workspace_dir.clone();
    let app_clone = app.clone();
    let result = tokio::task::spawn_blocking(move || build_snapshot(&ws, Some(app_clone)))
        .await
        .map_err(|e| format!("task join: {}", e))?;

    {
        let mut locks = BUILD_LOCKS.lock().map_err(|e| e.to_string())?;
        locks.remove(&workspace_dir);
    }

    match result {
        Ok(snap) => Ok(store::status_from_snapshot(Some(&snap))),
        Err(e) => {
            let _ = app.emit(
                "index_progress",
                &IndexProgress {
                    phase: "error",
                    current: 0,
                    total: 0,
                    message: e.clone(),
                },
            );
            Err(e)
        }
    }
}

#[tauri::command]
pub fn index_status(workspace_dir: String) -> Result<IndexStatusReport, String> {
    let snap = store::load(&workspace_dir);
    Ok(store::status_from_snapshot(snap.as_ref()))
}

#[tauri::command]
pub fn index_find_symbol(
    workspace_dir: String,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<SymbolHit>, String> {
    let snap = store::load(&workspace_dir).ok_or("index not built yet")?;
    let q = query.to_lowercase();
    let max = limit.unwrap_or(20).max(1) as usize;
    let mut hits: Vec<SymbolHit> = snap
        .symbols
        .iter()
        .filter_map(|s| {
            let lower = s.name.to_lowercase();
            let score: f64 = if lower == q {
                100.0
            } else if lower.starts_with(&q) {
                60.0
            } else if lower.contains(&q) {
                30.0
            } else {
                return None;
            };
            Some(SymbolHit { symbol: s.clone(), score })
        })
        .collect();
    hits.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    hits.truncate(max);
    Ok(hits)
}

#[tauri::command]
pub fn index_search(
    workspace_dir: String,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<SearchHit>, String> {
    let snap = store::load(&workspace_dir).ok_or("index not built yet")?;
    let ranked = bm25::query(&snap.bm25, &query);
    let max = limit.unwrap_or(20).max(1) as usize;
    let now = now_secs();

    let mut out: Vec<SearchHit> = Vec::with_capacity(ranked.len().min(max));
    for (file_idx, score) in ranked.into_iter().take(max * 2) {
        let file = &snap.bm25.files[file_idx as usize];
        let boost = recency::boost_for(file.last_touched, now);
        out.push(SearchHit {
            file: file.path.clone(),
            score: score * boost,
            line_matches: Vec::new(), // left empty for v1; agent can read the file
            recency_boost: boost,
        });
    }
    out.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    out.truncate(max);
    Ok(out)
}

/// Incremental re-index of a single file. Called from the frontend when the
/// file watcher fires. Best-effort — failures don't block editing.
#[tauri::command]
pub fn index_touch_file(workspace_dir: String, rel_path: String) -> Result<(), String> {
    let Some(mut snap) = store::load(&workspace_dir) else {
        return Ok(()); // no index yet; nothing to update
    };
    let full = Path::new(&workspace_dir).join(&rel_path);
    let Ok(content) = std::fs::read_to_string(&full) else {
        // File deleted — remove from snapshot.
        snap.symbols.retain(|s| s.file != rel_path);
        if let Some(pos) = snap.bm25.files.iter().position(|f| f.path == rel_path) {
            snap.bm25.files.remove(pos);
        }
        snap.bm25 = bm25::build(snap.bm25.files);
        snap.built_at = now_secs();
        return store::save(&workspace_dir, &snap);
    };

    snap.symbols.retain(|s| s.file != rel_path);
    snap.symbols
        .extend(symbols::extract_symbols(&rel_path, &content));

    let language = symbols::detect_language(&rel_path);
    let tokens = bm25::tokenize(&content);
    let line_count = content.lines().count() as u32;
    let size = std::fs::metadata(&full).map(|m| m.len()).unwrap_or(0);
    let touched = recency::mtime_seconds(&workspace_dir, &rel_path);

    if let Some(pos) = snap.bm25.files.iter().position(|f| f.path == rel_path) {
        snap.bm25.files[pos] = FileStats {
            path: rel_path.clone(),
            language: language.to_string(),
            size_bytes: size,
            line_count,
            symbol_count: snap
                .symbols
                .iter()
                .filter(|s| s.file == rel_path)
                .count() as u32,
            last_touched: touched,
            tokens,
        };
    } else {
        snap.bm25.files.push(FileStats {
            path: rel_path.clone(),
            language: language.to_string(),
            size_bytes: size,
            line_count,
            symbol_count: snap
                .symbols
                .iter()
                .filter(|s| s.file == rel_path)
                .count() as u32,
            last_touched: touched,
            tokens,
        });
    }

    snap.bm25 = bm25::build(snap.bm25.files);
    snap.built_at = now_secs();
    store::save(&workspace_dir, &snap)
}
