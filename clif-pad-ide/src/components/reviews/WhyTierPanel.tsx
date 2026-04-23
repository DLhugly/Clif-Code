import { Component, For, Show } from "solid-js";
import { TIER_META, type PrClassification } from "../../types/classification";

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

const WhyTierPanel: Component<Props> = (props) => {
  const meta = () => TIER_META[props.classification.tier];
  const signals = () => [...props.classification.signals].sort((a, b) => b.points - a.points);

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
            {meta().label} · score {props.classification.score}
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
