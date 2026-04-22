import { Component, For, Show, createResource } from "solid-js";
import { fetchPrDiff } from "../../stores/reviewsStore";
import { projectRoot } from "../../stores/fileStore";

interface DiffLine {
  kind: "context" | "add" | "del" | "hunk" | "file";
  text: string;
}

function parseDiff(raw: string): { file: string; lines: DiffLine[] }[] {
  const files: { file: string; lines: DiffLine[] }[] = [];
  let current: { file: string; lines: DiffLine[] } | null = null;
  for (const line of raw.split("\n")) {
    if (line.startsWith("diff --git ")) {
      if (current) files.push(current);
      const m = line.match(/diff --git a\/(.+?) b\/(.+)/);
      current = { file: m ? m[2] : line, lines: [{ kind: "file", text: line }] };
    } else if (!current) {
      continue;
    } else if (line.startsWith("@@")) {
      current.lines.push({ kind: "hunk", text: line });
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      current.lines.push({ kind: "add", text: line });
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      current.lines.push({ kind: "del", text: line });
    } else if (!line.startsWith("---") && !line.startsWith("+++") && !line.startsWith("index ")) {
      current.lines.push({ kind: "context", text: line });
    }
  }
  if (current) files.push(current);
  return files;
}

function lineColor(kind: DiffLine["kind"]): string {
  switch (kind) {
    case "add": return "var(--accent-green)";
    case "del": return "var(--accent-red)";
    case "hunk": return "var(--accent-blue)";
    case "file": return "var(--text-primary)";
    default: return "var(--text-secondary)";
  }
}

function lineBg(kind: DiffLine["kind"]): string {
  switch (kind) {
    case "add": return "color-mix(in srgb, var(--accent-green) 8%, transparent)";
    case "del": return "color-mix(in srgb, var(--accent-red) 8%, transparent)";
    case "hunk": return "var(--bg-hover)";
    case "file": return "var(--bg-surface)";
    default: return "transparent";
  }
}

const PrDiffView: Component<{ prNumber: number }> = (props) => {
  const [diff] = createResource(
    () => ({ root: projectRoot(), n: props.prNumber }),
    async ({ root, n }) => {
      if (!root) return "";
      try {
        return await fetchPrDiff(root, n);
      } catch (e) {
        return `Error fetching diff: ${e}`;
      }
    },
  );

  return (
    <div class="flex flex-col">
      <Show when={diff.loading}>
        <div class="flex items-center gap-2 p-4" style={{ color: "var(--text-muted)", "font-size": "12px" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="animate-spin">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span>Loading diff...</span>
        </div>
      </Show>
      <Show when={!diff.loading && diff()}>
        <Show when={(diff() || "").startsWith("Error")}>
          <div class="p-4" style={{ color: "var(--accent-red)", "font-size": "12px" }}>{diff()}</div>
        </Show>
        <Show when={!(diff() || "").startsWith("Error")}>
          <For each={parseDiff(diff() ?? "")}>
            {(file) => (
              <div style={{ "border-bottom": "1px solid var(--border-muted)" }}>
                <div
                  class="px-3 py-1.5 sticky"
                  style={{
                    top: "0",
                    background: "var(--bg-surface)",
                    "font-family": "var(--font-mono, monospace)",
                    "font-size": "11.5px",
                    color: "var(--text-primary)",
                    "z-index": "1",
                    "border-bottom": "1px solid var(--border-default)",
                  }}
                >
                  {file.file}
                </div>
                <div style={{ "font-family": "var(--font-mono, monospace)", "font-size": "11px", "line-height": "1.4" }}>
                  <For each={file.lines.slice(1)}>
                    {(ln) => (
                      <div
                        class="px-3"
                        style={{
                          color: lineColor(ln.kind),
                          background: lineBg(ln.kind),
                          "white-space": "pre",
                          "overflow-x": "auto",
                        }}
                      >
                        {ln.text || " "}
                      </div>
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>
        </Show>
      </Show>
    </div>
  );
};

export default PrDiffView;
