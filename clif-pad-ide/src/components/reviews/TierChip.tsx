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
  const sizePx = () => (props.size === "md" ? 12 : 10);
  const meta = () => (props.classification ? TIER_META[props.classification.tier] : null);
  const score = () => props.classification?.score ?? 0;

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
            "min-width": props.size === "md" ? "36px" : "28px",
            height: props.size === "md" ? "20px" : "16px",
            padding: "0 6px",
            "border-radius": "4px",
            "font-family": "monospace",
            "font-size": `calc(var(--ui-font-size) - ${props.size === "md" ? 2 : 4}px)`,
            "font-weight": "600",
            color: "var(--text-secondary, #888)",
            background: "var(--border-subtle, rgba(255,255,255,0.06))",
            opacity: props.loading ? 0.8 : 0.5,
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
          }`
        }
        style={{
          display: "inline-flex",
          "align-items": "center",
          gap: "4px",
          "min-width": props.size === "md" ? "36px" : "28px",
          height: props.size === "md" ? "20px" : "16px",
          padding: "0 6px",
          "border-radius": "4px",
          "font-family": "monospace",
          "font-size": `calc(var(--ui-font-size) - ${props.size === "md" ? 2 : 4}px)`,
          "font-weight": "700",
          color: meta()!.color,
          background: meta()!.bg,
          border: `1px solid ${meta()!.color}33`,
        }}
      >
        <span>{meta()!.short}</span>
        <Show when={props.showScore}>
          <span
            style={{
              "font-weight": "500",
              opacity: 0.75,
              "font-size": `calc(var(--ui-font-size) - ${sizePx()}px)`,
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
