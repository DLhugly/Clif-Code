import { Component, For, Show, createMemo, createSignal } from "solid-js";
import {
  TIER_META,
  type ClassificationSignal,
  type PrClassification,
  type Tier,
} from "../../types/classification";

interface Props {
  classification: PrClassification;
}

const severityColor = (s: string): string => {
  switch (s) {
    case "critical":
      return "#fca5a5";
    case "warning":
      return "#fde68a";
    default:
      return "#cbd5e1";
  }
};

/**
 * Map a signal id to a human category. Mirrors CodeRabbit-style grouping so
 * a reviewer scanning the panel sees "what kind of risk is this" at a glance
 * instead of parsing every rule name. Keep in sync with signal ids in
 * scoring.rs / scoring_dynamic.rs.
 */
type Category = "content" | "structure" | "size" | "meta" | "suppressed";

const CATEGORY_LABEL: Record<Category, string> = {
  content: "Content risk",
  structure: "Structural",
  size: "Size & scope",
  meta: "Meta",
  suppressed: "Suppressed",
};

const CATEGORY_DESC: Record<Category, string> = {
  content: "Signals from what the code actually does (auth, SQL, crypto, secrets, security-scan).",
  structure: "Signals about code shape (exports, tests, error handling, logic density).",
  size: "Rough volume of the diff. Size alone is a weak defect predictor (research r≈0.12).",
  meta: "Signals from PR metadata (deps bumped, commit messages, manifests).",
  suppressed: "Generated, renamed, or binary files we intentionally don't score.",
};

function categorize(id: string): Category {
  if (
    id === "destructive_sql" ||
    id === "schema_ddl" ||
    id === "auth_code" ||
    id === "payment_code" ||
    id === "crypto_code" ||
    id === "security_scan" ||
    id === "secrets_file" ||
    id === "ci_config" ||
    id === "infra_code" ||
    id === "migration"
  ) {
    return "content";
  }
  if (
    id === "removed_tests" ||
    id === "source_without_tests" ||
    id === "tests_only" ||
    id === "removed_error_handling" ||
    id === "new_exports" ||
    id === "removed_exports" ||
    id === "logic_density_high" ||
    id === "logic_density_med" ||
    id === "logic_density_refactor" ||
    id === "logging_removal"
  ) {
    return "structure";
  }
  if (
    id === "size_large" ||
    id === "size_very_large" ||
    id === "files_many" ||
    id === "files_very_many" ||
    id === "cross_cutting"
  ) {
    return "size";
  }
  if (id === "suppressed_files") {
    return "suppressed";
  }
  return "meta";
}

// Score thresholds mirror classifier/mod.rs `Tier::from_score`. Kept in sync
// by hand — change both if you change one. A visible legend makes the gate
// obvious so the user never has to wonder why a PR landed on a given tier.
const TIER_THRESHOLDS: { tier: Tier; range: string; description: string }[] = [
  { tier: "T1", range: "0–2", description: "trivial" },
  { tier: "T2", range: "3–9", description: "small" },
  { tier: "T3", range: "10–24", description: "standard" },
  { tier: "T4", range: "25–59", description: "significant" },
  { tier: "T5", range: "60+ or hard-override", description: "halt" },
];

const WhyTierPanel: Component<Props> = (props) => {
  const meta = () => TIER_META[props.classification.tier];
  const signals = () => [...props.classification.signals].sort((a, b) => b.points - a.points);
  const [showLegend, setShowLegend] = createSignal(false);

  const grouped = createMemo(() => {
    const groups: Record<Category, ClassificationSignal[]> = {
      content: [],
      structure: [],
      size: [],
      meta: [],
      suppressed: [],
    };
    for (const s of signals()) {
      groups[categorize(s.id)].push(s);
    }
    return groups;
  });
  const groupOrder: Category[] = ["content", "structure", "size", "meta", "suppressed"];

  return (
    <div
      style={{
        "margin-top": "8px",
        padding: "10px 12px",
        "border-radius": "6px",
        background: "var(--surface-1, rgba(255,255,255,0.03))",
        border: `1px solid ${meta().color}44`,
      }}
    >
      <div
        style={{
          display: "flex",
          "align-items": "center",
          "justify-content": "space-between",
          "margin-bottom": "6px",
        }}
      >
        <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
          <span
            style={{
              "font-size": "calc(var(--ui-font-size) - 2px)",
              "font-weight": "600",
              color: meta().color,
            }}
          >
            Why {meta().short}?
          </span>
          <span
            style={{
              "font-size": "calc(var(--ui-font-size) - 3px)",
              color: "var(--text-secondary, #888)",
            }}
          >
            {meta().label} · score {props.classification.score} · heuristic (no LLM)
            <Show when={props.classification.hard_override}>
              {" · "}
              <span style={{ color: "#fca5a5", "font-weight": "600" }}>
                HARD: {props.classification.hard_override}
              </span>
            </Show>
          </span>
        </div>
      </div>

      <div
        style={{
          "font-size": "calc(var(--ui-font-size) - 3px)",
          color: "var(--text-secondary, #888)",
          "margin-bottom": "8px",
        }}
      >
        {meta().description}
      </div>

      <div
        style={{
          "font-size": "calc(var(--ui-font-size) - 3.5px)",
          color: "var(--text-muted)",
          "margin-bottom": "8px",
          "line-height": "1.5",
        }}
      >
        Each signal below adds points. Points sum to a <b>score</b>, and the score maps to a
        tier. Any critical signal (secrets, destructive SQL, breaking change, critical security
        hit) is a <b>hard-override</b> that forces T5 regardless of score.{" "}
        <button
          style={{
            background: "transparent",
            border: "none",
            color: "var(--accent-primary)",
            cursor: "pointer",
            "font-size": "inherit",
            padding: 0,
            "text-decoration": "underline",
          }}
          onClick={() => setShowLegend((v) => !v)}
        >
          {showLegend() ? "hide score thresholds" : "show score thresholds"}
        </button>
      </div>

      <Show when={showLegend()}>
        <div
          style={{
            "margin-bottom": "8px",
            "border-radius": "4px",
            border: "1px solid var(--border-muted)",
            background: "rgba(255,255,255,0.02)",
            overflow: "hidden",
          }}
        >
          <For each={TIER_THRESHOLDS}>
            {(t) => {
              const m = TIER_META[t.tier];
              const isHere = t.tier === props.classification.tier;
              return (
                <div
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "8px",
                    padding: "4px 8px",
                    background: isHere ? m.bg : "transparent",
                    "border-left": `3px solid ${isHere ? m.color : "transparent"}`,
                    "font-size": "calc(var(--ui-font-size) - 3.5px)",
                  }}
                >
                  <span
                    style={{
                      "font-family": "monospace",
                      color: m.color,
                      "font-weight": "700",
                      "min-width": "24px",
                    }}
                  >
                    {t.tier}
                  </span>
                  <span
                    style={{
                      "font-family": "monospace",
                      color: "var(--text-secondary, #aaa)",
                      "min-width": "110px",
                    }}
                  >
                    score {t.range}
                  </span>
                  <span style={{ color: "var(--text-muted)" }}>{t.description}</span>
                  <Show when={isHere}>
                    <span
                      style={{
                        "margin-left": "auto",
                        color: m.color,
                        "font-weight": "600",
                        "font-size": "calc(var(--ui-font-size) - 4px)",
                      }}
                    >
                      this PR
                    </span>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </Show>

      <Show
        when={signals().length > 0}
        fallback={
          <div style={{ "font-size": "calc(var(--ui-font-size) - 3px)", opacity: 0.7 }}>
            No notable signals — this PR is genuinely trivial.
          </div>
        }
      >
        <div style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
          <For each={groupOrder}>
            {(cat) => {
              const items = () => grouped()[cat];
              const total = () => items().reduce((acc, s) => acc + (s.points || 0), 0);
              return (
                <Show when={items().length > 0}>
                  <div>
                    <div
                      style={{
                        display: "flex",
                        "align-items": "baseline",
                        gap: "8px",
                        "margin-bottom": "4px",
                      }}
                    >
                      <span
                        style={{
                          "font-size": "calc(var(--ui-font-size) - 3px)",
                          "font-weight": "600",
                          "text-transform": "uppercase",
                          "letter-spacing": "0.05em",
                          color: "var(--text-secondary, #bbb)",
                        }}
                      >
                        {CATEGORY_LABEL[cat]}
                      </span>
                      <Show when={total() > 0}>
                        <span
                          style={{
                            "font-family": "monospace",
                            "font-size": "calc(var(--ui-font-size) - 3.5px)",
                            color: "var(--text-muted)",
                          }}
                        >
                          +{total()} pts
                        </span>
                      </Show>
                      <span
                        style={{
                          "font-size": "calc(var(--ui-font-size) - 4px)",
                          color: "var(--text-muted)",
                          opacity: 0.85,
                        }}
                      >
                        {CATEGORY_DESC[cat]}
                      </span>
                    </div>
                    <div
                      style={{ display: "flex", "flex-direction": "column", gap: "4px" }}
                    >
                      <For each={items()}>
                        {(sig) => (
                          <div
                            style={{
                              display: "flex",
                              "align-items": "flex-start",
                              gap: "8px",
                              padding: "4px 6px",
                              "border-radius": "4px",
                              background: "rgba(255,255,255,0.02)",
                              "font-size": "calc(var(--ui-font-size) - 3px)",
                            }}
                          >
                            <span
                              style={{
                                "min-width": "40px",
                                "text-align": "right",
                                "font-family": "monospace",
                                "font-weight": "600",
                                color: severityColor(sig.severity),
                              }}
                            >
                              {sig.points > 0 ? `+${sig.points}` : "·"}
                            </span>
                            <div style={{ flex: "1", "min-width": "0" }}>
                              <div style={{ color: "var(--text, #e5e5e5)" }}>{sig.label}</div>
                              <Show when={sig.detail}>
                                <div style={{ opacity: 0.7, "margin-top": "2px" }}>
                                  {sig.detail}
                                </div>
                              </Show>
                              <Show when={sig.locator}>
                                <div
                                  style={{
                                    opacity: 0.55,
                                    "margin-top": "2px",
                                    "font-family": "monospace",
                                  }}
                                >
                                  {sig.locator}
                                </div>
                              </Show>
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default WhyTierPanel;
