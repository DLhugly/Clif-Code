//! Indexer schema shared by symbols, bm25, recency, and on-disk snapshot.

use serde::{Deserialize, Serialize};

/// Kind of symbol extracted from source. Kept narrow on purpose — more kinds
/// means more regexes to maintain; this covers the "find the thing" jobs
/// users actually ask the agent about.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum SymbolKind {
    Function,
    Class,
    Interface,
    Type,
    Enum,
    Constant,
    Struct,
    Trait,
}

impl SymbolKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Function => "function",
            Self::Class => "class",
            Self::Interface => "interface",
            Self::Type => "type",
            Self::Enum => "enum",
            Self::Constant => "constant",
            Self::Struct => "struct",
            Self::Trait => "trait",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Symbol {
    pub name: String,
    pub kind: SymbolKind,
    pub file: String,  // relative to workspace root
    pub line: u32,     // 1-indexed
    pub language: String,
}

/// Aggregate per-file stats used for BM25 and recency-weighted ranking.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileStats {
    pub path: String,          // relative
    pub language: String,
    pub size_bytes: u64,
    pub line_count: u32,
    pub symbol_count: u32,
    /// Unix seconds of most recent touch (from git log or mtime fallback).
    pub last_touched: u64,
    /// Pre-tokenized text for BM25 (lowercased word tokens). Kept per-file so
    /// incremental re-index can rebuild just this file's posting list.
    #[serde(default)]
    pub tokens: Vec<String>,
}

/// BM25 posting list — maps term → [(file_index, term_frequency)].
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Posting {
    pub term: String,
    pub entries: Vec<(u32, u16)>, // (file_index, tf)
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Bm25Index {
    pub files: Vec<FileStats>,
    /// Inverted index: term → posting list. Rebuilt from files.tokens.
    #[serde(default)]
    pub postings: Vec<Posting>,
    pub avg_doc_len: f64,
    pub total_docs: u32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct IndexSnapshot {
    pub workspace_dir: String,
    pub version: u32, // schema version for forward-compat
    pub built_at: u64, // unix seconds
    pub symbols: Vec<Symbol>,
    pub bm25: Bm25Index,
}

impl IndexSnapshot {
    pub const CURRENT_VERSION: u32 = 1;
}

/// Reported to the frontend during a build; consumed by the status-bar chip.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexProgress {
    pub phase: &'static str,  // "scan" | "symbols" | "tokens" | "postings" | "save" | "done" | "error"
    pub current: u32,
    pub total: u32,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum IndexState {
    /// No snapshot exists on disk for this workspace.
    Missing,
    /// Background build in progress.
    Building,
    /// Fresh snapshot ready for queries.
    Ready,
    /// Build failed; reason in `IndexStatusReport.error`.
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexStatusReport {
    pub state: IndexState,
    pub built_at: Option<u64>,
    pub file_count: u32,
    pub symbol_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SymbolHit {
    pub symbol: Symbol,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchHit {
    pub file: String,
    pub score: f64,
    pub line_matches: Vec<(u32, String)>, // (line_no, snippet)
    pub recency_boost: f64,
}
