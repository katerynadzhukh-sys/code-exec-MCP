import { randomUUID } from "node:crypto";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
import { createServer as createHttpServer } from "node:http";

const SESSION_TTL_MS = 30 * 60 * 1000;  // 30 minutes of inactivity
const SESSION_CLEANUP_INTERVAL_MS = 60 * 1000; // check every minute

interface Session {
  transport: StreamableHTTPServerTransport;
  lastActivity: number;
}

function getTransport(): "stdio" | "http" {
  const raw =
    process.argv.find((a) => a.startsWith("--transport="))?.split("=")[1] ??
    process.env.MCP_TRANSPORT ??
    "stdio";
  if (raw !== "stdio" && raw !== "http") {
    throw new Error(`Invalid transport "${raw}". Valid values: stdio, http`);
  }
  return raw;
}

async function main() {
  const transport = getTransport();

  if (transport === "stdio") {
    const server = createServer();
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    console.error("MCP server running on stdio");
  } else {
    const port = parseInt(process.env.MCP_PORT ?? "3001", 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid MCP_PORT: "${process.env.MCP_PORT}"`);
    }
    const sessions = new Map<string, Session>();

    // Periodically remove sessions that have been inactive beyond TTL
    const cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, session] of sessions) {
        if (now - session.lastActivity > SESSION_TTL_MS) {
          sessions.delete(id);
          session.transport.close();
          console.error(`[session] evicted ${id} (inactive for ${Math.round((now - session.lastActivity) / 60000)} min)`);
        }
      }
    }, SESSION_CLEANUP_INTERVAL_MS);

    // Allow the process to exit even if the timer is still running
    cleanupTimer.unref();

    const startedAt = Date.now();

    const httpServer = createHttpServer(async (req, res) => {
      try {
        if (req.method === "GET" && req.url === "/health") {
          const body = JSON.stringify({
            status: "ok",
            uptime_s: Math.floor((Date.now() - startedAt) / 1000),
            sessions: sessions.size,
          });
          res.writeHead(200, { "Content-Type": "application/json" }).end(body);
          return;
        }

        const sessionId = req.headers["mcp-session-id"] as string | undefined;

        if (sessionId) {
          const session = sessions.get(sessionId);
          if (!session) {
            res.writeHead(404).end("Session not found");
            return;
          }
          session.lastActivity = Date.now();
          await session.transport.handleRequest(req, res);
        } else {
          // New session: no Mcp-Session-Id header means initialization request
          const httpTransport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (id): void => {
              sessions.set(id, { transport: httpTransport, lastActivity: Date.now() });
            },
          });

          httpTransport.onclose = () => {
            if (httpTransport.sessionId) sessions.delete(httpTransport.sessionId);
          };

          const server = createServer();
          await server.connect(httpTransport);
          await httpTransport.handleRequest(req, res);
        }
      } catch (err) {
        console.error("[http] unhandled error:", err);
        if (!res.headersSent) res.writeHead(500).end("Internal server error");
      }
    });

    httpServer.listen(port, () => {
      console.error(`MCP server running on http://localhost:${port}/mcp`);
    });
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
