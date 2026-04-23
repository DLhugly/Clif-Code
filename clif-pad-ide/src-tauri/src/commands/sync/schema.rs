//! Types shared across the sync module.
//!
//! Clif is local-first: every lead decision is captured here immediately and
//! only pushed to GitHub when the lead explicitly syncs. The canonical label
//! set below is the *only* namespace Clif owns on remote; all other labels on
//! a PR are preserved.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DecisionKind {
    /// Auto-recorded when the classifier produces a tier.
    Classify,
    /// Lead says "this PR is next to merge".
    MarkReadyToMerge,
    /// Lead kicked PR back to the author.
    MarkKickedBack,
    /// Lead finished a review pass (findings posted or none).
    MarkReviewed,
    /// Lead wants the PR marked as needing policy work.
    MarkNeedsPolicy,
    /// Polish pipeline applied successfully.
    MarkPolished,
    /// Remove all Clif-managed state from a PR.
    Clear,
}

impl DecisionKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Classify => "classify",
            Self::MarkReadyToMerge => "mark_ready_to_merge",
            Self::MarkKickedBack => "mark_kicked_back",
            Self::MarkReviewed => "mark_reviewed",
            Self::MarkNeedsPolicy => "mark_needs_policy",
            Self::MarkPolished => "mark_polished",
            Self::Clear => "clear",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Decision {
    pub id: String,
    pub pr_number: i64,
    pub kind: DecisionKind,
    pub created_at: u64,
    #[serde(default)]
    pub tier: Option<String>, // "T1".."T5" for classify decisions
    #[serde(default)]
    pub note: Option<String>,
    /// Sync bookkeeping (updated in-place when apply succeeds).
    #[serde(default)]
    pub synced_at: Option<u64>,
    #[serde(default)]
    pub sync_error: Option<String>,
}

/// Planned change for one PR: labels to add, labels to remove.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncPlan {
    pub pr_number: i64,
    pub current_labels: Vec<String>,
    pub target_labels: Vec<String>, // full target set for Clif-managed namespace
    pub add: Vec<String>,
    pub remove: Vec<String>,
    #[serde(default)]
    pub skipped_reason: Option<String>,
}

impl SyncPlan {
    pub fn is_noop(&self) -> bool {
        self.add.is_empty() && self.remove.is_empty()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub pr_number: i64,
    pub applied_add: Vec<String>,
    pub applied_remove: Vec<String>,
    pub ok: bool,
    #[serde(default)]
    pub error: Option<String>,
}

/// Per-PR sync status for the UI row dot.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PrSyncState {
    /// No local decisions and no managed labels on remote.
    Untouched,
    /// Local state matches remote.
    InSync,
    /// Local has changes not yet pushed.
    Pending,
    /// Remote has Clif-managed labels we don't know about (manually edited).
    Diverged,
}

// -------- Canonical label set ------------------------------------------------

/// Prefix owned by Clif. We only add/remove labels starting with this prefix.
pub const LABEL_PREFIX: &str = "clif/";

/// Tier labels are mutually exclusive.
pub const TIER_LABELS: &[(&str, &str)] = &[
    ("T1", "clif/tier-t1"),
    ("T2", "clif/tier-t2"),
    ("T3", "clif/tier-t3"),
    ("T4", "clif/tier-t4"),
    ("T5", "clif/tier-t5"),
];

pub const LABEL_READY_TO_MERGE: &str = "clif/ready-to-merge";
pub const LABEL_KICKED_BACK: &str = "clif/kicked-back";
pub const LABEL_REVIEWED: &str = "clif/reviewed";
pub const LABEL_NEEDS_POLICY: &str = "clif/needs-policy";
pub const LABEL_POLISHED: &str = "clif/polished";
pub const LABEL_BLOCKED: &str = "clif/blocked";

/// Every label in the Clif namespace. Used when diffing current vs target:
/// any label matching one of these that is NOT in the target set must be
/// removed.
pub const ALL_MANAGED_LABELS: &[&str] = &[
    "clif/tier-t1",
    "clif/tier-t2",
    "clif/tier-t3",
    "clif/tier-t4",
    "clif/tier-t5",
    LABEL_READY_TO_MERGE,
    LABEL_KICKED_BACK,
    LABEL_REVIEWED,
    LABEL_NEEDS_POLICY,
    LABEL_POLISHED,
    LABEL_BLOCKED,
];

pub fn tier_label(tier: &str) -> Option<&'static str> {
    TIER_LABELS
        .iter()
        .find(|(t, _)| *t == tier)
        .map(|(_, lbl)| *lbl)
}

pub fn is_managed_label(label: &str) -> bool {
    label.starts_with(LABEL_PREFIX)
}
