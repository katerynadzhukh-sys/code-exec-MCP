import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { codeExecTool } from "./tools/code_exec.js";

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export interface ToolDefinition<T extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  description: string;
  inputSchema: z.ZodObject<T>;
  handler: (args: z.infer<z.ZodObject<T>>) => Promise<ToolResult>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tools: ToolDefinition<any>[] = [
  codeExecTool,
];

export function createServer(): McpServer {
  const server = new McpServer({
    name: "code-exec-mcp",
    version: "1.0.0",
  });

  // Register all tools
  for (const tool of tools) {
    server.tool(tool.name, tool.description, tool.inputSchema.shape, tool.handler);
  }

  return server;
}
