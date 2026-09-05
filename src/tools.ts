/**
 * Tool registrations for the Kooperativa MCP server.
 *
 * One tool per Kooperativa API endpoint (see https://docs.kooperativa.io). Descriptions
 * are written for the model calling the tool, not for a human reading docs.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { kooperativa, KooperativaApiError } from "./client.js";

/** Wraps a handler so thrown KooperativaApiError / Error become a proper MCP tool error result. */
function withErrorHandling<Args extends unknown[], T>(fn: (...args: Args) => Promise<T>) {
  return async (...args: Args) => {
    try {
      const data = await fn(...args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    } catch (err) {
      const message =
        err instanceof KooperativaApiError
          ? `Kooperativa API error (${err.status}${err.code ? ` ${err.code}` : ""}): ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      return {
        content: [{ type: "text" as const, text: message }],
        isError: true,
      };
    }
  };
}

const seniorityEnum = z.enum(["c-level", "vp", "director", "manager"]);

export function registerKooperativaTools(server: McpServer) {
  // ── Account ──────────────────────────────────────────────────────────

  server.registerTool(
    "kooperativa_account_info",
    {
      title: "Kooperativa: account info",
      description:
        "Get the authenticated Kooperativa account's email, license status (active/plan/expiry), and API usage this month/today, broken down by endpoint. Call this first if you're unsure whether the license is active before running a large batch job.",
      inputSchema: {},
    },
    withErrorHandling(() => kooperativa.get("/me")),
  );

  server.registerTool(
    "kooperativa_health_check",
    {
      title: "Kooperativa: health check",
      description:
        "Simple liveness probe for the Kooperativa API. No authentication required. Use to verify connectivity before running a batch job.",
      inputSchema: {},
    },
    withErrorHandling(() => kooperativa.get("/health")),
  );

  // ── People ───────────────────────────────────────────────────────────

  server.registerTool(
    "kooperativa_enrich_person",
    {
      title: "Kooperativa: enrich person",
      description:
        "Look up a person's full professional profile (work history, education, skills, certifications, honors, publications, volunteering) from the Kooperativa data lake. Provide exactly one of linkedin_url, username, or id. Returns 404 if the profile hasn't been indexed yet (no on-demand live scrape).",
      inputSchema: {
        linkedin_url: z
          .string()
          .optional()
          .describe("Full profile URL, e.g. https://www.linkedin.com/in/satyanadella"),
        username: z.string().optional().describe("Profile slug, the part after /in/. Fastest lookup."),
        id: z.string().optional().describe("Kooperativa internal profile ID, from a previous search/enrich call."),
      },
    },
    withErrorHandling((args: any) => kooperativa.get("/person", args)),
  );

  server.registerTool(
    "kooperativa_check_person",
    {
      title: "Kooperativa: check person exists",
      description:
        "Cheaply check whether Kooperativa already holds a given profile, without fetching the full record. Returns the matched id, full_name, and fetched_at on success, or 404 if not indexed yet. Use this to filter a list before calling enrich_person on each one.",
      inputSchema: {
        linkedin_url: z.string().optional().describe("Full profile URL."),
        username: z.string().optional().describe("Profile slug, the part after /in/."),
        id: z.string().optional().describe("Kooperativa internal profile ID."),
      },
    },
    withErrorHandling((args: any) => kooperativa.get("/person/check", args)),
  );

  server.registerTool(
    "kooperativa_search_people",
    {
      title: "Kooperativa: search people",
      description:
        "Search the Kooperativa data lake of professional profiles using any combination of filters (title, company, location, industry, seniority, headcount, skills, tenure, recent job change, past employer, education). Filters combine with AND logic. Returns lightweight profile previews with pagination; pass a result's id to kooperativa_enrich_person for the full record.",
      inputSchema: {
        query: z.string().optional().describe("Full-text search across name, title, and company."),
        title: z
          .string()
          .optional()
          .describe("Job title keywords, e.g. 'VP of Sales'. Multiple space-separated words match with OR."),
        company: z.string().optional().describe("Current company name, exact match. Prefer company_id when known."),
        company_id: z.string().optional().describe("Company ID, exact match, preferred over company."),
        location: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            "ISO 2-letter country code(s), e.g. 'US' or ['US','CA','GB']. Full country names return 0 results.",
          ),
        city: z.string().optional(),
        industry: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            "Exact industry name(s) as stored on the profile, e.g. 'Computer Software', 'Financial Services'.",
          ),
        seniority: seniorityEnum.optional(),
        headcount: z
          .string()
          .optional()
          .describe("Current company's employee-count range, exact match, e.g. '51 - 200'."),
        is_premium: z.boolean().optional(),
        is_top_voice: z.boolean().optional(),
        is_creator: z.boolean().optional(),
        skills: z.array(z.string()).optional().describe("Match people who list any of these skills (OR)."),
        tenure_min_months: z
          .number()
          .int()
          .optional()
          .describe("Only people who have held their current role for at least this many months."),
        job_changed_after: z
          .number()
          .int()
          .optional()
          .describe("Unix timestamp (seconds). Only people whose current role started after this time."),
        exclude_companies: z.array(z.string()).optional().describe("Hide people currently at any of these companies."),
        exclude_industries: z.array(z.string()).optional().describe("Hide people whose current industry is any of these."),
        past_company: z.string().optional().describe("Match people who previously worked at this company."),
        education: z.string().optional().describe("School/university name."),
        linkedin_url: z.string().optional().describe("Exact profile URL, resolves to a single person."),
        page: z.number().int().default(1).optional(),
        per_page: z.number().int().max(50).default(10).optional(),
      },
    },
    withErrorHandling((args: any) => kooperativa.post("/people/search", args)),
  );

  server.registerTool(
    "kooperativa_bulk_enrich_people",
    {
      title: "Kooperativa: bulk enrich people",
      description:
        "Enrich up to 100 profiles in a single call. Pass an array where each item has exactly one of id, username, or linkedin_url. Unmatched identifiers are silently skipped and counted in not_found.",
      inputSchema: {
        profiles: z
          .array(
            z.object({
              id: z.string().optional(),
              username: z.string().optional(),
              linkedin_url: z.string().optional(),
            }),
          )
          .max(100)
          .describe("Up to 100 identifiers, each with exactly one of id / username / linkedin_url."),
      },
    },
    withErrorHandling((args: any) => kooperativa.post("/people/bulk-enrich", args)),
  );

  server.registerTool(
    "kooperativa_person_colleagues",
    {
      title: "Kooperativa: person colleagues",
      description:
        "List a person's current colleagues (everyone else working at their current company right now). Useful for mapping org structure or finding an alternate contact at a target account. Requires the Kooperativa profile id (from enrich_person or search_people).",
      inputSchema: {
        id: z.string().describe("Kooperativa profile ID."),
        page: z.number().int().default(1).optional(),
        per_page: z.number().int().max(100).default(25).optional(),
      },
    },
    withErrorHandling((args: any) => kooperativa.get("/person/colleagues", args)),
  );

  server.registerTool(
    "kooperativa_person_similar",
    {
      title: "Kooperativa: similar people",
      description:
        "Find people similar to a given person (same seniority, industry, and country), excluding themselves. Useful for lookalike audiences or finding alternative contacts at competing companies. Requires the Kooperativa profile id.",
      inputSchema: {
        id: z.string().describe("Kooperativa profile ID."),
        page: z.number().int().default(1).optional(),
        per_page: z.number().int().max(100).default(25).optional(),
      },
    },
    withErrorHandling((args: any) => kooperativa.get("/person/similar", args)),
  );

  server.registerTool(
    "kooperativa_person_job_changes",
    {
      title: "Kooperativa: recent job changes",
      description:
        "People who recently started a new job — a strong outreach signal (new role = new budget, new vendor decisions). Optionally filter to people who previously worked at a specific company_id. Sorted most-recent-first.",
      inputSchema: {
        days: z
          .number()
          .int()
          .min(1)
          .max(365)
          .default(90)
          .optional()
          .describe("Lookback window in days, default 90, max 365."),
        company_id: z.string().optional().describe("Filter to people who previously worked at this company."),
        page: z.number().int().default(1).optional(),
        per_page: z.number().int().max(100).default(25).optional(),
      },
    },
    withErrorHandling((args: any) => kooperativa.get("/person/job-changes", args)),
  );

  // ── Companies ────────────────────────────────────────────────────────

  server.registerTool(
    "kooperativa_enrich_company",
    {
      title: "Kooperativa: enrich company",
      description:
        "Look up a company's full profile (headcount, follower count, founding year, HQ address, industries, specialities, office locations) from the Kooperativa data lake. Provide exactly one of linkedin_url, username, company_id, or id. Returns 404 if not indexed yet.",
      inputSchema: {
        linkedin_url: z
          .string()
          .optional()
          .describe("Full company profile URL, e.g. https://www.linkedin.com/company/argus-media"),
        username: z.string().optional().describe("Company slug, the part after /company/. Fastest lookup."),
        company_id: z.string().optional().describe("Numeric company ID."),
        id: z.string().optional().describe("Kooperativa internal company ID."),
      },
    },
    withErrorHandling((args: any) => kooperativa.get("/company", args)),
  );

  server.registerTool(
    "kooperativa_check_company",
    {
      title: "Kooperativa: check company exists",
      description:
        "Cheaply check whether Kooperativa already holds a given company, without fetching the full record. Returns matched id, name, and fetched_at on success, or 404 if not indexed yet.",
      inputSchema: {
        linkedin_url: z.string().optional().describe("Full company profile URL."),
        username: z.string().optional().describe("Company slug, the part after /company/."),
        company_id: z.string().optional().describe("Numeric company ID."),
        id: z.string().optional().describe("Kooperativa internal company ID."),
      },
    },
    withErrorHandling((args: any) => kooperativa.get("/company/check", args)),
  );

  server.registerTool(
    "kooperativa_search_companies",
    {
      title: "Kooperativa: search companies",
      description:
        "Search the Kooperativa data lake of companies by name, HQ location, industry, and headcount range. All filters are optional and combine with AND logic, but at least one filter is required. min_staff/max_staff are both inclusive and either can be omitted.",
      inputSchema: {
        query: z.string().optional().describe("Full-text search across company name and tagline."),
        country: z.string().optional().describe("HQ country code, ISO 2-letter, e.g. 'US'. Full names return 0 results."),
        city: z.string().optional().describe("HQ city name."),
        industry: z
          .string()
          .optional()
          .describe(
            "Exact industry label using the company taxonomy (differs from /people/search industry values), e.g. 'Software Development'.",
          ),
        min_staff: z.number().int().optional().describe("Minimum employee count, inclusive."),
        max_staff: z.number().int().optional().describe("Maximum employee count, inclusive."),
        page: z.number().int().default(1).optional(),
        per_page: z.number().int().max(50).default(10).optional(),
      },
    },
    withErrorHandling((args: any) => kooperativa.post("/companies/search", args)),
  );

  server.registerTool(
    "kooperativa_company_current_employees",
    {
      title: "Kooperativa: company current employees",
      description:
        "List people currently working at a company, by its numeric company_id. Returns lightweight profile previews with offset pagination (total/pages). Pass a result's id to kooperativa_enrich_person for the full record.",
      inputSchema: {
        company_id: z.string().describe("Numeric company ID (from enrich_company or search_companies)."),
        page: z.number().int().default(1).optional(),
        per_page: z.number().int().max(100).default(25).optional(),
      },
    },
    withErrorHandling((args: any) => kooperativa.get("/company/current-employees", args)),
  );

  server.registerTool(
    "kooperativa_company_past_employees",
    {
      title: "Kooperativa: company past employees",
      description:
        "List people who previously worked at a company (held a role there, since moved on), by numeric company_id. Each result includes a past_positions array with the specific role(s) held there. Uses has_more/next_page pagination.",
      inputSchema: {
        company_id: z.string().describe("Numeric company ID (from enrich_company or search_companies)."),
        page: z.number().int().default(1).optional(),
        per_page: z.number().int().max(100).default(25).optional(),
      },
    },
    withErrorHandling((args: any) => kooperativa.get("/company/past-employees", args)),
  );

  server.registerTool(
    "kooperativa_company_headcount_by_seniority",
    {
      title: "Kooperativa: company headcount by seniority",
      description:
        "Breakdown of a company's indexed profiles by seniority level (c-level, vp, director, manager, individual). Useful for org intelligence and account qualification. Counts reflect only Kooperativa's indexed profiles, not the company's real total headcount.",
      inputSchema: {
        company_id: z.string().describe("Numeric company ID."),
      },
    },
    withErrorHandling((args: any) => kooperativa.get("/company/headcount-by-seniority", args)),
  );

  server.registerTool(
    "kooperativa_company_hiring_signals",
    {
      title: "Kooperativa: company hiring signals",
      description:
        "People who recently joined a company — a signal of growth, investment, or expansion. Sorted by join date descending, look-back window configurable in days (default 90, max 365).",
      inputSchema: {
        company_id: z.string().describe("Numeric company ID."),
        days: z.number().int().max(365).default(90).optional().describe("Look-back window in days."),
        page: z.number().int().default(1).optional(),
        per_page: z.number().int().max(100).default(25).optional(),
      },
    },
    withErrorHandling((args: any) => kooperativa.get("/company/hiring-signals", args)),
  );

  // ── Monitors (webhooks) ──────────────────────────────────────────────

  server.registerTool(
    "kooperativa_list_monitors",
    {
      title: "Kooperativa: list monitors",
      description: "List all active webhook monitors for the authenticated workspace.",
      inputSchema: {},
    },
    withErrorHandling(() => kooperativa.get("/monitors")),
  );

  server.registerTool(
    "kooperativa_create_monitor",
    {
      title: "Kooperativa: create monitor",
      description:
        "Subscribe to change events on a professional profile or company URL. Kooperativa sends a signed POST to webhook_url whenever a change is detected (job change, title change, headline change, location change, skills change for people; staff count or description change for companies). webhook_url must be HTTPS. The returned webhook_secret for signature verification is only shown once, at creation time.",
      inputSchema: {
        type: z.enum(["person", "company"]).describe("What kind of entity to monitor."),
        subject_url: z.string().describe("Full profile or company URL to monitor."),
        webhook_url: z.string().describe("HTTPS endpoint that will receive change events."),
        label: z.string().optional().describe("Optional human-readable name for this monitor."),
        events: z
          .array(z.string())
          .optional()
          .describe(
            "Event types to subscribe to, e.g. ['person.job_changed','person.title_changed']. Defaults to all events for the given type if omitted.",
          ),
      },
    },
    withErrorHandling((args: any) => kooperativa.post("/monitors", args)),
  );

  server.registerTool(
    "kooperativa_delete_monitor",
    {
      title: "Kooperativa: delete monitor",
      description: "Stop monitoring a profile or company and delete the monitor by its ID.",
      inputSchema: {
        id: z.string().describe("Monitor ID to delete (UUID)."),
      },
    },
    withErrorHandling((args: any) => kooperativa.del("/monitors", args)),
  );
}
