export interface AgentMessage {
  id: string;
  role: "user" | "assistant" | "tool_call" | "tool_result" | "system";
  content: string;
  images?: string[]; // base64 data URLs for pasted/attached images
  timestamp: number;
  toolName?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
  status?: "streaming" | "done" | "error" | "pending";
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: "pending" | "running" | "done" | "error";
  result?: string;
}

export interface AgentSession {
  id: string;
  title: string;
  projectPath: string;
  model: string;
  createdAt: number;
  updatedAt: number;
}

export interface AgentContext {
  files?: string[];
  selection?: { path: string; text: string; startLine: number; endLine: number };
  activeFile?: string;
  gitBranch?: string;
  agentMode?: "agent" | "ask" | "plan";
}

export interface EditPreview {
  start_line: number;
  end_line: number;
  old_line_count: number;
  new_line_count: number;
  before: string;
  after: string;
}

export interface WritePreview {
  created: boolean;
  old_line_count: number;
  new_line_count: number;
  bytes: number;
  preview: string;
}
