import { Component, Show } from "solid-js";
import { TIER_META, type PrClassification } from "../../types/classification";

interface Props {
  classification: PrClassification | null | undefined;
  loading?: boolean;
  size?: "sm" | "md";
  showScore?: boolean;
  title?: string;
}

const TierChip: Component<Props> = (props) => {
  const meta = () => (props.classification ? TIER_META[props.classification.tier] : null);
  const score = () => props.classification?.score ?? 0;
  const isMd = () => props.size === "md";

  return (
    <Show
      when={props.classification}
      fallback={
        <div
          title={props.loading ? "Classifying…" : "Not classified yet"}
          style={{
            display: "inline-flex",
            "align-items": "center",
            "justify-content": "center",
            "min-width": isMd() ? "34px" : "28px",
            height: isMd() ? "20px" : "18px",
            padding: "0 4px",
            "border-radius": "4px",
            "font-family": "monospace",
            "font-size": `calc(var(--ui-font-size) - ${isMd() ? 2 : 3.5}px)`,
            "font-weight": "600",
            color: "var(--text-muted)",
            background: "var(--bg-base, rgba(255,255,255,0.04))",
            border: "1px dashed var(--border-default, rgba(255,255,255,0.14))",
            opacity: props.loading ? 1 : 0.7,
          }}
        >
          {props.loading ? "…" : "T?"}
        </div>
      }
    >
      <div
        title={
          props.title ??
          `${meta()!.short} · ${meta()!.label} · score ${score()}${
            props.classification!.hard_override ? ` · HARD: ${props.classification!.hard_override}` : ""
          } · local heuristic scan (no LLM)`
        }
        style={{
          display: "inline-flex",
          "align-items": "center",
          "justify-content": "center",
          gap: "4px",
          "min-width": isMd() ? "34px" : "28px",
          height: isMd() ? "20px" : "18px",
          padding: "0 6px",
          "border-radius": "4px",
          "font-family": "monospace",
          "font-size": `calc(var(--ui-font-size) - ${isMd() ? 2 : 3.5}px)`,
          "font-weight": "700",
          color: meta()!.color,
          background: meta()!.bg,
          border: `1px solid color-mix(in srgb, ${meta()!.color} 55%, transparent)`,
          "letter-spacing": "0.02em",
        }}
      >
        <span>{meta()!.short}</span>
        <Show when={props.showScore}>
          <span
            style={{
              "font-weight": "500",
              opacity: 0.75,
              "font-size": `calc(var(--ui-font-size) - ${isMd() ? 3 : 4.5}px)`,
            }}
          >
            {score()}
          </span>
        </Show>
      </div>
    </Show>
  );
};

export default TierChip;
