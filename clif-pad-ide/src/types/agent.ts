export interface AgentMessage {
  id: string;
  role: "user" | "assistant" | "tool_call" | "tool_result" | "system";
  content: string;
  timestamp: number;
  toolName?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
  status?: "streaming" | "done" | "error";
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
}
