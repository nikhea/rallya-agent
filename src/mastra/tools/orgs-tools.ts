import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getRallyaClient } from "../utils/rallya-client.js";
import {
  customRoleSchema,
  messageSchema,
  orgInviteSchema,
  orgMemberSchema,
  orgSchema,
  pageSchema,
} from "../utils/rallya-schemas.js";

const pageQuery = {
  page: z.number().int().min(1).optional().describe("Page number, defaults to 1"),
  perPage: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Items per page, server default 20, max 100"),
};

const orgRef = "Org UUID or slug (slugs are the short human-readable identifier, e.g. 'acme')";

export const createOrgTool = createTool({
  id: "rallya-create-org",
  description:
    "Create a new Rallya organization (workspace). Use when a user wants to set up a new team or company on Rallya — the caller becomes the OWNER of the new org. " +
    "Accepts an optional URL-friendly slug (auto-derived from the name when omitted) and an optional logo URL. " +
    "Returns the created org including its id, slug, the caller's role, and creation timestamp. Requires user authentication.",
  inputSchema: z.object({
    name: z.string().describe("Organization display name, e.g. 'Acme Inc'"),
    slug: z.string().optional().describe("URL-friendly unique slug, e.g. 'acme'. Auto-derived from the name if omitted."),
    logo: z.string().optional().describe("Public logo image URL"),
  }),
  outputSchema: orgSchema,
  execute: async ({ name, slug, logo }) => {
    const client = getRallyaClient();
    return await client.orgs.create({ name, slug, logo });
  },
});

export const listMyOrgsTool = createTool({
  id: "rallya-list-my-orgs",
  description:
    "List every organization the current user is a member of. Use this first when the user refers to 'my org' or you need an org identifier for other tools — each entry includes the caller's role (OWNER, ADMIN, MEMBER) in that org. " +
    "Returns an array of orgs; an empty array means the user belongs to no organization yet.",
  inputSchema: z.object({}),
  outputSchema: z.array(orgSchema),
  execute: async () => {
    const client = getRallyaClient();
    return await client.orgs.listMine();
  },
});

export const getOrgTool = createTool({
  id: "rallya-get-org",
  description:
    "Fetch a single organization by UUID or slug. Use when you need the org's current name, slug, logo, your role in it, or to verify it exists before running org-scoped operations. " +
    "Note: a 404-style failure means the org does not exist OR the caller has no access (the API hides the difference).",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
  }),
  outputSchema: orgSchema,
  execute: async ({ org }) => {
    const client = getRallyaClient();
    return await client.orgs.get(org);
  },
});

export const updateOrgTool = createTool({
  id: "rallya-update-org",
  description:
    "Update an organization's display name, slug, or logo. Use for renames or rebranding; only include the fields that should change. " +
    "Changing the slug changes the identifier used in URLs, so prefer confirming with the user first. Returns the updated org.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    name: z.string().optional().describe("New display name"),
    slug: z.string().optional().describe("New URL-friendly slug"),
    logo: z.string().optional().describe("New logo image URL"),
  }),
  outputSchema: orgSchema,
  execute: async ({ org, name, slug, logo }) => {
    const client = getRallyaClient();
    return await client.orgs.update(org, { name, slug, logo });
  },
});

export const removeOrgTool = createTool({
  id: "rallya-remove-org",
  description:
    "Permanently delete an organization and everything under it. Destructive and irreversible — only use after explicit user confirmation. " +
    "Requires the OWNER role. Returns a deletion confirmation.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
  }),
  outputSchema: z.object({ deleted: z.boolean(), org: z.string() }),
  execute: async ({ org }) => {
    const client = getRallyaClient();
    await client.orgs.remove(org);
    return { deleted: true, org };
  },
});

export const listOrgMembersTool = createTool({
  id: "rallya-list-org-members",
  description:
    "List the members of an organization with pagination. Use to see who belongs to an org, their roles, join dates, and email-verification state — e.g. before changing someone's role or auditing access. " +
    "Returns a paginated envelope with items, total, page, and perPage.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    ...pageQuery,
  }),
  outputSchema: pageSchema(orgMemberSchema),
  execute: async ({ org, page, perPage }) => {
    const client = getRallyaClient();
    return await client.orgs.listMembers(org, { page, perPage });
  },
});

export const addOrgMemberTool = createTool({
  id: "rallya-add-org-member",
  description:
    "Directly add an existing Rallya user to an organization by email, bypassing the invite flow. " +
    "Prefer the invite tool when the person may not have an account yet; use this when you know they are already registered and should get immediate access. " +
    "Accepts an optional role (OWNER, ADMIN, MEMBER). Returns the created membership record.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    email: z.string().email().describe("Email of the user to add"),
    role: z.string().optional().describe("Role to grant: OWNER, ADMIN, or MEMBER (defaults server-side)"),
  }),
  outputSchema: orgMemberSchema,
  execute: async ({ org, email, role }) => {
    const client = getRallyaClient();
    return await client.orgs.addMember(org, { email, role });
  },
});

export const updateOrgMemberRoleTool = createTool({
  id: "rallya-update-org-member-role",
  description:
    "Change a member's built-in role (OWNER, ADMIN, MEMBER) within an organization. Use for promotions or demotions; for fine-grained custom roles use the role-assign tool instead. " +
    "You need the member's user UUID — list members first if you only have their email. Returns the updated membership.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    userId: z.string().describe("Member's user UUID (see list-org-members)"),
    role: z.string().describe("New built-in role: OWNER, ADMIN, or MEMBER"),
  }),
  outputSchema: orgMemberSchema,
  execute: async ({ org, userId, role }) => {
    const client = getRallyaClient();
    return await client.orgs.updateMemberRole(org, userId, role);
  },
});

export const removeOrgMemberTool = createTool({
  id: "rallya-remove-org-member",
  description:
    "Remove a member from an organization, revoking their access immediately. Use when someone leaves the team or was added by mistake. " +
    "Takes the member's user UUID (list members first if needed). Returns a removal confirmation.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    userId: z.string().describe("Member's user UUID (see list-org-members)"),
  }),
  outputSchema: z.object({ removed: z.boolean(), org: z.string(), userId: z.string() }),
  execute: async ({ org, userId }) => {
    const client = getRallyaClient();
    await client.orgs.removeMember(org, userId);
    return { removed: true, org, userId };
  },
});

export const inviteOrgMemberTool = createTool({
  id: "rallya-invite-org-member",
  description:
    "Invite someone to an organization by email. Use this (rather than direct add) when the person may not have a Rallya account yet — they receive an invite token to accept or decline. " +
    "Accepts an optional role for the invite. Returns a confirmation message " +
    "({ message: 'Invite sent' }) — the invite id is NOT returned here; use list-org-invites to find it for revocation.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    email: z.string().email().describe("Email address to invite"),
    role: z.string().optional().describe("Role the invite grants, e.g. MEMBER or ADMIN"),
  }),
  outputSchema: messageSchema,
  execute: async ({ org, email, role }) => {
    const client = getRallyaClient();
    // NOTE: the SDK types this as OrgInvite, but the wire returns { message: "Invite sent" }.
    return (await client.orgs.invite(org, { email, role })) as unknown as { message: string };
  },
});

export const listOrgInvitesTool = createTool({
  id: "rallya-list-org-invites",
  description:
    "List outstanding (pending) invites for an organization. Use to check who has been invited but not yet joined, to find an invite id for revocation, or to follow up on stale invites. " +
    "Returns a paginated envelope of invites with email, role, and expiry.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    ...pageQuery,
  }),
  outputSchema: pageSchema(orgInviteSchema),
  execute: async ({ org, page, perPage }) => {
    const client = getRallyaClient();
    return await client.orgs.listInvites(org, { page, perPage });
  },
});

export const revokeOrgInviteTool = createTool({
  id: "rallya-revoke-org-invite",
  description:
    "Revoke (cancel) a pending organization invite so its token can no longer be accepted. Use when an invite was sent to the wrong address or is no longer wanted. " +
    "Takes the invite UUID from the invite list. Returns a revocation confirmation.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    inviteId: z.string().describe("Invite UUID (see list-org-invites)"),
  }),
  outputSchema: z.object({ revoked: z.boolean(), inviteId: z.string() }),
  execute: async ({ org, inviteId }) => {
    const client = getRallyaClient();
    await client.orgs.revokeInvite(org, inviteId);
    return { revoked: true, inviteId };
  },
});

export const acceptOrgInviteTool = createTool({
  id: "rallya-accept-org-invite",
  description:
    "Accept an organization invite using its token, joining the org. Use when the current user received an invite (e.g. via email) and wants to join. " +
    "The token is the secret from the invitation, not the invite id. Returns a confirmation message.",
  inputSchema: z.object({
    token: z.string().describe("Invite token from the invitation"),
  }),
  outputSchema: messageSchema,
  execute: async ({ token }) => {
    const client = getRallyaClient();
    return await client.orgs.acceptInvite(token);
  },
});

export const declineOrgInviteTool = createTool({
  id: "rallya-decline-org-invite",
  description:
    "Decline an organization invite using its token. Use when the current user does not want to join the inviting org. " +
    "Returns a confirmation message.",
  inputSchema: z.object({
    token: z.string().describe("Invite token from the invitation"),
  }),
  outputSchema: messageSchema,
  execute: async ({ token }) => {
    const client = getRallyaClient();
    return await client.orgs.declineInvite(token);
  },
});

export const listOrgRolesTool = createTool({
  id: "rallya-list-org-roles",
  description:
    "List the custom roles defined for an organization. Custom roles are named bundles of object:action permissions (e.g. a 'door' role with checkin:create) used for fine-grained access beyond OWNER/ADMIN/MEMBER. " +
    "Use before assigning a role to see what exists. Returns an array of roles with permissions and holder counts.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
  }),
  outputSchema: z.array(customRoleSchema),
  execute: async ({ org }) => {
    const client = getRallyaClient();
    return await client.orgs.listRoles(org);
  },
});

export const defineOrgRoleTool = createTool({
  id: "rallya-define-org-role",
  description:
    "Define a new custom role in an organization as a named set of object:action permissions — e.g. name 'door' with [{ object: 'checkin', action: 'create' }] for door-tablet staff. " +
    "Unknown permission pairs are rejected by the server. Returns the created role. Assign it to users with the assign tool.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    name: z.string().describe("Role name, e.g. 'door'"),
    permissions: z
      .array(z.object({ object: z.string(), action: z.string() }))
      .describe("Permission grants, e.g. [{ object: 'checkin', action: 'create' }]"),
  }),
  outputSchema: customRoleSchema,
  execute: async ({ org, name, permissions }) => {
    const client = getRallyaClient();
    return await client.orgs.defineRole(org, { name, permissions });
  },
});

export const updateOrgRoleTool = createTool({
  id: "rallya-update-org-role",
  description:
    "Replace the permission set of an existing custom org role. Use when a role needs more or fewer capabilities; the update is a full replacement, not a merge, so include the complete desired permission list. " +
    "Returns the updated role.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    role: z.string().describe("Role name or id"),
    permissions: z
      .array(z.object({ object: z.string(), action: z.string() }))
      .describe("Complete new permission list"),
  }),
  outputSchema: customRoleSchema,
  execute: async ({ org, role, permissions }) => {
    const client = getRallyaClient();
    return await client.orgs.updateRole(org, role, permissions);
  },
});

export const deleteOrgRoleTool = createTool({
  id: "rallya-delete-org-role",
  description:
    "Delete a custom org role. Only use when no one should hold it anymore — check holder counts via the role list first. " +
    "Returns a deletion confirmation.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    role: z.string().describe("Role name or id"),
  }),
  outputSchema: z.object({ deleted: z.boolean(), role: z.string() }),
  execute: async ({ org, role }) => {
    const client = getRallyaClient();
    await client.orgs.deleteRole(org, role);
    return { deleted: true, role };
  },
});

export const assignOrgRoleTool = createTool({
  id: "rallya-assign-org-role",
  description:
    "Assign a custom role to a user in an organization, granting its permissions on top of their built-in role. " +
    "Use for least-privilege access such as giving door staff check-in rights. Takes the role name/id and the user's UUID. Returns an assignment confirmation.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    role: z.string().describe("Role name or id (see list-org-roles)"),
    userId: z.string().describe("User UUID (see list-org-members)"),
  }),
  outputSchema: z.object({ assigned: z.boolean(), role: z.string(), userId: z.string() }),
  execute: async ({ org, role, userId }) => {
    const client = getRallyaClient();
    await client.orgs.assignRole(org, role, userId);
    return { assigned: true, role, userId };
  },
});

export const unassignOrgRoleTool = createTool({
  id: "rallya-unassign-org-role",
  description:
    "Remove a custom role from a user in an organization, revoking its extra permissions (their built-in OWNER/ADMIN/MEMBER role is unaffected). " +
    "Returns an unassignment confirmation.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    role: z.string().describe("Role name or id"),
    userId: z.string().describe("User UUID"),
  }),
  outputSchema: z.object({ unassigned: z.boolean(), role: z.string(), userId: z.string() }),
  execute: async ({ org, role, userId }) => {
    const client = getRallyaClient();
    await client.orgs.unassignRole(org, role, userId);
    return { unassigned: true, role, userId };
  },
});

export const orgTools = {
  createOrgTool,
  listMyOrgsTool,
  getOrgTool,
  updateOrgTool,
  removeOrgTool,
  listOrgMembersTool,
  addOrgMemberTool,
  updateOrgMemberRoleTool,
  removeOrgMemberTool,
  inviteOrgMemberTool,
  listOrgInvitesTool,
  revokeOrgInviteTool,
  acceptOrgInviteTool,
  declineOrgInviteTool,
  listOrgRolesTool,
  defineOrgRoleTool,
  updateOrgRoleTool,
  deleteOrgRoleTool,
  assignOrgRoleTool,
  unassignOrgRoleTool,
};
