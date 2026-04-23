import { Component, For, Show, createSignal } from "solid-js";
import { TIER_META, type PrClassification, type Tier } from "../../types/classification";

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

      <Show when={signals().length > 0} fallback={
        <div style={{ "font-size": "calc(var(--ui-font-size) - 3px)", opacity: 0.7 }}>
          No notable signals — this PR is genuinely trivial.
        </div>
      }>
        <div style={{ display: "flex", "flex-direction": "column", gap: "4px" }}>
          <For each={signals()}>
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
                  +{sig.points}
                </span>
                <div style={{ flex: "1", "min-width": "0" }}>
                  <div style={{ color: "var(--text, #e5e5e5)" }}>{sig.label}</div>
                  <Show when={sig.detail}>
                    <div style={{ opacity: 0.7, "margin-top": "2px" }}>{sig.detail}</div>
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
      </Show>
    </div>
  );
};

export default WhyTierPanel;
