//! Tiny pure-Rust BM25 implementation. Not optimized for huge corpora (we
//! target ~10k files, not 10M), but correct and plenty fast for interactive
//! queries.

use std::collections::HashMap;

use super::schema::{Bm25Index, FileStats, Posting};

const BM25_K1: f64 = 1.2;
const BM25_B: f64 = 0.75;

/// Normalize a text blob into lowercase word tokens. Splits on non-alnum,
/// drops very short and very long tokens.
pub fn tokenize(text: &str) -> Vec<String> {
    let mut out = Vec::with_capacity(text.len() / 8);
    let mut buf = String::new();
    for ch in text.chars() {
        if ch.is_alphanumeric() || ch == '_' {
            buf.push(ch.to_ascii_lowercase());
        } else if !buf.is_empty() {
            maybe_push(&mut out, &buf);
            buf.clear();
        }
    }
    if !buf.is_empty() {
        maybe_push(&mut out, &buf);
    }
    out
}

fn maybe_push(out: &mut Vec<String>, token: &str) {
    let len = token.len();
    if len < 2 || len > 40 {
        return;
    }
    // Reject tokens that are purely digits — too common, low signal.
    if token.chars().all(|c| c.is_ascii_digit()) {
        return;
    }
    out.push(token.to_string());
}

/// Build a BM25 index over the given file stats. Postings are rebuilt from
/// scratch; files.tokens are assumed populated. `avg_doc_len` and
/// `total_docs` are set on the returned index.
pub fn build(files: Vec<FileStats>) -> Bm25Index {
    let total_docs = files.len() as u32;
    if total_docs == 0 {
        return Bm25Index {
            files,
            postings: Vec::new(),
            avg_doc_len: 0.0,
            total_docs: 0,
        };
    }

    let avg_doc_len: f64 = {
        let total: usize = files.iter().map(|f| f.tokens.len()).sum();
        total as f64 / total_docs as f64
    };

    // term -> (file_idx -> tf)
    let mut postings_map: HashMap<String, HashMap<u32, u16>> = HashMap::new();
    for (idx, file) in files.iter().enumerate() {
        let idx = idx as u32;
        let mut tf: HashMap<&str, u16> = HashMap::new();
        for tok in &file.tokens {
            let e = tf.entry(tok.as_str()).or_insert(0);
            *e = e.saturating_add(1);
        }
        for (term, count) in tf {
            postings_map
                .entry(term.to_string())
                .or_insert_with(HashMap::new)
                .insert(idx, count);
        }
    }

    let mut postings: Vec<Posting> = postings_map
        .into_iter()
        .map(|(term, map)| {
            let mut entries: Vec<(u32, u16)> = map.into_iter().collect();
            entries.sort_by_key(|(idx, _)| *idx);
            Posting { term, entries }
        })
        .collect();
    postings.sort_by(|a, b| a.term.cmp(&b.term));

    Bm25Index {
        files,
        postings,
        avg_doc_len,
        total_docs,
    }
}

/// Score documents against a query. Higher score = better match. Returns
/// (file_idx, score) sorted descending. Only returns files with score > 0.
pub fn query(index: &Bm25Index, query: &str) -> Vec<(u32, f64)> {
    if index.total_docs == 0 {
        return Vec::new();
    }
    let q_terms = tokenize(query);
    if q_terms.is_empty() {
        return Vec::new();
    }

    // file_idx -> accumulated score
    let mut scores: HashMap<u32, f64> = HashMap::new();
    for term in &q_terms {
        // Binary-searchable because postings is sorted by term.
        let posting = match index
            .postings
            .binary_search_by(|p| p.term.as_str().cmp(term.as_str()))
        {
            Ok(i) => &index.postings[i],
            Err(_) => continue,
        };
        let df = posting.entries.len() as f64;
        // Robertson-Sparck-Jones IDF with +1 smoothing.
        let idf = (((index.total_docs as f64 - df + 0.5) / (df + 0.5)) + 1.0).ln();
        for (file_idx, tf) in &posting.entries {
            let doc_len = index.files[*file_idx as usize].tokens.len() as f64;
            let len_norm = 1.0 - BM25_B + BM25_B * (doc_len / index.avg_doc_len.max(1.0));
            let tf = *tf as f64;
            let score = idf * ((tf * (BM25_K1 + 1.0)) / (tf + BM25_K1 * len_norm));
            *scores.entry(*file_idx).or_insert(0.0) += score;
        }
    }

    let mut out: Vec<(u32, f64)> = scores.into_iter().filter(|(_, s)| *s > 0.0).collect();
    out.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    out
}
