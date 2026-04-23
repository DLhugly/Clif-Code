import { Component, For, Show, createMemo } from "solid-js";
import { policyResults, runPolicyCheck } from "../../stores/reviewsStore";

const PolicyTab: Component<{ prNumber: number }> = (props) => {
  const results = createMemo(() => policyResults[props.prNumber] ?? []);

  return (
    <div class="flex flex-col">
      <div
        class="flex items-center justify-between px-3 py-2"
        style={{ "border-bottom": "1px solid var(--border-muted)" }}
      >
        <span style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 3px)" }}>
          {results().length} polic{results().length === 1 ? "y" : "ies"} evaluated
        </span>
        <button
          class="px-2 py-1 rounded"
          style={{
            background: "var(--bg-base)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-default)",
            cursor: "pointer",
            "font-size": "calc(var(--ui-font-size) - 3px)",
          }}
          onClick={() => runPolicyCheck(props.prNumber)}
        >
          Re-check
        </button>
      </div>

      <Show when={results().length === 0}>
        <div class="p-4" style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 2px)" }}>
          No policies evaluated yet. Click <strong>Re-check</strong> to run them now.
        </div>
      </Show>

      <For each={results()}>
        {(r) => (
          <div
            class="px-3 py-2"
            style={{ "border-bottom": "1px solid var(--border-muted)" }}
          >
            <div class="flex items-center gap-2" style={{ "font-size": "calc(var(--ui-font-size) - 2px)" }}>
              <span
                class="px-1.5 rounded shrink-0"
                style={{
                  background: r.passed
                    ? "color-mix(in srgb, var(--accent-green) 15%, transparent)"
                    : "color-mix(in srgb, var(--accent-red) 15%, transparent)",
                  color: r.passed ? "var(--accent-green)" : "var(--accent-red)",
                  "font-weight": "500",
                  "font-size": "calc(var(--ui-font-size) - 3px)",
                }}
              >
                {r.passed ? "pass" : "fail"}
              </span>
              <span style={{ "font-weight": "500", color: "var(--text-primary)" }}>{r.policy_id}</span>
              <Show when={r.required}>
                <span
                  class="px-1 rounded"
                  style={{
                    background: "var(--bg-hover)",
                    color: "var(--text-muted)",
                    "font-size": "calc(var(--ui-font-size) - 3.5px)",
                  }}
                >
                  required
                </span>
              </Show>
              <Show when={r.auto_post}>
                <span
                  class="px-1 rounded"
                  style={{
                    background: "color-mix(in srgb, var(--accent-yellow) 15%, transparent)",
                    color: "var(--accent-yellow)",
                    "font-size": "calc(var(--ui-font-size) - 3.5px)",
                  }}
                >
                  auto-post
                </span>
              </Show>
            </div>
            <Show when={!r.passed && r.reason}>
              <div style={{ color: "var(--text-secondary)", "font-size": "calc(var(--ui-font-size) - 3px)", "margin-top": "4px" }}>
                {r.reason}
              </div>
            </Show>
          </div>
        )}
      </For>
    </div>
  );
};

export default PolicyTab;
