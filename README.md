# @kooperativa_team/mcp-server

MCP (Model Context Protocol) server for the [Kooperativa](https://kooperativa.io) API.

Gives any MCP-compatible AI assistant (Claude Desktop, Kiro, Cursor, Windsurf, etc.) direct access to Kooperativa's B2B data lake: enrich and search professional profiles and companies, surface hiring signals and recent job changes, and manage webhook monitors, all from a conversation.

## Installation

Requires a Kooperativa API key. Get one from your [account dashboard](https://kooperativa.io/api-keys).

Add the server to your MCP client's configuration:

```json
{
  "mcpServers": {
    "kooperativa": {
      "command": "npx",
      "args": ["-y", "@kooperativa_team/mcp-server"],
      "env": {
        "KOOPERATIVA_API_KEY": "kk_live_..."
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
| `kooperativa_enrich_company` | `GET /company` | Full company profile lookup |
| `kooperativa_enrich_company_realtime` | `GET /company/realtime` | Same, but from the live source. **$0.001 per call**, see [Billing](#billing) |
| `kooperativa_check_company` | `GET /company/check` | Cheap existence check before a full lookup |
| `kooperativa_search_companies` | `POST /companies/search` | Filtered search across the company data lake |
| `kooperativa_company_current_employees` | `GET /company/current-employees` | People currently at a company |
| `kooperativa_company_past_employees` | `GET /company/past-employees` | People who used to work at a company |
| `kooperativa_company_headcount_by_seniority` | `GET /company/headcount-by-seniority` | Indexed headcount breakdown |
| `kooperativa_company_hiring_signals` | `GET /company/hiring-signals` | Recently joined employees |
| `kooperativa_list_monitors` | `GET /monitors` | List active webhook monitors |
| `kooperativa_create_monitor` | `POST /monitors` | Subscribe to change events on a profile/company |
| `kooperativa_delete_monitor` | `DELETE /monitors` | Remove a webhook monitor |

Full parameter reference: [docs.kooperativa.io](https://docs.kooperativa.io).

## Billing

Every tool above is included in the workspace license, with no per-call charge, except the two realtime ones. Those read from the live source rather than from the Kooperativa data lake, and are metered at **$0.001 per call** on top of the license, which is still required.

This matters more here than in a hand-written integration, because the model decides when to call a tool. Three things follow from that:

- **A miss still costs.** A call is billed whenever the live source actually answered, so a not-found result costs the same as a hit, because the lookup happened either way. Only a `503`, meaning the source could not be reached at all, is not billed.
- **There is no cache.** Two realtime calls for the same person bill twice. The result is written back to the data lake, so the free `kooperativa_enrich_person` returns it afterwards at no cost.
- **The tool descriptions carry the price**, so an agent choosing between the free and metered variant has the cost in front of it. If you wrap this server in your own agent, keep that wording rather than trimming the descriptions for brevity.

If you want to rule out metered spend entirely, do not expose the two `*_realtime` tools to the model.

## Authentication

The server reads `KOOPERATIVA_API_KEY` from the environment. It is never logged, hardcoded, or transmitted anywhere other than as the `Authorization: Bearer` header on requests to `https://kooperativa.io/api/v1`.

## License

MIT

## Support

support@kooperativa.io
