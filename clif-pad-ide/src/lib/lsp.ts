/**
 * LSP Client for ClifPad
 *
 * Bridges Monaco Editor ↔ Rust LSP backend via Tauri IPC.
 * The Rust backend spawns language servers (rust-analyzer, typescript-language-server, etc.)
 * and proxies JSON-RPC messages back via Tauri events.
 *
 * Usage:
 *   const client = new LspClient("typescript", "/path/to/workspace");
 *   await client.start(editor);
 *   // ... Monaco now has full LSP features
 *   client.stop();
 */

import * as monaco from "monaco-editor";
import { invoke } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";

// ─── Language → Monaco Language ID mapping ────────────────────────────────────

const EXT_TO_LANGUAGE: Record<string, string> = {
  ts: "typescript",
  tsx: "typescriptreact",
  js: "javascript",
  jsx: "javascriptreact",
  rs: "rust",
  py: "python",
  go: "go",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  json: "json",
};

export function languageForFile(filePath: string): string | null {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_LANGUAGE[ext] ?? null;
}

// ─── LSP Server availability check ───────────────────────────────────────────

export async function checkAvailableServers(): Promise<Record<string, boolean>> {
  try {
    return await invoke<Record<string, boolean>>("lsp_check_servers");
  } catch {
    return {};
  }
}

// ─── JSON-RPC helpers ─────────────────────────────────────────────────────────

let _msgId = 100;
function nextId() {
  return ++_msgId;
}

// ─── LspClient class ──────────────────────────────────────────────────────────

export class LspClient {
  private language: string;
  private workspaceRoot: string;
  private editor: monaco.editor.IStandaloneCodeEditor | null = null;
  private disposables: monaco.IDisposable[] = [];
  private eventUnlisten: (() => void) | null = null;
  private pendingRequests = new Map<number, (result: any) => void>();
  private initialized = false;
  private diagnosticsCollection: monaco.editor.IMarkerData[] = [];

  constructor(language: string, workspaceRoot: string) {
    this.language = language;
    this.workspaceRoot = workspaceRoot;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  async start(editor: monaco.editor.IStandaloneCodeEditor): Promise<void> {
    this.editor = editor;

    // Listen for messages from the Rust backend
    const eventName = `lsp-message-${this.language}`;
    const unlisten = await tauriListen<string>(eventName, (event) => {
      this.handleServerMessage(event.payload);
    });
    this.eventUnlisten = unlisten;

    // Start the server
    const result = await invoke<string>("lsp_start", {
      language: this.language,
      workspaceRoot: this.workspaceRoot,
    });

    if (result === "already_running") {
      this.initialized = true;
      this.registerMonacoProviders();
      return;
    }

    // Wait for initialize response then send initialized notification
    await new Promise<void>((resolve) => {
      this.pendingRequests.set(1, (_caps) => {
        this.sendNotification("initialized", {});
        this.initialized = true;
        this.registerMonacoProviders();
        resolve();
      });
    });

    // Notify server about already-open file
    const model = editor.getModel();
    if (model) {
      this.notifyOpen(model);
    }

    // Watch for model changes
    this.disposables.push(
      editor.onDidChangeModel((e) => {
        if (e.newModelUrl) {
          const newModel = monaco.editor.getModel(e.newModelUrl);
          if (newModel) this.notifyOpen(newModel);
        }
      })
    );
  }

  stop(): void {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    if (this.eventUnlisten) {
      this.eventUnlisten();
      this.eventUnlisten = null;
    }
    invoke("lsp_stop", { language: this.language }).catch(() => {});
    this.initialized = false;
  }

  // ── Message Handling ────────────────────────────────────────────────────────

  private handleServerMessage(raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    // Response to a request
    if (msg.id !== undefined && msg.result !== undefined) {
      const resolver = this.pendingRequests.get(msg.id);
      if (resolver) {
        this.pendingRequests.delete(msg.id);
        resolver(msg.result);
      }
      return;
    }

    // Server notification
    if (msg.method) {
      this.handleNotification(msg.method, msg.params);
    }
  }

  private handleNotification(method: string, params: any): void {
    switch (method) {
      case "textDocument/publishDiagnostics":
        this.applyDiagnostics(params);
        break;
      case "window/logMessage":
        // Silently ignore log messages
        break;
      default:
        break;
    }
  }

  // ── Diagnostics ─────────────────────────────────────────────────────────────

  private applyDiagnostics(params: {
    uri: string;
    diagnostics: any[];
  }): void {
    const uriStr = params.uri;
    const model = monaco.editor.getModel(monaco.Uri.parse(uriStr));
    if (!model) return;

    const markers: monaco.editor.IMarkerData[] = params.diagnostics.map((d) => ({
      severity: this.lspSeverityToMonaco(d.severity),
      startLineNumber: d.range.start.line + 1,
      startColumn: d.range.start.character + 1,
      endLineNumber: d.range.end.line + 1,
      endColumn: d.range.end.character + 1,
      message: d.message,
      source: d.source ?? this.language,
      code: d.code?.toString(),
    }));

    monaco.editor.setModelMarkers(model, `lsp-${this.language}`, markers);
  }

  private lspSeverityToMonaco(severity: number): monaco.MarkerSeverity {
    switch (severity) {
      case 1: return monaco.MarkerSeverity.Error;
      case 2: return monaco.MarkerSeverity.Warning;
      case 3: return monaco.MarkerSeverity.Info;
      default: return monaco.MarkerSeverity.Hint;
    }
  }

  // ── Document Sync ───────────────────────────────────────────────────────────

  private notifyOpen(model: monaco.editor.ITextModel): void {
    const uri = model.uri.toString();
    const text = model.getValue();
    const languageId = model.getLanguageId();

    this.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId,
        version: model.getVersionId(),
        text,
      },
    });

    // Watch changes on this model
    const changeDisposable = model.onDidChangeContent((e) => {
      this.sendNotification("textDocument/didChange", {
        textDocument: { uri, version: model.getVersionId() },
        contentChanges: e.changes.map((c) => ({
          range: {
            start: {
              line: c.range.startLineNumber - 1,
              character: c.range.startColumn - 1,
            },
            end: {
              line: c.range.endLineNumber - 1,
              character: c.range.endColumn - 1,
            },
          },
          text: c.text,
        })),
      });
    });

    this.disposables.push(changeDisposable);
  }

  // ── Monaco Provider Registration ────────────────────────────────────────────

  private registerMonacoProviders(): void {
    const lang = this.language;

    // Completion provider
    this.disposables.push(
      monaco.languages.registerCompletionItemProvider(lang, {
        triggerCharacters: [".", ":", "\"", "'", "/", "@", "<"],
        provideCompletionItems: async (model, position) => {
          const result = await this.sendRequest("textDocument/completion", {
            textDocument: { uri: model.uri.toString() },
            position: {
              line: position.lineNumber - 1,
              character: position.column - 1,
            },
          });

          if (!result) return { suggestions: [] };

          const items = Array.isArray(result) ? result : result.items ?? [];
          return {
            suggestions: items.map((item: any) =>
              this.lspCompletionToMonaco(item, model, position)
            ),
          };
        },
      })
    );

    // Hover provider
    this.disposables.push(
      monaco.languages.registerHoverProvider(lang, {
        provideHover: async (model, position) => {
          const result = await this.sendRequest("textDocument/hover", {
            textDocument: { uri: model.uri.toString() },
            position: {
              line: position.lineNumber - 1,
              character: position.column - 1,
            },
          });

          if (!result?.contents) return null;

          const contents = Array.isArray(result.contents)
            ? result.contents
            : [result.contents];

          return {
            contents: contents.map((c: any) => ({
              value: typeof c === "string" ? c : c.value ?? "",
            })),
          };
        },
      })
    );

    // Go to Definition
    this.disposables.push(
      monaco.languages.registerDefinitionProvider(lang, {
        provideDefinition: async (model, position) => {
          const result = await this.sendRequest("textDocument/definition", {
            textDocument: { uri: model.uri.toString() },
            position: {
              line: position.lineNumber - 1,
              character: position.column - 1,
            },
          });

          if (!result) return null;
          const locs = Array.isArray(result) ? result : [result];
          return locs.map((loc: any) => this.lspLocationToMonaco(loc));
        },
      })
    );

    // Find References
    this.disposables.push(
      monaco.languages.registerReferenceProvider(lang, {
        provideReferences: async (model, position) => {
          const result = await this.sendRequest("textDocument/references", {
            textDocument: { uri: model.uri.toString() },
            position: {
              line: position.lineNumber - 1,
              character: position.column - 1,
            },
            context: { includeDeclaration: true },
          });

          if (!result) return [];
          return result.map((loc: any) => this.lspLocationToMonaco(loc));
        },
      })
    );

    // Signature Help (parameter hints)
    this.disposables.push(
      monaco.languages.registerSignatureHelpProvider(lang, {
        signatureHelpTriggerCharacters: ["(", ","],
        provideSignatureHelp: async (model, position) => {
          const result = await this.sendRequest("textDocument/signatureHelp", {
            textDocument: { uri: model.uri.toString() },
            position: {
              line: position.lineNumber - 1,
              character: position.column - 1,
            },
          });

          if (!result) return null;
          return {
            value: {
              signatures: result.signatures?.map((sig: any) => ({
                label: sig.label,
                documentation: sig.documentation
                  ? { value: sig.documentation }
                  : undefined,
                parameters: sig.parameters?.map((p: any) => ({
                  label: p.label,
                  documentation: p.documentation
                    ? { value: p.documentation }
                    : undefined,
                })) ?? [],
              })) ?? [],
              activeSignature: result.activeSignature ?? 0,
              activeParameter: result.activeParameter ?? 0,
            },
            dispose: () => {},
          };
        },
      })
    );

    // Rename Symbol
    this.disposables.push(
      monaco.languages.registerRenameProvider(lang, {
        provideRenameEdits: async (model, position, newName) => {
          const result = await this.sendRequest("textDocument/rename", {
            textDocument: { uri: model.uri.toString() },
            position: {
              line: position.lineNumber - 1,
              character: position.column - 1,
            },
            newName,
          });

          if (!result) return { edits: [] };

          const edits: monaco.languages.IWorkspaceTextEdit[] = [];
          const changes = result.changes ?? {};

          for (const [uri, textEdits] of Object.entries(changes)) {
            const monacoUri = monaco.Uri.parse(uri);
            for (const edit of textEdits as any[]) {
              edits.push({
                resource: monacoUri,
                textEdit: {
                  range: this.lspRangeToMonaco(edit.range),
                  text: edit.newText,
                },
                versionId: undefined,
              });
            }
          }

          return { edits };
        },
      })
    );
  }

  // ── LSP → Monaco converters ─────────────────────────────────────────────────

  private lspCompletionToMonaco(
    item: any,
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): monaco.languages.CompletionItem {
    const word = model.getWordUntilPosition(position);
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn,
    };

    return {
      label: item.label,
      kind: this.lspCompletionKindToMonaco(item.kind),
      documentation: item.documentation
        ? { value: typeof item.documentation === "string"
            ? item.documentation
            : item.documentation.value ?? "" }
        : undefined,
      detail: item.detail,
      insertText: item.insertText ?? item.label,
      insertTextRules: item.insertTextFormat === 2
        ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
        : undefined,
      range,
    };
  }

  private lspCompletionKindToMonaco(kind: number): monaco.languages.CompletionItemKind {
    const K = monaco.languages.CompletionItemKind;
    const map: Record<number, monaco.languages.CompletionItemKind> = {
      1: K.Text, 2: K.Method, 3: K.Function, 4: K.Constructor,
      5: K.Field, 6: K.Variable, 7: K.Class, 8: K.Interface,
      9: K.Module, 10: K.Property, 11: K.Unit, 12: K.Value,
      13: K.Enum, 14: K.Keyword, 15: K.Snippet, 16: K.Color,
      17: K.File, 18: K.Reference, 19: K.Folder, 20: K.EnumMember,
      21: K.Constant, 22: K.Struct, 23: K.Event, 24: K.Operator,
      25: K.TypeParameter,
    };
    return map[kind] ?? K.Text;
  }

  private lspLocationToMonaco(loc: any): monaco.languages.Location {
    return {
      uri: monaco.Uri.parse(loc.uri),
      range: this.lspRangeToMonaco(loc.range),
    };
  }

  private lspRangeToMonaco(range: any): monaco.IRange {
    return {
      startLineNumber: range.start.line + 1,
      startColumn: range.start.character + 1,
      endLineNumber: range.end.line + 1,
      endColumn: range.end.character + 1,
    };
  }

  // ── Transport ───────────────────────────────────────────────────────────────

  private sendNotification(method: string, params: any): void {
    const msg = JSON.stringify({ jsonrpc: "2.0", method, params });
    invoke("lsp_send", { language: this.language, message: msg }).catch(() => {});
  }

  private sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve) => {
      const id = nextId();
      const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
      this.pendingRequests.set(id, resolve);
      invoke("lsp_send", { language: this.language, message: msg }).catch(() => {
        this.pendingRequests.delete(id);
        resolve(null);
      });

      // Timeout after 5 seconds to avoid stale promises
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          resolve(null);
        }
      }, 5000);
    });
  }
}

// ─── LSP Manager (singleton per workspace) ────────────────────────────────────

const activeClients = new Map<string, LspClient>();

export async function startLspForFile(
  filePath: string,
  workspaceRoot: string,
  editor: monaco.editor.IStandaloneCodeEditor
): Promise<void> {
  const language = languageForFile(filePath);
  if (!language) return;

  // Already have a client for this language
  if (activeClients.has(language)) return;

  const client = new LspClient(language, workspaceRoot);
  activeClients.set(language, client);

  try {
    await client.start(editor);
    console.log(`[LSP] Started ${language} language server`);
  } catch (e) {
    console.warn(`[LSP] Could not start ${language}:`, e);
    activeClients.delete(language);
  }
}

export function stopAllLspClients(): void {
  for (const client of activeClients.values()) {
    client.stop();
  }
  activeClients.clear();
}

export function stopLspForLanguage(language: string): void {
  const client = activeClients.get(language);
  if (client) {
    client.stop();
    activeClients.delete(language);
  }
}
