import * as monaco from "monaco-editor";
import { settings } from "../../stores/settingsStore";
import { aiComplete, getApiKey } from "../../lib/tauri";

/**
 * Register an inline completions provider that fetches FIM ghost text
 * from the configured AI backend. Returns a disposable to tear down
 * the provider when the editor unmounts.
 */
export function registerGhostTextProvider(
  editor: monaco.editor.IStandaloneCodeEditor
): monaco.IDisposable {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const provider = monaco.languages.registerInlineCompletionsProvider("*", {
    provideInlineCompletions: async (model, position, _ctx, token) => {
      // Cancel any pending debounce
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }

      // 500ms debounce — wait for the user to pause typing
      const completion = await new Promise<string | null>((resolve) => {
        debounceTimer = setTimeout(async () => {
          if (token.isCancellationRequested) {
            resolve(null);
            return;
          }

          try {
            // Extract prefix (~1500 chars before cursor) and suffix (~500 chars after)
            const fullText = model.getValue();
            const offset = model.getOffsetAt(position);
            const prefix = fullText.slice(Math.max(0, offset - 1500), offset);
            const suffix = fullText.slice(offset, offset + 500);

            // Format as FIM prompt
            const context = `<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`;

            const apiKey = await getApiKey(settings().aiProvider);
            const result = await aiComplete(
              context,
              settings().aiModel,
              apiKey,
              settings().aiProvider
            );

            if (token.isCancellationRequested) {
              resolve(null);
              return;
            }

            // Strip markdown fences if the model wrapped its output
            let cleaned = result.trim();
            if (cleaned.startsWith("```")) {
              const firstNewline = cleaned.indexOf("\n");
              const lastFence = cleaned.lastIndexOf("```");
              if (firstNewline !== -1 && lastFence > firstNewline) {
                cleaned = cleaned.slice(firstNewline + 1, lastFence).trim();
              }
            }

            resolve(cleaned || null);
          } catch {
            resolve(null);
          }
        }, 500);
      });

      if (!completion || token.isCancellationRequested) {
        return { items: [] };
      }

      const range = new monaco.Range(
        position.lineNumber,
        position.column,
        position.lineNumber,
        position.column
      );

      return {
        items: [
          {
            insertText: completion,
            range,
          },
        ],
      };
    },

    freeInlineCompletions() {
      // no-op — nothing to free
    },
  });

  // Clean up debounce timer when provider is disposed
  return {
    dispose() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      provider.dispose();
    },
  };
}
