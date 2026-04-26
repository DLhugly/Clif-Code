import { describe, it, expect } from "vitest";
import { buildBackendMessages } from "../agentMessages";
import type { AgentMessage } from "../../types/agent";

function um(content: string, images?: string[]): AgentMessage {
  return {
    id: `u-${content}`,
    role: "user",
    content,
    images,
    timestamp: 0,
    status: "done",
  };
}

function am(content: string): AgentMessage {
  return {
    id: `a-${content.slice(0, 4)}`,
    role: "assistant",
    content,
    timestamp: 0,
    status: "done",
  };
}

function tc(
  id: string,
  name: string,
  args: Record<string, unknown>,
  argsRaw?: string,
): AgentMessage {
  return {
    id: `tc-${id}`,
    role: "tool_call",
    content: "",
    timestamp: 0,
    toolName: name,
    toolCallId: id,
    toolCalls: [{ id, name, arguments: args, argsRaw, status: "done" }],
    status: "done",
  };
}

function tr(toolCallId: string, result: string): AgentMessage {
  return {
    id: `tr-${toolCallId}`,
    role: "tool_result",
    content: result,
    timestamp: 0,
    toolCallId,
    status: "done",
  };
}

describe("buildBackendMessages", () => {
  it("passes a plain user message through untouched", () => {
    const out = buildBackendMessages([um("hi")]);
    expect(out).toEqual([{ role: "user", content: "hi", images: undefined }]);
  });

  it("preserves vision images on user messages", () => {
    const out = buildBackendMessages([um("look", ["data:image/png;base64,AAA"])]);
    expect(out[0].images).toEqual(["data:image/png;base64,AAA"]);
  });

  it("groups assistant text + tool_calls + tool_results into one wire turn", () => {
    const out = buildBackendMessages([
      um("read foo.ts please"),
      am("on it"),
      tc("call_1", "read_file", { path: "foo.ts" }),
      tr("call_1", "file contents..."),
      am("done"),
    ]);
    expect(out).toEqual([
      { role: "user", content: "read foo.ts please", images: undefined },
      {
        role: "assistant",
        content: "on it",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "read_file", arguments: '{"path":"foo.ts"}' },
          },
        ],
      },
      { role: "tool", tool_call_id: "call_1", content: "file contents..." },
      { role: "assistant", content: "done" },
    ]);
  });

  it("batches multiple tool_calls under a single assistant message", () => {
    const out = buildBackendMessages([
      um("read both"),
      tc("c1", "read_file", { path: "a.ts" }),
      tc("c2", "read_file", { path: "b.ts" }),
      tr("c1", "A"),
      tr("c2", "B"),
    ]);
    const assistant = out.find((m) => m.role === "assistant");
    expect(assistant?.tool_calls).toHaveLength(2);
    expect(assistant?.tool_calls?.[0].id).toBe("c1");
    expect(assistant?.tool_calls?.[1].id).toBe("c2");
    const tools = out.filter((m) => m.role === "tool");
    expect(tools.map((t) => t.tool_call_id)).toEqual(["c1", "c2"]);
  });

  it("splits two consecutive assistant turns at the second text block", () => {
    const out = buildBackendMessages([
      um("go"),
      am("turn 1"),
      tc("c1", "read_file", { p: 1 }),
      tr("c1", "r1"),
      am("turn 2"),
      tc("c2", "read_file", { p: 2 }),
      tr("c2", "r2"),
    ]);
    const assistants = out.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(2);
    expect(assistants[0].content).toBe("turn 1");
    expect(assistants[0].tool_calls?.[0].id).toBe("c1");
    expect(assistants[1].content).toBe("turn 2");
    expect(assistants[1].tool_calls?.[0].id).toBe("c2");
  });

  it("prefers argsRaw over re-stringifying so the round-trip is byte-exact", () => {
    const exotic = '{"old_string":"hello\\nworld","new_string":"hi"}';
    const out = buildBackendMessages([
      um("edit"),
      tc("c1", "edit_file", { old_string: "hello\nworld", new_string: "hi" }, exotic),
      tr("c1", "ok"),
    ]);
    const assistant = out.find((m) => m.role === "assistant");
    expect(assistant?.tool_calls?.[0].function.arguments).toBe(exotic);
  });

  it("drops UI-only system rows (compaction cards, errors)", () => {
    const out = buildBackendMessages([
      um("hi"),
      {
        id: "sys-compact",
        role: "system",
        content: "",
        systemKind: "compaction",
        timestamp: 0,
        status: "done",
      } as AgentMessage,
      am("ok"),
    ]);
    expect(out.filter((m) => (m as { role: string }).role === "system")).toHaveLength(0);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("skips placeholder tool_call rows that have no real id yet", () => {
    const placeholder: AgentMessage = {
      id: "tc-placeholder",
      role: "tool_call",
      content: "",
      timestamp: 0,
      toolName: "read_file",
      toolCallId: "",
      toolCalls: [{ id: "", name: "read_file", arguments: {}, status: "pending" }],
      status: "pending",
    };
    const out = buildBackendMessages([um("hi"), placeholder]);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe("user");
  });

  it("never produces an orphan tool message when results arrive without their call", () => {
    // Defensive: if the array is malformed (tool_result with no preceding
    // tool_call) we drop the result rather than emit an orphan that the
    // OpenAI API would reject.
    const out = buildBackendMessages([um("hi"), tr("ghost", "stray result")]);
    expect(out.some((m) => m.role === "tool")).toBe(false);
  });
});
