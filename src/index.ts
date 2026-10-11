#!/usr/bin/env node
/**
 * Kooperativa MCP server.
 *
 * Exposes the Kooperativa B2B enrichment API (person/company enrich & search,
 * hiring signals, job changes, webhook monitors) as MCP tools over stdio.
 *
 * Auth: reads KOOPERATIVA_API_KEY from the environment, or the key stored by
 * `mcp-server login` in ~/.kooperativa/config.json. Never hardcode a key here.
 * Get a key from https://kooperativa.io/api-keys
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerKooperativaTools, KOOPERATIVA_MCP_INSTRUCTIONS } from "./tools.js";
import { VERSION } from "./version.js";
import { missingKeyMessage, resolveApiKey } from "./credentials.js";
import { login } from "./login.js";

async function main() {
  if (process.argv[2] === "login") {
    await login();
    return;
  }

  const resolved = resolveApiKey();
  if (resolved.key === null) {
    console.error(`[kooperativa-mcp] Warning: ${missingKeyMessage(resolved.problem)} Tool calls will fail until then.`);
  }

  const server = new McpServer(
    { name: "kooperativa-mcp", version: VERSION },
    { instructions: KOOPERATIVA_MCP_INSTRUCTIONS },
  );

  registerKooperativaTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[kooperativa-mcp] Fatal error:", err);
  process.exit(1);
});
