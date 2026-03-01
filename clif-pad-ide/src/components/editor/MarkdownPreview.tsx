import { Component, createMemo } from "solid-js";
import { marked } from "marked";
import { activeFile } from "../../stores/fileStore";

marked.setOptions({ async: false, breaks: true, gfm: true });

const MarkdownPreview: Component = () => {
  const html = createMemo(() => marked.parse(activeFile()?.content ?? "") as string);

  return (
    <div
      class="h-full overflow-y-auto p-8"
      style={{ background: "var(--editor-bg)", color: "var(--text-primary)" }}
    >
      <div class="max-w-3xl mx-auto markdown-preview" innerHTML={html()} />

      <style>{`
        .markdown-preview h1 {
          font-size: 2em;
          font-weight: 700;
          margin: 0.67em 0;
          padding-bottom: 0.3em;
          border-bottom: 1px solid var(--border-color);
        }
        .markdown-preview h2 {
          font-size: 1.5em;
          font-weight: 600;
          margin: 0.83em 0;
          padding-bottom: 0.3em;
          border-bottom: 1px solid var(--border-color);
        }
        .markdown-preview h3 {
          font-size: 1.25em;
          font-weight: 600;
          margin: 1em 0;
        }
        .markdown-preview h4 {
          font-size: 1em;
          font-weight: 600;
          margin: 1.33em 0;
        }
        .markdown-preview h5 {
          font-size: 0.875em;
          font-weight: 600;
          margin: 1.67em 0;
        }
        .markdown-preview h6 {
          font-size: 0.85em;
          font-weight: 600;
          margin: 2.33em 0;
          color: var(--text-secondary);
        }
        .markdown-preview p {
          margin: 1em 0;
          line-height: 1.7;
        }
        .markdown-preview a {
          color: var(--accent-color);
          text-decoration: none;
        }
        .markdown-preview a:hover {
          text-decoration: underline;
        }
        .markdown-preview code {
          font-family: var(--font-mono, monospace);
          font-size: 0.875em;
          padding: 0.2em 0.4em;
          border-radius: 4px;
          background: var(--hover-bg);
        }
        .markdown-preview pre {
          margin: 1em 0;
          padding: 1em;
          border-radius: 6px;
          overflow-x: auto;
          background: var(--sidebar-bg);
          border: 1px solid var(--border-color);
        }
        .markdown-preview pre code {
          padding: 0;
          background: none;
          font-size: 0.85em;
        }
        .markdown-preview blockquote {
          margin: 1em 0;
          padding: 0.5em 1em;
          border-left: 3px solid var(--accent-color);
          color: var(--text-secondary);
          background: var(--hover-bg);
          border-radius: 0 4px 4px 0;
        }
        .markdown-preview blockquote p {
          margin: 0.5em 0;
        }
        .markdown-preview ul,
        .markdown-preview ol {
          margin: 1em 0;
          padding-left: 2em;
          line-height: 1.7;
        }
        .markdown-preview li {
          margin: 0.25em 0;
        }
        .markdown-preview ul {
          list-style-type: disc;
        }
        .markdown-preview ol {
          list-style-type: decimal;
        }
        .markdown-preview table {
          margin: 1em 0;
          border-collapse: collapse;
          width: 100%;
        }
        .markdown-preview th,
        .markdown-preview td {
          padding: 0.5em 1em;
          border: 1px solid var(--border-color);
          text-align: left;
        }
        .markdown-preview th {
          font-weight: 600;
          background: var(--sidebar-bg);
        }
        .markdown-preview hr {
          margin: 2em 0;
          border: none;
          border-top: 1px solid var(--border-color);
        }
        .markdown-preview img {
          max-width: 100%;
          border-radius: 6px;
        }
      `}</style>
    </div>
  );
};

export default MarkdownPreview;
