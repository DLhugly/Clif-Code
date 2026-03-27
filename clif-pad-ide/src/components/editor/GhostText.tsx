import * as monaco from "monaco-editor";
import { settings } from "../../stores/settingsStore";
import { aiComplete, getApiKey } from "../../lib/tauri";

/**
 * Register an inline completions provider that fetches FIM ghost text
 * from the configured AI backend. Returns a disposable to tear down
 * the provider when the editor unmounts.
 *
 * Requires Monaco to be created with: inlineSuggest: { enabled: true }
 * User accepts with Tab, dismisses with Escape.
 */
export function registerGhostTextProvider(
  editor: monaco.editor.IStandaloneCodeEditor
): monaco.IDisposable {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const provider = monaco.languages.registerInlineCompletionsProvider("*", {
    provideInlineCompletions: async (model, position, _ctx, token) => {
      // Respect the user toggle
      if (!settings().inlineAiEnabled) {
        return { items: [] };
      }

      // Cancel any pending debounce
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }

      // 600ms debounce — wait for the user to pause typing
      const completion = await new Promise<string | null>((resolve) => {
        debounceTimer = setTimeout(async () => {
          if (token.isCancellationRequested) {
            resolve(null);
            return;
          }

          try {
            // Extract prefix (~2000 chars before cursor) and suffix (~500 chars after)
            const fullText = model.getValue();
            const offset = model.getOffsetAt(position);
            const prefix = fullText.slice(Math.max(0, offset - 2000), offset);
            const suffix = fullText.slice(offset, offset + 500);

            // Skip if there's nothing meaningful to complete
            if (prefix.trim().length < 3) {
              resolve(null);
              return;
            }

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

            // Strip any leading/trailing whitespace that doesn't match context
            resolve(cleaned || null);
          } catch {
            resolve(null);
          }
        }, 600);
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
        // Prevent stale suggestions from being reused
        enableForwardStability: true,
      };
    },

    freeInlineCompletions() {
      // no-op
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
