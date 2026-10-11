# @kooperativa_team/mcp-server

MCP (Model Context Protocol) server for the [Kooperativa](https://kooperativa.io) API.

Gives any MCP-compatible AI assistant (Claude Desktop, Kiro, Cursor, Windsurf, Kilo, etc.) direct access to Kooperativa's B2B data lake: enrich and search professional profiles and companies, surface hiring signals and recent job changes, resolve an email address to a profile, and manage webhook monitors, all from a conversation.

Kooperativa holds structured people and company records. It deliberately has **no contact data**: no email addresses and no phone numbers.

## Installation

Requires Node.js 18+ and a Kooperativa API key. Get one from your [account dashboard](https://kooperativa.io/api-keys).

Add the server to your MCP client's configuration:

```json
{
  "mcpServers": {
    "kooperativa": {
      "command": "npx",
      "args": ["-y", "@kooperativa_team/mcp-server"],
      "env": {
        "KOOPERATIVA_API_KEY": "ik_live_..."
      }
    }
  }
}
```

No local installation step is required, `npx` resolves and runs the package on demand. Restart your MCP client after adding the config.

## Available tools

| Tool | Endpoint | Description |
|---|---|---|
| `kooperativa_account_info` | `GET /me` | License status and usage breakdown |
| `kooperativa_health_check` | `GET /health` | API liveness probe |
| `kooperativa_enrich_person` | `GET /person` | Full profile lookup by URL, username, or ID |
| `kooperativa_enrich_person_realtime` | `GET /person/realtime` | Same, but from the live source. **$0.001 per call**, see [Billing](#billing) |
| `kooperativa_check_person` | `GET /person/check` | Cheap existence check before a full lookup |
| `kooperativa_search_people` | `POST /people/search` | Filtered search across the people data lake |
| `kooperativa_bulk_enrich_people` | `POST /people/bulk-enrich` | Enrich up to 100 profiles in one call |
| `kooperativa_person_colleagues` | `GET /person/colleagues` | Current coworkers of a person |
| `kooperativa_person_similar` | `GET /person/similar` | Lookalike profiles by seniority/industry/country |
| `kooperativa_person_job_changes` | `GET /person/job-changes` | Recently started new roles |
| `kooperativa_resolve_email` | `POST /resolve-email` | Resolve an email address you already have to a profile |
| `kooperativa_institution_alumni` | `GET /institution/alumni` | People whose education includes a given school |
| `kooperativa_enrich_company` | `GET /company` | Full company profile lookup |
| `kooperativa_enrich_company_realtime` | `GET /company/realtime` | Same, but from the live source. **$0.001 per call**, see [Billing](#billing) |
| `kooperativa_check_company` | `GET /company/check` | Cheap existence check before a full lookup |
| `kooperativa_search_companies` | `POST /companies/search` | Filtered search across the company data lake |
| `kooperativa_company_current_employees` | `GET /company/current-employees` | People currently at a company |
| `kooperativa_company_past_employees` | `GET /company/past-employees` | People who used to work at a company |
| `kooperativa_company_headcount_by_seniority` | `GET /company/headcount-by-seniority` | Indexed headcount breakdown |
| `kooperativa_company_hiring_signals` | `GET /company/hiring-signals` | Recently joined employees |
| `kooperativa_company_decision_makers` | `GET /company/decision-makers` | C-level, VP and director profiles at a company |
| `kooperativa_list_monitors` | `GET /monitors` | List active webhook monitors |
| `kooperativa_create_monitor` | `POST /monitors` | Subscribe to change events on a profile/company |
| `kooperativa_delete_monitor` | `DELETE /monitors` | Remove a webhook monitor |

Full parameter reference: [docs.kooperativa.io](https://docs.kooperativa.io).

## Server instructions

On connect the server sends the client a short brief (the MCP `instructions` field) covering the things that are easy to get wrong: the people and company industry taxonomies differ, countries are ISO 2-letter codes, a 404 means "not indexed yet", headcount figures can be unreliable, company-name search is fuzzy, and the realtime tools cost money. It also tells the model to treat profile text as untrusted data.

## Billing

Every tool above is included in the workspace license, with no per-call charge, except the two realtime ones. Those read from the live source rather than from the Kooperativa data lake, and are metered at **$0.001 per call** on top of the license, which is still required.

This matters more here than in a hand-written integration, because the model decides when to call a tool. Three things follow from that:

- **A miss still costs.** A call is billed whenever the live source actually answered, so a not-found result costs the same as a hit, because the lookup happened either way. Only a `503`, meaning the source could not be reached at all, is not billed.
- **There is no cache.** Two realtime calls for the same person bill twice. The result is written back to the data lake, so the free `kooperativa_enrich_person` returns it afterwards at no cost.
- **The tool descriptions carry the price**, so an agent choosing between the free and metered variant has the cost in front of it. If you wrap this server in your own agent, keep that wording rather than trimming the descriptions for brevity.

If you want to rule out metered spend entirely, do not expose the two `*_realtime` tools to the model.

## Authentication

The server looks for the key in this order:

1. `KOOPERATIVA_API_KEY` in the environment, when it has the shape of a real key (`ik_live_...`).
2. The key stored in `~/.kooperativa/config.json` by the login command (same file the Kooperativa CLI uses).

The key is never logged, hardcoded, or transmitted anywhere other than as the `Authorization: Bearer` header on requests to `https://kooperativa.io/api/v1`.

### Store the key once with `login`

Some MCP clients cannot pass a secret safely (they pass the text of a placeholder such as `${KOOPERATIVA_API_KEY}` instead of expanding it, or do not inherit your shell environment). For those, run this once in a terminal:

```bash
npx -y @kooperativa_team/mcp-server login
```

It asks for the key with input hidden, checks it against the API, and saves it with mode `0600`. It prints only your account email and license state, never the key. Restart your MCP client afterwards. The client config then needs no `env` block at all.

An environment value that does not look like a key is ignored, so an unexpanded placeholder falls back to the stored key instead of causing a 401.

Never paste the key into a chat, a prompt, or a committed config file. Keep it in the `login` file, your MCP client's `env` block, or a secrets manager.

## Toolsets

By default the server registers all 24 tools. Set `KOOPERATIVA_MCP_TOOLSET=read` to register only the 18 read-only data tools: no real-time (metered) lookups, no monitors (webhook subscriptions) and no email-to-profile lookup. The plugin and extension listings for Kiro, Cursor and Claude use this set.

```json
{
  "mcpServers": {
    "kooperativa": {
      "command": "npx",
      "args": ["-y", "@kooperativa_team/mcp-server"],
      "env": { "KOOPERATIVA_MCP_TOOLSET": "read" }
    }
  }
}
```

Every tool carries a `title` and the MCP annotations `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint`. Responses are compact JSON, to keep token use low.

## Self-hosting over Streamable HTTP

The package also ships `kooperativa-mcp-http`, a stateless Streamable HTTP server for clients that connect to a URL instead of spawning a process.

```bash
export KOOPERATIVA_API_KEY="ik_live_..."
export MCP_ACCESS_TOKEN="$(openssl rand -base64 32)"
npx -y -p @kooperativa_team/mcp-server kooperativa-mcp-http
```

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `MCP_ACCESS_TOKEN` | yes | none | Bearer token every request must send. Without it the server refuses all requests (fail closed). |
| `KOOPERATIVA_API_KEY` | yes | none | Your Kooperativa key, used for the upstream calls. |
| `PORT` | no | `3100` | Listen port. |
| `HOST` | no | `127.0.0.1` | Bind address. |

Security notes for self-hosting:

- **One server is one account.** Every caller that holds `MCP_ACCESS_TOKEN` spends your license and your realtime credits. Do not share the token or the URL.
- **Terminate TLS in front of it** (Caddy, nginx) and keep the default loopback bind. Plain HTTP carries the bearer token in the clear.
- Requests are capped at 1 MiB, the token is compared in constant time, and request headers and bodies are never logged.
- Rotate `MCP_ACCESS_TOKEN` if it is ever exposed.

## License

MIT

## Support

support@kooperativa.io
