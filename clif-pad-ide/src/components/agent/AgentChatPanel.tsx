import { Component, For, Show, createSignal, createEffect, onMount } from "solid-js";
import {
  agentMessages,
  agentStreaming,
  sendAgentMessage,
  stopAgent,
  startNewSession,
  initAgentListeners,
} from "../../stores/agentStore";
import { activeFile, projectRoot } from "../../stores/fileStore";
import { currentBranch } from "../../stores/gitStore";
import { settings, updateSettings } from "../../stores/settingsStore";
import { getApiKey, setApiKey as saveApiKey } from "../../lib/tauri";
import ChatMessage from "./ChatMessage";
import ContextChip from "./ContextChip";
import type { AgentContext } from "../../types/agent";

const SparkleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
  </svg>
);

const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const StopIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

const KeyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
  </svg>
);

const GearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

const PROVIDERS = [
  { value: "openrouter", label: "OpenRouter", hint: "openrouter.ai — access 100+ models" },
  { value: "ollama", label: "Ollama", hint: "Local models — no API key needed" },
];

const POPULAR_MODELS: Record<string, { value: string; label: string }[]> = {
  openrouter: [
    { value: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
    { value: "anthropic/claude-haiku-4", label: "Claude Haiku 4" },
    { value: "openai/gpt-4o", label: "GPT-4o" },
    { value: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "google/gemini-2.5-flash-preview", label: "Gemini 2.5 Flash" },
    { value: "deepseek/deepseek-chat-v3", label: "DeepSeek V3" },
  ],
  ollama: [
    { value: "llama3.1", label: "Llama 3.1" },
    { value: "codellama", label: "Code Llama" },
    { value: "mistral", label: "Mistral" },
    { value: "deepseek-coder-v2", label: "DeepSeek Coder V2" },
    { value: "qwen2.5-coder", label: "Qwen 2.5 Coder" },
  ],
};

const AgentChatPanel: Component = () => {
  let messagesEndRef: HTMLDivElement | undefined;
  let inputRef: HTMLTextAreaElement | undefined;
  const [inputValue, setInputValue] = createSignal("");
  const [contextFiles, setContextFiles] = createSignal<string[]>([]);
  const [initialized, setInitialized] = createSignal(false);
  const [hasApiKey, setHasApiKey] = createSignal<boolean | null>(null); // null = loading
  const [apiKeyInput, setApiKeyInput] = createSignal("");
  const [showSettings, setShowSettings] = createSignal(false);
  const [savingKey, setSavingKey] = createSignal(false);

  onMount(async () => {
    await initAgentListeners();
    setInitialized(true);
    await checkApiKey();
  });

  async function checkApiKey() {
    const provider = settings().aiProvider;
    if (provider === "ollama") {
      setHasApiKey(true); // Ollama doesn't need a key
      return;
    }
    try {
      const key = await getApiKey(provider);
      setHasApiKey(!!key);
    } catch {
      setHasApiKey(false);
    }
  }

  async function handleSaveApiKey() {
    const key = apiKeyInput().trim();
    if (!key) return;
    setSavingKey(true);
    try {
      await saveApiKey(settings().aiProvider, key);
      setHasApiKey(true);
      setApiKeyInput("");
      setShowSettings(false);
    } catch (e) {
      console.error("Failed to save API key:", e);
    } finally {
      setSavingKey(false);
    }
  }

  function handleProviderChange(provider: string) {
    updateSettings({ aiProvider: provider });
    // Set a default model for the provider
    const models = POPULAR_MODELS[provider];
    if (models && models.length > 0) {
      updateSettings({ aiModel: models[0].value });
    }
    // Re-check API key for new provider
    setTimeout(() => checkApiKey(), 100);
  }

  function handleModelChange(model: string) {
    updateSettings({ aiModel: model });
  }

  // Auto-scroll on new messages
  createEffect(() => {
    const _len = agentMessages.length;
    if (messagesEndRef) {
      messagesEndRef.scrollIntoView({ behavior: "smooth" });
    }
  });

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 150) + "px";
  }

  function buildContext(): AgentContext | undefined {
    const ctx: AgentContext = {};
    const af = activeFile();
    if (af) ctx.activeFile = af.path;
    const branch = currentBranch();
    if (branch) ctx.gitBranch = branch;
    const files = contextFiles();
    if (files.length > 0) ctx.files = files;
    return Object.keys(ctx).length > 0 ? ctx : undefined;
  }

  async function handleSend() {
    const text = inputValue().trim();
    if (!text || agentStreaming()) return;
    setInputValue("");
    if (inputRef) {
      inputRef.style.height = "auto";
    }
    const ctx = buildContext();
    setContextFiles([]);
    await sendAgentMessage(text, ctx);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function addActiveFileAsContext() {
    const af = activeFile();
    if (af && !contextFiles().includes(af.path)) {
      setContextFiles([...contextFiles(), af.path]);
    }
  }

  function removeContextFile(path: string) {
    setContextFiles(contextFiles().filter((f) => f !== path));
  }

  // Setup / API key screen
  function SetupView() {
    return (
      <div class="flex flex-col items-center justify-center h-full gap-4 px-6">
        <div
          class="rounded-full p-4"
          style={{ background: "var(--bg-hover)" }}
        >
          <KeyIcon />
        </div>
        <h3
          class="font-medium text-center"
          style={{ color: "var(--text-primary)", "font-size": "15px" }}
        >
          Connect an LLM
        </h3>
        <p
          class="text-center"
          style={{ color: "var(--text-muted)", "font-size": "12px", "line-height": "1.5" }}
        >
          The agent needs an API key to chat. Choose a provider and enter your key below.
        </p>

        {/* Provider picker */}
        <div class="w-full">
          <label style={{ "font-size": "11px", color: "var(--text-muted)", "font-weight": "500" }}>
            Provider
          </label>
          <div class="flex flex-col gap-1.5 mt-1">
            <For each={PROVIDERS}>
              {(p) => (
                <button
                  class="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left transition-colors"
                  style={{
                    background: settings().aiProvider === p.value ? "var(--bg-active)" : "var(--bg-base)",
                    border: settings().aiProvider === p.value
                      ? "1px solid var(--accent-primary)"
                      : "1px solid var(--border-default)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                  onClick={() => handleProviderChange(p.value)}
                >
                  <div class="flex flex-col">
                    <span class="font-medium" style={{ "font-size": "13px" }}>{p.label}</span>
                    <span style={{ "font-size": "11px", color: "var(--text-muted)" }}>{p.hint}</span>
                  </div>
                </button>
              )}
            </For>
          </div>
        </div>

        {/* Model picker */}
        <div class="w-full">
          <label style={{ "font-size": "11px", color: "var(--text-muted)", "font-weight": "500" }}>
            Model
          </label>
          <select
            class="w-full mt-1 rounded-lg px-3 py-2 outline-none"
            style={{
              background: "var(--bg-base)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              "font-size": "13px",
              cursor: "pointer",
            }}
            value={settings().aiModel}
            onChange={(e) => handleModelChange(e.currentTarget.value)}
          >
            <For each={POPULAR_MODELS[settings().aiProvider] || []}>
              {(m) => <option value={m.value}>{m.label}</option>}
            </For>
          </select>
        </div>

        {/* API key input (not shown for Ollama) */}
        <Show when={settings().aiProvider !== "ollama"}>
          <div class="w-full">
            <label style={{ "font-size": "11px", color: "var(--text-muted)", "font-weight": "500" }}>
              API Key
            </label>
            <input
              type="password"
              class="w-full mt-1 rounded-lg px-3 py-2 outline-none"
              style={{
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                "font-size": "13px",
              }}
              placeholder={settings().aiProvider === "openrouter" ? "sk-or-..." : "API key"}
              value={apiKeyInput()}
              onInput={(e) => setApiKeyInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveApiKey();
              }}
            />
          </div>

          <button
            class="w-full rounded-lg py-2.5 font-medium transition-colors"
            style={{
              background: apiKeyInput().trim()
                ? "var(--accent-primary)"
                : "var(--bg-hover)",
              color: apiKeyInput().trim() ? "#fff" : "var(--text-muted)",
              border: "none",
              cursor: apiKeyInput().trim() ? "pointer" : "default",
              "font-size": "13px",
            }}
            disabled={!apiKeyInput().trim() || savingKey()}
            onClick={handleSaveApiKey}
          >
            {savingKey() ? "Saving..." : "Save & Connect"}
          </button>
        </Show>

        {/* For Ollama, just a connect button */}
        <Show when={settings().aiProvider === "ollama"}>
          <p
            class="text-center"
            style={{ color: "var(--text-muted)", "font-size": "11px" }}
          >
            Make sure Ollama is running locally on port 11434.
          </p>
          <button
            class="w-full rounded-lg py-2.5 font-medium transition-colors"
            style={{
              background: "var(--accent-primary)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              "font-size": "13px",
            }}
            onClick={() => setHasApiKey(true)}
          >
            Connect to Ollama
          </button>
        </Show>
      </div>
    );
  }

  // Settings panel (shown when clicking gear in header)
  function SettingsPanel() {
    return (
      <div
        class="shrink-0 px-3 py-3 flex flex-col gap-3"
        style={{ "border-bottom": "1px solid var(--border-default)" }}
      >
        {/* Provider */}
        <div>
          <label style={{ "font-size": "11px", color: "var(--text-muted)", "font-weight": "500" }}>
            Provider
          </label>
          <div class="flex gap-1.5 mt-1">
            <For each={PROVIDERS}>
              {(p) => (
                <button
                  class="flex-1 rounded-md px-2 py-1.5 text-center transition-colors"
                  style={{
                    background: settings().aiProvider === p.value ? "var(--bg-active)" : "var(--bg-base)",
                    border: settings().aiProvider === p.value
                      ? "1px solid var(--accent-primary)"
                      : "1px solid var(--border-muted)",
                    color: settings().aiProvider === p.value ? "var(--text-primary)" : "var(--text-secondary)",
                    cursor: "pointer",
                    "font-size": "12px",
                  }}
                  onClick={() => handleProviderChange(p.value)}
                >
                  {p.label}
                </button>
              )}
            </For>
          </div>
        </div>

        {/* Model */}
        <div>
          <label style={{ "font-size": "11px", color: "var(--text-muted)", "font-weight": "500" }}>
            Model
          </label>
          <select
            class="w-full mt-1 rounded-md px-2 py-1.5 outline-none"
            style={{
              background: "var(--bg-base)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-muted)",
              "font-size": "12px",
              cursor: "pointer",
            }}
            value={settings().aiModel}
            onChange={(e) => handleModelChange(e.currentTarget.value)}
          >
            <For each={POPULAR_MODELS[settings().aiProvider] || []}>
              {(m) => <option value={m.value}>{m.label}</option>}
            </For>
          </select>
        </div>

        {/* API Key */}
        <Show when={settings().aiProvider !== "ollama"}>
          <div>
            <label style={{ "font-size": "11px", color: "var(--text-muted)", "font-weight": "500" }}>
              API Key
            </label>
            <div class="flex gap-1.5 mt-1">
              <input
                type="password"
                class="flex-1 rounded-md px-2 py-1.5 outline-none"
                style={{
                  background: "var(--bg-base)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-muted)",
                  "font-size": "12px",
                }}
                placeholder="Update API key..."
                value={apiKeyInput()}
                onInput={(e) => setApiKeyInput(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveApiKey();
                }}
              />
              <button
                class="rounded-md px-3 py-1.5 transition-colors"
                style={{
                  background: apiKeyInput().trim() ? "var(--accent-primary)" : "var(--bg-hover)",
                  color: apiKeyInput().trim() ? "#fff" : "var(--text-muted)",
                  border: "none",
                  cursor: apiKeyInput().trim() ? "pointer" : "default",
                  "font-size": "12px",
                }}
                disabled={!apiKeyInput().trim()}
                onClick={handleSaveApiKey}
              >
                Save
              </button>
            </div>
            <Show when={hasApiKey()}>
              <span style={{ "font-size": "10px", color: "var(--accent-green)" }}>
                Key configured
              </span>
            </Show>
          </div>
        </Show>
      </div>
    );
  }

  return (
    <div
      class="flex flex-col h-full overflow-hidden"
      style={{
        background: "var(--bg-surface)",
        "font-size": "var(--ui-font-size)",
      }}
    >
      {/* Header row 1: title + new session */}
      <div
        class="flex items-center justify-between shrink-0 px-3"
        style={{
          "border-bottom": "1px solid var(--border-muted)",
          height: "36px",
        }}
      >
        <div class="flex items-center gap-2">
          <SparkleIcon />
          <span class="font-medium" style={{ color: "var(--text-primary)", "font-size": "13px" }}>
            Agent
          </span>
        </div>
        <button
          class="flex items-center justify-center rounded p-1 transition-colors"
          style={{
            color: "var(--text-muted)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
            (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
          onClick={startNewSession}
          title="New session"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* Header row 2: provider + model selectors (always visible) */}
      <div
        class="flex items-center gap-1.5 shrink-0 px-2 py-1.5"
        style={{ "border-bottom": "1px solid var(--border-default)" }}
      >
        {/* Provider toggle */}
        <div class="flex rounded-md overflow-hidden" style={{ border: "1px solid var(--border-muted)" }}>
          <For each={PROVIDERS}>
            {(p) => (
              <button
                class="px-2 py-1 transition-colors"
                style={{
                  background: settings().aiProvider === p.value ? "var(--accent-primary)" : "var(--bg-base)",
                  color: settings().aiProvider === p.value ? "#fff" : "var(--text-muted)",
                  border: "none",
                  cursor: "pointer",
                  "font-size": "11px",
                  "font-weight": "500",
                }}
                onClick={() => handleProviderChange(p.value)}
                title={p.hint}
              >
                {p.label}
              </button>
            )}
          </For>
        </div>

        {/* Model dropdown */}
        <select
          class="flex-1 min-w-0 rounded-md px-1.5 py-1 outline-none truncate"
          style={{
            background: "var(--bg-base)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-muted)",
            "font-size": "11px",
            cursor: "pointer",
            "font-family": "var(--font-mono, monospace)",
          }}
          value={settings().aiModel}
          onChange={(e) => handleModelChange(e.currentTarget.value)}
        >
          <For each={POPULAR_MODELS[settings().aiProvider] || []}>
            {(m) => <option value={m.value}>{m.label}</option>}
          </For>
        </select>

        {/* API key indicator / button */}
        <Show when={settings().aiProvider !== "ollama"}>
          <button
            class="flex items-center justify-center shrink-0 rounded-md p-1 transition-colors"
            style={{
              background: showSettings() ? "var(--bg-hover)" : "transparent",
              color: hasApiKey() ? "var(--accent-green)" : "var(--accent-yellow)",
              border: "none",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
            }}
            onMouseLeave={(e) => {
              if (!showSettings()) (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
            onClick={() => setShowSettings(!showSettings())}
            title={hasApiKey() ? "API key configured — click to change" : "Set API key"}
          >
            <KeyIcon />
          </button>
        </Show>
      </div>

      {/* API key input (toggled by key icon) */}
      <Show when={showSettings() && settings().aiProvider !== "ollama"}>
        <div
          class="flex items-center gap-1.5 shrink-0 px-2 py-1.5"
          style={{ "border-bottom": "1px solid var(--border-default)" }}
        >
          <input
            type="password"
            class="flex-1 min-w-0 rounded-md px-2 py-1 outline-none"
            style={{
              background: "var(--bg-base)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-muted)",
              "font-size": "11px",
            }}
            placeholder={settings().aiProvider === "openrouter" ? "sk-or-..." : "API key"}
            value={apiKeyInput()}
            onInput={(e) => setApiKeyInput(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveApiKey();
              if (e.key === "Escape") setShowSettings(false);
            }}
            ref={(el) => setTimeout(() => el.focus(), 50)}
          />
          <button
            class="shrink-0 rounded-md px-2.5 py-1 transition-colors"
            style={{
              background: apiKeyInput().trim() ? "var(--accent-primary)" : "var(--bg-hover)",
              color: apiKeyInput().trim() ? "#fff" : "var(--text-muted)",
              border: "none",
              cursor: apiKeyInput().trim() ? "pointer" : "default",
              "font-size": "11px",
              "font-weight": "500",
            }}
            disabled={!apiKeyInput().trim()}
            onClick={handleSaveApiKey}
          >
            {savingKey() ? "..." : "Save"}
          </button>
        </div>
      </Show>

      {/* Messages */}
      <div class="flex-1 min-h-0 overflow-y-auto py-2">
        <Show
          when={agentMessages.length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center h-full gap-3 px-6">
              <div
                class="rounded-full p-3"
                style={{ background: "var(--bg-hover)" }}
              >
                <SparkleIcon />
              </div>
              <Show
                when={hasApiKey() || settings().aiProvider === "ollama"}
                fallback={
                  <>
                    <p
                      class="text-center"
                      style={{ color: "var(--text-primary)", "font-size": "14px", "font-weight": "500" }}
                    >
                      Set your API key to get started
                    </p>
                    <p
                      class="text-center"
                      style={{ color: "var(--text-muted)", "font-size": "12px", "line-height": "1.5" }}
                    >
                      Pick a provider above, then click the
                      <span style={{ color: "var(--accent-yellow)" }}> key icon </span>
                      to enter your API key.
                    </p>
                    <Show when={settings().aiProvider === "openrouter"}>
                      <p
                        class="text-center"
                        style={{ color: "var(--text-muted)", "font-size": "11px" }}
                      >
                        Get a key at openrouter.ai
                      </p>
                    </Show>
                  </>
                }
              >
                <p
                  class="text-center"
                  style={{ color: "var(--text-muted)", "font-size": "13px" }}
                >
                  Ask the agent to help with your code. It can read files, search, edit, and run commands.
                </p>
                <Show when={!projectRoot()}>
                  <p
                    class="text-center"
                    style={{
                      color: "var(--accent-yellow)",
                      "font-size": "12px",
                    }}
                  >
                    Open a project folder to enable file tools.
                  </p>
                </Show>
              </Show>
            </div>
          }
        >
          <For each={agentMessages}>
            {(msg) => <ChatMessage message={msg} />}
          </For>
          <div ref={messagesEndRef} />
        </Show>
      </div>

      {/* Context chips */}
      <Show when={contextFiles().length > 0}>
        <div
          class="flex flex-wrap gap-1 px-3 py-1.5 shrink-0"
          style={{ "border-top": "1px solid var(--border-muted)" }}
        >
          <For each={contextFiles()}>
            {(path) => (
              <ContextChip
                label={path.split("/").pop() || path}
                type="file"
                onRemove={() => removeContextFile(path)}
              />
            )}
          </For>
        </div>
      </Show>

      {/* Input area */}
      <div
        class="shrink-0 px-3 py-2"
        style={{ "border-top": "1px solid var(--border-default)" }}
      >
        <div
          class="flex items-end gap-2 rounded-xl px-3 py-2"
          style={{
            background: "var(--bg-base)",
            border: "1px solid var(--border-default)",
          }}
        >
          {/* Attach file button */}
          <button
            class="flex items-center justify-center shrink-0 rounded p-1 mb-0.5"
            style={{
              color: "var(--text-muted)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "var(--accent-primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
            }}
            onClick={addActiveFileAsContext}
            title="Attach current file as context"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>

          <textarea
            ref={inputRef}
            class="flex-1 resize-none outline-none"
            style={{
              background: "transparent",
              color: "var(--text-primary)",
              border: "none",
              "font-size": "13px",
              "line-height": "1.4",
              "min-height": "20px",
              "max-height": "150px",
              "font-family": "inherit",
            }}
            placeholder={agentStreaming() ? "Agent is thinking..." : "Ask the agent..."}
            rows={1}
            value={inputValue()}
            onInput={(e) => {
              setInputValue(e.currentTarget.value);
              autoResize(e.currentTarget);
            }}
            onKeyDown={handleKeyDown}
            disabled={agentStreaming()}
          />

          {/* Send / Stop button */}
          <Show
            when={!agentStreaming()}
            fallback={
              <button
                class="flex items-center justify-center shrink-0 rounded-lg p-1.5 mb-0.5 transition-colors"
                style={{
                  background: "var(--accent-red)",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                }}
                onClick={stopAgent}
                title="Stop"
              >
                <StopIcon />
              </button>
            }
          >
            <button
              class="flex items-center justify-center shrink-0 rounded-lg p-1.5 mb-0.5 transition-colors"
              style={{
                background: inputValue().trim()
                  ? "var(--accent-primary)"
                  : "var(--bg-hover)",
                color: inputValue().trim() ? "#fff" : "var(--text-muted)",
                border: "none",
                cursor: inputValue().trim() ? "pointer" : "default",
              }}
              onClick={handleSend}
              disabled={!inputValue().trim()}
              title="Send message"
            >
              <SendIcon />
            </button>
          </Show>
        </div>
        <div
          class="flex items-center justify-between mt-1 px-1"
          style={{ "font-size": "10px", color: "var(--text-muted)" }}
        >
          <span>Enter to send, Shift+Enter for newline</span>
        </div>
      </div>

      {/* Markdown styles scoped to agent panel */}
      <style>{`
        .agent-markdown p { margin: 0.4em 0; }
        .agent-markdown p:first-child { margin-top: 0; }
        .agent-markdown p:last-child { margin-bottom: 0; }
        .agent-markdown code {
          font-family: var(--font-mono, monospace);
          font-size: 0.85em;
          padding: 0.15em 0.35em;
          border-radius: 4px;
          background: var(--bg-hover);
        }
        .agent-markdown pre {
          margin: 0.5em 0;
          padding: 0.6em;
          border-radius: 6px;
          overflow-x: auto;
          background: var(--bg-base);
          border: 1px solid var(--border-muted);
        }
        .agent-markdown pre code {
          padding: 0;
          background: none;
          font-size: 0.8em;
        }
        .agent-markdown ul, .agent-markdown ol {
          margin: 0.4em 0;
          padding-left: 1.5em;
        }
        .agent-markdown li { margin: 0.15em 0; }
        .agent-markdown blockquote {
          margin: 0.5em 0;
          padding: 0.3em 0.8em;
          border-left: 3px solid var(--accent-primary);
          color: var(--text-secondary);
        }
        .agent-markdown h1, .agent-markdown h2, .agent-markdown h3 {
          margin: 0.5em 0 0.3em;
          font-weight: 600;
        }
        .agent-markdown h1 { font-size: 1.2em; }
        .agent-markdown h2 { font-size: 1.1em; }
        .agent-markdown h3 { font-size: 1em; }
      `}</style>
    </div>
  );
};

export default AgentChatPanel;
