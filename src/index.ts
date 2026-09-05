#!/usr/bin/env node
/**
 * Kooperativa MCP server.
 *
 * Exposes the Kooperativa B2B enrichment API (person/company enrich & search,
 * hiring signals, job changes, webhook monitors) as MCP tools over stdio.
 *
 * Auth: reads KOOPERATIVA_API_KEY from the environment. Never hardcode a key
 * here — set it in your MCP client's config `env` block. Get a key from
 * https://kooperativa.io/api-keys
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerKooperativaTools } from "./tools.js";

async function main() {
  if (!process.env.KOOPERATIVA_API_KEY) {
    console.error(
      "[kooperativa-mcp] Warning: KOOPERATIVA_API_KEY is not set. Tool calls will fail until it is configured.",
    );
  }

  const server = new McpServer({
    name: "kooperativa-mcp",
    version: "0.1.0",
  });

  registerKooperativaTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[kooperativa-mcp] Fatal error:", err);
  process.exit(1);
});
