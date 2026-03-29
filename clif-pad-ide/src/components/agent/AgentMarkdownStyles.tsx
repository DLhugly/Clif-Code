// Scoped markdown styles for agent panel — extracted from AgentChatPanel.tsx

const AgentMarkdownStyles = () => (
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
    .agent-markdown table {
      border-collapse: collapse;
      width: 100%;
      margin: 0.6em 0;
      font-size: 0.9em;
      overflow-x: auto;
      display: block;
    }
    .agent-markdown th, .agent-markdown td {
      border: 1px solid var(--border-default);
      padding: 6px 10px;
      text-align: left;
      white-space: nowrap;
    }
    .agent-markdown th {
      background: var(--bg-hover);
      font-weight: 600;
      color: var(--text-primary);
    }
    .agent-markdown tr:nth-child(even) td {
      background: color-mix(in srgb, var(--bg-hover) 50%, transparent);
    }
    .agent-markdown tr:hover td {
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
    .agent-markdown,
    .agent-markdown * {
      user-select: text !important;
      -webkit-user-select: text !important;
    }
  `}</style>
);

export default AgentMarkdownStyles;
