import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { AgentMessage, ToolCall, AgentContext } from "../types/agent";
import { settings } from "./settingsStore";
import { projectRoot } from "./fileStore";

interface AgentTab {
  id: string;
  label: string;
  messages: AgentMessage[];
  tokens: { prompt: number; completion: number; context: number };
}

const [agentMessages, setAgentMessages] = createStore<AgentMessage[]>([]);
const [agentStreaming, setAgentStreaming] = createSignal(false);
const [agentSessionId, setAgentSessionId] = createSignal<string | null>(null);
const [agentError, setAgentError] = createSignal<string | null>(null);
const [agentTokens, setAgentTokens] = createSignal({ prompt: 0, completion: 0, context: 0 });
const [agentTabs, setAgentTabs] = createStore<AgentTab[]>([]);
const [activeAgentTab, setActiveAgentTab] = createSignal("default");

let tabCounter = 0;

let unlisteners: UnlistenFn[] = [];
let messageIdCounter = 0;

function genId(): string {
  return `msg_${Date.now()}_${++messageIdCounter}`;
}

async function initAgentListeners() {
  // Clean up any existing listeners
  for (const fn of unlisteners) fn();
  unlisteners = [];

  unlisteners.push(
    await listen<string>("agent_stream", (event) => {
      const chunk = event.payload;
      if (chunk === "[DONE]") {
        // Mark last assistant message as done
        setAgentMessages(
          produce((msgs) => {
            const last = msgs[msgs.length - 1];
            if (last && last.role === "assistant") {
              last.status = "done";
            }
          })
        );
        setAgentStreaming(false);
        return;
      }
      // Append to last assistant message or create one
      setAgentMessages(
        produce((msgs) => {
          const last = msgs[msgs.length - 1];
          if (last && last.role === "assistant" && last.status === "streaming") {
            last.content += chunk;
          } else {
            msgs.push({
              id: genId(),
              role: "assistant",
              content: chunk,
              timestamp: Date.now(),
              status: "streaming",
            });
          }
        })
      );
    })
  );

  unlisteners.push(
    await listen<{ id: string; name: string; arguments: string }>("agent_tool_call", (event) => {
      const { id, name, arguments: argsStr } = event.payload;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(argsStr);
      } catch {
        args = { raw: argsStr };
      }
      const toolCall: ToolCall = { id, name, arguments: args, status: "running" };

      setAgentMessages(
        produce((msgs) => {
          // Mark last assistant message done if streaming
          const last = msgs[msgs.length - 1];
          if (last && last.role === "assistant" && last.status === "streaming") {
            last.status = "done";
          }
          msgs.push({
            id: genId(),
            role: "tool_call",
            content: "",
            timestamp: Date.now(),
            toolName: name,
            toolCallId: id,
            toolCalls: [toolCall],
            status: "streaming",
          });
        })
      );
    })
  );

  unlisteners.push(
    await listen<{ tool_call_id: string; result: string }>("agent_tool_result", (event) => {
      const { tool_call_id, result } = event.payload;
      setAgentMessages(
        produce((msgs) => {
          // Find the tool_call message and update it
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].toolCallId === tool_call_id) {
              msgs[i].status = "done";
              if (msgs[i].toolCalls?.[0]) {
                msgs[i].toolCalls![0].status = "done";
                msgs[i].toolCalls![0].result = result;
              }
              break;
            }
          }
          // Add tool result message
          msgs.push({
            id: genId(),
            role: "tool_result",
            content: result,
            timestamp: Date.now(),
            toolCallId: tool_call_id,
            status: "done",
          });
        })
      );
    })
  );

  unlisteners.push(
    await listen<string>("agent_error", (event) => {
      setAgentError(event.payload);
      setAgentStreaming(false);
      setAgentMessages(
        produce((msgs) => {
          const last = msgs[msgs.length - 1];
          if (last && last.status === "streaming") {
            last.status = "error";
          }
          msgs.push({
            id: genId(),
            role: "system",
            content: `Error: ${event.payload}`,
            timestamp: Date.now(),
            status: "error",
          });
        })
      );
    })
  );

  unlisteners.push(
    await listen<string>("agent_session_id", (event) => {
      setAgentSessionId(event.payload);
    })
  );

  unlisteners.push(
    await listen<void>("agent_done", () => {
      setAgentStreaming(false);
      setAgentMessages(
        produce((msgs) => {
          const last = msgs[msgs.length - 1];
          if (last && last.status === "streaming") {
            last.status = "done";
          }
        })
      );
    })
  );

  unlisteners.push(
    await listen<{ prompt_tokens: number; completion_tokens: number; estimated_context: number }>("agent_usage", (event) => {
      const { prompt_tokens, completion_tokens, estimated_context } = event.payload;
      setAgentTokens((prev) => ({
        prompt: prev.prompt + prompt_tokens,
        completion: prev.completion + completion_tokens,
        context: estimated_context,
      }));
    })
  );
}

async function sendAgentMessage(content: string, context?: AgentContext) {
  if (agentStreaming()) return;

  const userMsg: AgentMessage = {
    id: genId(),
    role: "user",
    content,
    timestamp: Date.now(),
    status: "done",
  };
  setAgentMessages(produce((msgs) => msgs.push(userMsg)));
  setAgentStreaming(true);
  setAgentError(null);

  // Build messages array for backend
  const messages = [...agentMessages]
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as string, content: m.content }));

  const s = settings();
  const workspaceDir = projectRoot() || "";

  try {
    await invoke("agent_chat", {
      messages,
      model: s.aiModel,
      apiKey: null, // Will be loaded from stored keys on backend
      provider: s.aiProvider,
      workspaceDir,
      context: context ? JSON.stringify(context) : null,
    });
  } catch (e) {
    setAgentStreaming(false);
    setAgentError(String(e));
    setAgentMessages(
      produce((msgs) => {
        msgs.push({
          id: genId(),
          role: "system",
          content: `Failed to send message: ${e}`,
          timestamp: Date.now(),
          status: "error",
        });
      })
    );
  }
}

async function stopAgent() {
  const sid = agentSessionId();
  if (sid) {
    try {
      await invoke("agent_stop", { sessionId: sid });
    } catch {
      // ignore
    }
  }
  setAgentStreaming(false);
}

function clearAgentMessages() {
  setAgentMessages([]);
  setAgentError(null);
}

function saveCurrentTab() {
  const currentId = activeAgentTab();
  const msgs = [...agentMessages];
  const tokens = agentTokens();
  const idx = agentTabs.findIndex((t) => t.id === currentId);
  if (idx !== -1) {
    setAgentTabs(idx, "messages", msgs);
    setAgentTabs(idx, "tokens", { ...tokens });
  } else if (msgs.length > 0) {
    const firstUserMsg = msgs.find((m) => m.role === "user");
    const label = firstUserMsg
      ? firstUserMsg.content.slice(0, 24) + (firstUserMsg.content.length > 24 ? "..." : "")
      : `Chat ${agentTabs.length + 1}`;
    setAgentTabs(produce((tabs) => tabs.push({ id: currentId, label, messages: msgs, tokens: { ...tokens } })));
  }
}

function switchAgentTab(tabId: string) {
  if (agentStreaming()) return;
  saveCurrentTab();
  const tab = agentTabs.find((t) => t.id === tabId);
  if (tab) {
    setActiveAgentTab(tabId);
    setAgentMessages(tab.messages);
    setAgentTokens(tab.tokens);
    setAgentError(null);
  }
}

function removeAgentTab(tabId: string) {
  if (agentStreaming()) return;
  setAgentTabs(produce((tabs) => {
    const idx = tabs.findIndex((t) => t.id === tabId);
    if (idx !== -1) tabs.splice(idx, 1);
  }));
  if (activeAgentTab() === tabId) {
    const remaining = agentTabs[0];
    if (remaining) {
      switchAgentTab(remaining.id);
    } else {
      startNewSession();
    }
  }
}

function startNewSession() {
  saveCurrentTab();
  const newId = `chat-${++tabCounter}`;
  setActiveAgentTab(newId);
  setAgentMessages([]);
  setAgentError(null);
  setAgentSessionId(null);
  setAgentTokens({ prompt: 0, completion: 0, context: 0 });
}

export {
  agentMessages,
  agentStreaming,
  agentSessionId,
  agentError,
  agentTokens,
  agentTabs,
  activeAgentTab,
  initAgentListeners,
  sendAgentMessage,
  stopAgent,
  clearAgentMessages,
  startNewSession,
  switchAgentTab,
  removeAgentTab,
};
