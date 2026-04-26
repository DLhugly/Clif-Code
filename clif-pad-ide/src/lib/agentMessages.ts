import type { AgentMessage } from "../types/agent";

/**
 * Wire-format message sent to the Tauri `agent_chat` command. Mirrors the
 * Rust `super::ai::ChatMessage` struct, which itself mirrors the OpenAI
 * Chat Completions message schema. The backend forwards these straight
 * to OpenAI / OpenRouter / Ollama so the field names must match exactly.
 */
export type BackendMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
  images?: string[];
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

/**
 * Rebuild the OpenAI-format message list from the IDE's flat AgentMessage
 * stream. The frontend stores tool calls and tool results as separate rows
 * for rendering, but the API requires them grouped under the assistant turn
 * that emitted them:
 *
 *   user
 *   assistant { content?, tool_calls: [tc1, tc2] }
 *   tool      { tool_call_id: tc1.id, content: result1 }
 *   tool      { tool_call_id: tc2.id, content: result2 }
 *   assistant { content: "follow-up text" }
 *
 * Algorithm: walk the array, accumulate the current assistant turn's text
 * and tool calls + their results, flush as a contiguous block whenever we
 * hit a turn boundary (user message, or another assistant text once tool
 * calls already buffered).
 *
 * System rows (compaction cards, error pills, raw `role: "system"` notices)
 * are intentionally dropped — they are UI bookkeeping, not part of the
 * conversation seen by the model.
 */
export function buildBackendMessages(messages: AgentMessage[]): BackendMessage[] {
  const out: BackendMessage[] = [];
  let pendingText = "";
  let pendingCalls: Array<{ id: string; name: string; argsJson: string }> = [];
  let pendingResults: Array<{ id: string; content: string }> = [];

  function flushAssistantTurn() {
    if (pendingCalls.length === 0 && pendingText.length === 0) return;
    if (pendingCalls.length > 0) {
      out.push({
        role: "assistant",
        content: pendingText,
        tool_calls: pendingCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: c.argsJson },
        })),
      });
      for (const r of pendingResults) {
        out.push({ role: "tool", tool_call_id: r.id, content: r.content });
      }
    } else {
      out.push({ role: "assistant", content: pendingText });
    }
    pendingText = "";
    pendingCalls = [];
    pendingResults = [];
  }

  for (const m of messages) {
    if (m.role === "user") {
      flushAssistantTurn();
      out.push({
        role: "user",
        content: m.content,
        images: m.images,
      });
      continue;
    }

    if (m.role === "assistant") {
      // A new assistant text after we've already buffered tool calls is the
      // start of a fresh turn — flush the previous one first.
      if (pendingCalls.length > 0) flushAssistantTurn();
      pendingText += m.content || "";
      continue;
    }

    if (m.role === "tool_call") {
      const tc = m.toolCalls?.[0];
      // Skip placeholder rows (no real id yet — the backend only emitted
      // `agent_tool_start` and the call hasn't streamed its id/args).
      if (!tc || !tc.id || !tc.name) continue;
      // Prefer the raw argument string captured straight from the model
      // so we round-trip byte-exact; fall back to a fresh stringify only
      // for legacy entries that pre-date `argsRaw` being on ToolCall.
      const argsJson =
        typeof tc.argsRaw === "string"
          ? tc.argsRaw
          : JSON.stringify(tc.arguments ?? {});
      pendingCalls.push({
        id: tc.id,
        name: tc.name,
        argsJson,
      });
      continue;
    }

    if (m.role === "tool_result") {
      if (!m.toolCallId) continue;
      pendingResults.push({ id: m.toolCallId, content: m.content || "" });
      continue;
    }

    // Anything else (system / compaction cards / errors) is UI-only, skip.
  }

  flushAssistantTurn();
  return out;
}
