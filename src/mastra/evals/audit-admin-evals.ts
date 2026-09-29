import type { EvalCase } from "./cases.js";

/** Audit + admin cases: read-only inspection and health probes. */
export const auditAdminCases: EvalCase[] = [
  {
    id: "audit/org-audit",
    domain: "audit-admin",
    prompt: "Show the recent audit log for org acme.",
    expectedTools: ["rallya-list-org-audit"],
    notes: "Org audit reads the org-scoped log.",
  },
  {
    id: "audit/platform-audit",
    domain: "audit-admin",
    prompt: "Show recent platform-wide audit events.",
    expectedTools: ["rallya-list-platform-audit"],
    notes: "Platform audit reads the global log, not the org one.",
  },
  {
    id: "audit/list-admin-orgs",
    domain: "audit-admin",
    prompt: "List all organizations on the platform (admin view).",
    expectedTools: ["rallya-list-admin-orgs"],
    forbiddenTools: ["rallya-remove-org"],
    notes: "Admin listing stays read-only.",
  },
  {
    id: "audit/get-admin-org",
    domain: "audit-admin",
    prompt: "Show admin details for org acme.",
    expectedTools: ["rallya-get-admin-org"],
    forbiddenTools: ["rallya-update-org", "rallya-remove-org"],
    notes: "Admin detail reads stay read-only.",
  },
  {
    id: "audit/search-users",
    domain: "audit-admin",
    prompt: "Find the user jane@example.com (admin search).",
    expectedTools: ["rallya-search-admin-users"],
    notes: "User lookup uses admin search.",
  },
  {
    id: "audit/get-user",
    domain: "audit-admin",
    prompt: "Show admin details for user user_123.",
    expectedTools: ["rallya-get-admin-user"],
    notes: "User detail reads stay read-only.",
  },
  {
    id: "audit/health-live",
    domain: "audit-admin",
    prompt: "Is the Rallya API alive?",
    expectedTools: ["rallya-health-live"],
    notes: "Liveness probe maps to health-live.",
  },
  {
    id: "audit/health-hello",
    domain: "audit-admin",
    prompt: "Ping the Rallya API hello endpoint.",
    expectedTools: ["rallya-health-hello"],
    forbiddenTools: ["rallya-health-live"],
    notes: "Hello and live probes are distinct endpoints.",
  },
];
