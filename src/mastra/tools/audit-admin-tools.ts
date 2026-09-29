import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getRallyaClient } from "../utils/rallya-client.js";
import {
  adminOrgSummarySchema,
  auditEventSchema,
  healthLiveSchema,
  pageSchema,
  recordSchema,
} from "../utils/rallya-schemas.js";

const auditQuery = {
  action: z.string().optional().describe("Filter by action name, e.g. 'member.added'"),
  objectType: z.string().optional().describe("Filter by object type, e.g. 'event'"),
  objectId: z.string().optional().describe("Filter by object id"),
  actor: z.string().optional().describe("Filter by actor user UUID"),
  since: z.string().optional().describe("Only events at/after this ISO datetime"),
  until: z.string().optional().describe("Only events at/before this ISO datetime"),
  page: z.number().int().min(1).optional().describe("Page number, defaults to 1"),
  perPage: z.number().int().min(1).max(100).optional().describe("Items per page, default 20, max 100"),
};

export const listOrgAuditTool = createTool({
  id: "rallya-list-org-audit",
  description:
    "List the audit trail for an organization — who did what, to which object, and when (with before/after snapshots where recorded). " +
    "Use to answer 'who changed this', investigate suspicious activity, or review recent admin actions. Filter by action, object, actor, or time range. " +
    "Returns a paginated envelope of audit events. Requires org access.",
  inputSchema: z.object({
    org: z.string().describe("Org UUID or slug"),
    ...auditQuery,
  }),
  outputSchema: pageSchema(auditEventSchema),
  execute: async ({ org, ...query }) => {
    const client = getRallyaClient();
    return await client.audit.listOrg(org as string, query);
  },
});

export const listPlatformAuditTool = createTool({
  id: "rallya-list-platform-audit",
  description:
    "List audit events platform-wide across all organizations. Superadmin only — regular org API keys and members cannot use this. " +
    "Accepts the same filters as the org audit log plus an org filter. Returns a paginated envelope of audit events.",
  inputSchema: z.object({
    org: z.string().optional().describe("Narrow to one org"),
    ...auditQuery,
  }),
  outputSchema: pageSchema(auditEventSchema),
  execute: async ({ ...query }) => {
    const client = getRallyaClient();
    return await client.audit.listPlatform(query);
  },
});

export const listAdminOrgsTool = createTool({
  id: "rallya-list-admin-orgs",
  description:
    "List ALL organizations on the platform with member counts — the superadmin org directory. " +
    "Superadmin only (API keys can never call /admin/*). Use for platform administration, never for regular org workflows. Returns a paginated envelope.",
  inputSchema: z.object({
    page: z.number().int().min(1).optional(),
    perPage: z.number().int().min(1).max(100).optional(),
  }),
  outputSchema: pageSchema(adminOrgSummarySchema),
  execute: async ({ page, perPage }) => {
    const client = getRallyaClient();
    return await client.admin.listOrgs({ page, perPage });
  },
});

export const getAdminOrgTool = createTool({
  id: "rallya-get-admin-org",
  description:
    "Fetch platform-level detail for one organization by UUID, as seen by a superadmin. " +
    "Superadmin only. The payload shape is untyped by the SDK, so all fields are returned as-is. Prefer the regular get-org tool for org-scoped work.",
  inputSchema: z.object({
    orgId: z.string().describe("Org UUID"),
  }),
  outputSchema: recordSchema,
  execute: async ({ orgId }) => {
    const client = getRallyaClient();
    return (await client.admin.getOrg(orgId)) as Record<string, unknown>;
  },
});

export const searchAdminUsersTool = createTool({
  id: "rallya-search-admin-users",
  description:
    "Search platform users by email or name — the superadmin user directory. Superadmin only. " +
    "Use to find a user id for platform-level support or investigation. Returns a paginated envelope of user records (untyped payload).",
  inputSchema: z.object({
    q: z.string().optional().describe("Search query matching email or name"),
    page: z.number().int().min(1).optional(),
    perPage: z.number().int().min(1).max(100).optional(),
  }),
  outputSchema: pageSchema(recordSchema),
  execute: async ({ q, page, perPage }) => {
    const client = getRallyaClient();
    return (await client.admin.searchUsers({ q, page, perPage })) as {
      items: Record<string, unknown>[];
      total: number;
      page: number;
      perPage: number;
    };
  },
});

export const getAdminUserTool = createTool({
  id: "rallya-get-admin-user",
  description:
    "Fetch one platform user by id as a superadmin. Use after user search when you need full detail on a specific account. " +
    "The payload shape is untyped by the SDK, so all fields are returned as-is.",
  inputSchema: z.object({
    userId: z.string().describe("User UUID"),
  }),
  outputSchema: recordSchema,
  execute: async ({ userId }) => {
    const client = getRallyaClient();
    return (await client.admin.getUser(userId)) as Record<string, unknown>;
  },
});

export const healthLiveTool = createTool({
  id: "rallya-health-live",
  description:
    "Check that the Rallya API is alive. Hits GET <origin>/health, which lives outside /api/v1 and needs no authentication. " +
    "Use as a first connectivity diagnostic when other calls fail — if this fails, the server (not your credentials) is the problem. Returns { status, app }.",
  inputSchema: z.object({}),
  outputSchema: healthLiveSchema,
  execute: async () => {
    const client = getRallyaClient();
    return await client.health.live();
  },
});

export const healthHelloTool = createTool({
  id: "rallya-health-hello",
  description:
    "Call the public hello endpoint (no auth) — a lightweight second connectivity check that exercises the /api/v1 stack itself. " +
    "Use alongside health-live to distinguish 'server down' from 'API routing broken'. Returns the endpoint payload as-is.",
  inputSchema: z.object({}),
  outputSchema: recordSchema,
  execute: async () => {
    const client = getRallyaClient();
    return (await client.health.hello()) as Record<string, unknown>;
  },
});

export const auditAdminTools = {
  listOrgAuditTool,
  listPlatformAuditTool,
  listAdminOrgsTool,
  getAdminOrgTool,
  searchAdminUsersTool,
  getAdminUserTool,
  healthLiveTool,
  healthHelloTool,
};
