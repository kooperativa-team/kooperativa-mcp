#!/usr/bin/env node
/**
 * Kooperativa MCP server over Streamable HTTP (stateless).
 *
 * Exposes the same Kooperativa tools as index.ts, but over a remote HTTP
 * transport so a client like Claude (claude.ai "Add custom connector") can
 * reach it at a public URL instead of spawning it over stdio.
 *
 * Stateless: each HTTP request gets a fresh McpServer and a fresh transport
 * (`sessionIdGenerator: undefined`, `enableJsonResponse: true`). That is the
 * official pattern for simple API-style MCP servers and it is what lets any
 * number of clients connect and re-initialize without the "Server already
 * initialized" error a single long-lived stateful transport produces.
 *
 * Auth: every request must carry `Authorization: Bearer <MCP_ACCESS_TOKEN>`.
 * The token is read from the MCP_ACCESS_TOKEN env var and compared in constant
 * time. KOOPERATIVA_API_KEY is used for the upstream Kooperativa API and never
 * leaves this process. Without a token configured the server refuses every
 * request (fail closed), so a misconfigured deploy exposes nothing.
 *
 * Bind: 127.0.0.1 only, meant to sit behind a TLS reverse proxy (Caddy).
 * Port via PORT env, default 3100.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerKooperativaTools, buildInstructions } from "./tools.js";
import { VERSION } from "./version.js";

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 3100);
const ACCESS_TOKEN = process.env.MCP_ACCESS_TOKEN;
// MCP tool messages are a few KB at most; cap the body so a large POST cannot
// exhaust memory. This is a second layer: Caddy also caps the body at the edge.
const MAX_BODY_BYTES = 1024 * 1024; // 1 MiB

function isAuthorized(authorizationHeader: string | undefined): boolean {
  if (!ACCESS_TOKEN || !authorizationHeader) return false;
  const token = authorizationHeader.startsWith("Bearer ")
    ? authorizationHeader.slice("Bearer ".length)
    : authorizationHeader;
  const supplied = Buffer.from(token);
  const expected = Buffer.from(ACCESS_TOKEN);
  if (supplied.length !== expected.length) return false;
  return timingSafeEqual(supplied, expected);
}

async function handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isAuthorized(req.headers.authorization)) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  const contentLength = req.headers["content-length"];
  if (contentLength) {
    const size = Number(contentLength);
    if (Number.isFinite(size) && size > MAX_BODY_BYTES) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Payload too large" }));
      return;
    }
  }

  // Fresh server + transport per request: the stateless pattern.
  const server = new McpServer({ name: "kooperativa-mcp", version: VERSION }, { instructions: buildInstructions() });
  registerKooperativaTools(server);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);

  try {
    await transport.handleRequest(req, res);
  } finally {
    try {
      await transport.close();
    } catch {
      // Closing a per-request transport is best-effort; the request is done.
    }
  }
}

async function main() {
  if (!process.env.KOOPERATIVA_API_KEY) {
    console.error(
      "[kooperativa-mcp-http] Warning: KOOPERATIVA_API_KEY is not set. Tool calls will fail until it is configured.",
    );
  }
  if (!ACCESS_TOKEN) {
    console.error(
      "[kooperativa-mcp-http] Warning: MCP_ACCESS_TOKEN is not set. Every request will be refused (fail closed).",
    );
  }

  const httpServer = createServer((req, res) => {
    handleMcpRequest(req, res).catch((err) => {
      // Log the message only, never the request headers or body, so the bearer
      // token can never end up in a log line.
      console.error("[kooperativa-mcp-http] Request error:", err instanceof Error ? err.message : err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      } else {
        res.end();
      }
    });
  });

  httpServer.listen(PORT, HOST, () => {
    console.log(`[kooperativa-mcp-http] Listening on http://${HOST}:${PORT}`);
  });

  const shutdown = () => {
    httpServer.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[kooperativa-mcp-http] Fatal error:", err);
  process.exit(1);
});
