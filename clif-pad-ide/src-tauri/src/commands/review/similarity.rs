use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

use crate::commands::gh::gh_std_command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimilarityScore {
    pub a: i64,
    pub b: i64,
    pub file_overlap: f32,
    pub title_similarity: f32,
    pub diff_hash_overlap: f32,
    pub combined: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelatedPr {
    pub pr_number: i64,
    pub title: String,
    pub author: String,
    pub score: SimilarityScore,
}

const STOPWORDS: &[&str] = &[
    "a", "an", "the", "and", "or", "of", "to", "in", "for", "on", "with", "by", "this", "that",
    "is", "it", "as", "at", "be", "from", "fix", "fixes", "add", "adds", "update", "updates",
    "remove", "removes", "pr", "chore", "feat", "refactor", "docs",
];

pub fn tokenize_title(title: &str) -> HashSet<String> {
    title
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| t.len() > 2 && !STOPWORDS.contains(t))
        .map(|t| t.to_string())
        .collect()
}

pub fn jaccard<T: std::hash::Hash + Eq>(a: &HashSet<T>, b: &HashSet<T>) -> f32 {
    if a.is_empty() && b.is_empty() {
        return 0.0;
    }
    let inter = a.intersection(b).count() as f32;
    let union = a.union(b).count() as f32;
    if union == 0.0 {
        0.0
    } else {
        inter / union
    }
}

pub fn fetch_pr_file_set(workspace_dir: &str, pr_number: i64) -> Result<HashSet<String>, String> {
    let mut cmd = gh_std_command()?;
    let out = cmd
        .args(["pr", "view", &pr_number.to_string(), "--json", "files"])
        .current_dir(workspace_dir)
        .output()
        .map_err(|e| format!("gh pr view failed: {}", e))?;
    if !out.status.success() {
        return Err(format!(
            "gh pr view files failed: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    let parsed: serde_json::Value = serde_json::from_slice(&out.stdout)
        .map_err(|e| format!("parse files: {}", e))?;
    let mut set = HashSet::new();
    if let Some(arr) = parsed.get("files").and_then(|v| v.as_array()) {
        for f in arr {
            if let Some(path) = f.get("path").and_then(|v| v.as_str()) {
                set.insert(path.to_string());
            }
        }
    }
    Ok(set)
}

pub fn fetch_pr_diff_hash_set(
    workspace_dir: &str,
    pr_number: i64,
) -> Result<HashSet<u64>, String> {
    let mut cmd = gh_std_command()?;
    let out = cmd
        .args(["pr", "diff", &pr_number.to_string()])
        .current_dir(workspace_dir)
        .output()
        .map_err(|e| format!("gh pr diff failed: {}", e))?;
    if !out.status.success() {
        return Err(format!(
            "gh pr diff failed: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    let raw = String::from_utf8_lossy(&out.stdout);
    Ok(hash_hunks(&raw))
}

fn hash_hunks(diff: &str) -> HashSet<u64> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut out = HashSet::new();
    let mut buf: Vec<String> = Vec::new();
    for line in diff.lines() {
        if line.starts_with("@@") {
            if !buf.is_empty() {
                let mut h = DefaultHasher::new();
                for l in &buf {
                    let norm: String = l.chars().filter(|c| !c.is_whitespace()).collect();
                    norm.hash(&mut h);
                }
                out.insert(h.finish());
                buf.clear();
            }
        } else if line.starts_with('+') && !line.starts_with("+++") {
            buf.push(line[1..].to_string());
        } else if line.starts_with('-') && !line.starts_with("---") {
            buf.push(line[1..].to_string());
        }
    }
    if !buf.is_empty() {
        let mut h = DefaultHasher::new();
        for l in &buf {
            let norm: String = l.chars().filter(|c| !c.is_whitespace()).collect();
            norm.hash(&mut h);
        }
        out.insert(h.finish());
    }
    out
}

pub struct PrBasics {
    pub number: i64,
    pub title: String,
    pub author: String,
    pub files: HashSet<String>,
    pub hunks: HashSet<u64>,
}

pub fn gather_basics(
    workspace_dir: &str,
    pr_numbers: &[i64],
    titles: &HashMap<i64, String>,
    authors: &HashMap<i64, String>,
) -> Vec<PrBasics> {
    let mut out = Vec::new();
    for &n in pr_numbers {
        let files = fetch_pr_file_set(workspace_dir, n).unwrap_or_default();
        let hunks = fetch_pr_diff_hash_set(workspace_dir, n).unwrap_or_default();
        out.push(PrBasics {
            number: n,
            title: titles.get(&n).cloned().unwrap_or_default(),
            author: authors.get(&n).cloned().unwrap_or_default(),
            files,
            hunks,
        });
    }
    out
}

pub fn score_pair(a: &PrBasics, b: &PrBasics) -> SimilarityScore {
    let file_overlap = jaccard(&a.files, &b.files);
    let title_sim = jaccard(&tokenize_title(&a.title), &tokenize_title(&b.title));
    let hunk_overlap = jaccard(&a.hunks, &b.hunks);
    let combined = 0.5 * file_overlap + 0.2 * title_sim + 0.3 * hunk_overlap;
    SimilarityScore {
        a: a.number,
        b: b.number,
        file_overlap,
        title_similarity: title_sim,
        diff_hash_overlap: hunk_overlap,
        combined,
    }
}

/// For a focal PR, find related PRs above threshold from a candidate list.
pub fn related_for(
    focal: &PrBasics,
    others: &[PrBasics],
    threshold: f32,
) -> Vec<RelatedPr> {
    let mut out = Vec::new();
    for other in others {
        if other.number == focal.number {
            continue;
        }
        let score = score_pair(focal, other);
        if score.combined >= threshold {
            out.push(RelatedPr {
                pr_number: other.number,
                title: other.title.clone(),
                author: other.author.clone(),
                score,
            });
        }
    }
    out.sort_by(|a, b| b.score.combined.partial_cmp(&a.score.combined).unwrap_or(std::cmp::Ordering::Equal));
    out
}
