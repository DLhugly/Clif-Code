//! Compute the target Clif-managed label set for a PR based on its decision
//! history.
//!
//! Rules (fold decisions left-to-right):
//!   1. `Classify` sets the tier label, replacing any previous tier.
//!   2. `MarkReadyToMerge` / `MarkKickedBack` are mutually exclusive.
//!   3. `MarkReviewed`, `MarkNeedsPolicy`, `MarkPolished` are flags that can
//!      coexist. Later flips win.
//!   4. Any T5 tier, or classify hard_override, forces `clif/blocked` on.
//!   5. `Clear` wipes all Clif-managed labels for that PR.

use super::schema::{tier_label, Decision, DecisionKind, LABEL_BLOCKED, LABEL_KICKED_BACK, LABEL_NEEDS_POLICY, LABEL_POLISHED, LABEL_READY_TO_MERGE, LABEL_REVIEWED};
use std::collections::BTreeSet;

#[derive(Debug, Default, Clone)]
pub struct TargetSet {
    pub labels: BTreeSet<String>,
    pub cleared: bool,
}

impl TargetSet {
    pub fn as_vec(&self) -> Vec<String> {
        self.labels.iter().cloned().collect()
    }
}

pub fn compute_target(decisions: &[Decision]) -> TargetSet {
    let mut tier: Option<String> = None;
    let mut ready = false;
    let mut kicked = false;
    let mut reviewed = false;
    let mut needs_policy = false;
    let mut polished = false;
    let mut blocked = false;
    let mut cleared_at: Option<u64> = None;

    for d in decisions {
        // If a Clear decision was recorded later than an earlier decision, we
        // honor it by resetting state on the spot.
        if let Some(at) = cleared_at {
            if d.created_at < at {
                continue;
            }
        }
        match d.kind {
            DecisionKind::Classify => {
                if let Some(t) = d.tier.as_deref() {
                    tier = Some(t.to_string());
                    if t == "T5" {
                        blocked = true;
                    } else {
                        blocked = false;
                    }
                }
            }
            DecisionKind::MarkReadyToMerge => {
                ready = true;
                kicked = false;
            }
            DecisionKind::MarkKickedBack => {
                kicked = true;
                ready = false;
            }
            DecisionKind::MarkReviewed => {
                reviewed = true;
            }
            DecisionKind::MarkNeedsPolicy => {
                needs_policy = true;
            }
            DecisionKind::MarkPolished => {
                polished = true;
                needs_policy = false;
            }
            DecisionKind::Clear => {
                tier = None;
                ready = false;
                kicked = false;
                reviewed = false;
                needs_policy = false;
                polished = false;
                blocked = false;
                cleared_at = Some(d.created_at);
            }
        }
    }

    let mut out = TargetSet {
        labels: BTreeSet::new(),
        cleared: cleared_at.is_some(),
    };
    if let Some(t) = &tier {
        if let Some(lbl) = tier_label(t) {
            out.labels.insert(lbl.to_string());
        }
    }
    if ready {
        out.labels.insert(LABEL_READY_TO_MERGE.to_string());
    }
    if kicked {
        out.labels.insert(LABEL_KICKED_BACK.to_string());
    }
    if reviewed {
        out.labels.insert(LABEL_REVIEWED.to_string());
    }
    if needs_policy {
        out.labels.insert(LABEL_NEEDS_POLICY.to_string());
    }
    if polished {
        out.labels.insert(LABEL_POLISHED.to_string());
    }
    if blocked {
        out.labels.insert(LABEL_BLOCKED.to_string());
    }
    out
}
