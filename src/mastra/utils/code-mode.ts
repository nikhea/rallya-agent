import { createCodeMode } from "@mastra/core/tools";
import { QuickJsCodeModeTransport } from "@mastra/quickjs";
import { getMyProfileTool, authTools } from "../tools/auth-tools.js";
import { orgTools } from "../tools/orgs-tools.js";
import { eventTools } from "../tools/events-tools.js";
import { ticketTools } from "../tools/tickets-tools.js";
import { orderTools } from "../tools/orders-tools.js";
import { paymentTools } from "../tools/payments-tools.js";
import { attendeeTools } from "../tools/attendees-tools.js";
import { checkinTools } from "../tools/checkin-tools.js";
import { kitTools } from "../tools/kits-tools.js";
import { subscriptionTools } from "../tools/subscriptions-tools.js";
import { auditAdminTools, listOrgAuditTool } from "../tools/audit-admin-tools.js";

/**
 * Code Mode (QuickJS) setup for the Rallya tools.
 *
 * Code Mode lets an agent answer multi-tool questions with ONE tool call:
 * the model writes a small TypeScript program that orchestrates the
 * allow-listed tools as `external_*` functions (parallelizable with
 * `Promise.all`), does math/filtering in JS, and returns a single
 * aggregated result — instead of looping one-tool-per-turn.
 *
 * This module is provider-independent ("plug and play"): it only binds
 * tools + an execution transport, never a model. Attach the returned
 * `{ tool, instructions }` to ANY agent regardless of its provider:
 *
 * ```ts
 * import { Agent } from "@mastra/core/agent";
 * import { rallyaSalesCode, rallyaDoorCode } from "./utils/code-mode.js";
 *
 * export const myAgent = new Agent({
 *   id: "my-agent",
 *   name: "My Agent",
 *   instructions: ["You are helpful.", rallyaSalesCode.instructions, rallyaDoorCode.instructions],
 *   model: "openai/gpt-5-mini", // <- any provider works: openai, anthropic, google, xai, ...
 *   tools: {
 *     rallya_sales_code: rallyaSalesCode.tool,
 *     rallya_door_code: rallyaDoorCode.tool,
 *   },
 * });
 * ```
 *
 * Execution runs in-process inside a QuickJS runtime compiled to
 * WebAssembly — no sandbox, no native binaries, no Node flags needed.
 * Model-authored code has zero capabilities except the `external_*`
 * functions, which execute the REAL tools on the host (with validation,
 * tracing, and auth). Each run gets a fresh runtime that is disposed
 * afterwards. Tune via env: RALLYA_CODEMODE_MEMORY_MB (default 128),
 * RALLYA_CODEMODE_TIMEOUT_MS (default 30000).
 */

type CodeModeTools = Parameters<typeof createCodeMode>[0]["tools"];

export interface QuickJsCodeModeOptions {
  /** Distinct id per code tool (default: `execute_typescript`). Required when an agent holds several. */
  id?: string;
  /** Allow-list: only these tools are callable as `external_*` from generated code. */
  tools: CodeModeTools;
  /** QuickJS heap limit in MiB. Default 128 (or RALLYA_CODEMODE_MEMORY_MB). */
  memoryLimitMb?: number;
  /** QuickJS stack limit in bytes. Default 256 KiB — leave alone unless you know why. */
  maxStackSizeBytes?: number;
  /** Execution timeout in ms. Default 30000 (or RALLYA_CODEMODE_TIMEOUT_MS). */
  timeout?: number;
}

function envPositiveInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Generic factory: build a QuickJS code-mode `{ tool, instructions }` pair
 * over any subset of tools. Provider-independent — attach to any agent.
 */
export function createQuickJsCodeMode({
  id,
  tools,
  memoryLimitMb,
  maxStackSizeBytes,
  timeout,
}: QuickJsCodeModeOptions) {
  return createCodeMode(
    {
      ...(id ? { id } : {}),
      tools,
      timeout: timeout ?? envPositiveInt("RALLYA_CODEMODE_TIMEOUT_MS", 30_000),
    },
    new QuickJsCodeModeTransport({
      memoryLimitMb: memoryLimitMb ?? envPositiveInt("RALLYA_CODEMODE_MEMORY_MB", 128),
      ...(maxStackSizeBytes ? { maxStackSizeBytes } : {}),
    })
  );
}

// --- Prebuilt scoped bundles over the Rallya tools ---
// Each scope is least-privilege: generated code can ONLY call the tools in
// its own bundle. Prefer these over the full bundle to keep the model's
// prompt surface small and prevent cross-domain actions.

/** Discovery → tickets → orders → Stripe checkout. For buyer-side flows ("find events, prices, buy"). */
export const rallyaSalesCode = createQuickJsCodeMode({
  id: "rallya_sales_code",
  tools: { ...eventTools, ...ticketTools, ...orderTools, ...paymentTools },
});

/** Roster → door check-in → kit handouts. For door/tablet and merch-desk ops. */
export const rallyaDoorCode = createQuickJsCodeMode({
  id: "rallya_door_code",
  tools: { ...attendeeTools, ...checkinTools, ...kitTools },
});

/** Org membership/roles → billing → org audit. For organizer management (excludes logout). */
export const rallyaManageCode = createQuickJsCodeMode({
  id: "rallya_manage_code",
  tools: { ...orgTools, ...subscriptionTools, getMyProfileTool, listOrgAuditTool },
});

/**
 * Everything (except auth logout + platform superadmin tools): use when one
 * agent must range across domains. Heavier prompt surface — prefer the
 * scoped bundles when the agent's job is narrower.
 */
const { logoutTool: _logout, ...safeAuthTools } = authTools;
const {
  listPlatformAuditTool: _platformAudit,
  listAdminOrgsTool: _adminOrgs,
  getAdminOrgTool: _getAdminOrg,
  searchAdminUsersTool: _searchAdminUsers,
  getAdminUserTool: _getAdminUser,
  ...safeAuditAdminTools
} = auditAdminTools;

export const rallyaFullCode = createQuickJsCodeMode({
  id: "rallya_full_code",
  tools: {
    ...safeAuthTools,
    ...orgTools,
    ...eventTools,
    ...ticketTools,
    ...orderTools,
    ...paymentTools,
    ...attendeeTools,
    ...checkinTools,
    ...kitTools,
    ...subscriptionTools,
    ...safeAuditAdminTools,
  },
});

/** All prebuilt bundles, keyed for spreading onto an agent. */
export const rallyaCodeModes = {
  rallya_sales_code: rallyaSalesCode,
  rallya_door_code: rallyaDoorCode,
  rallya_manage_code: rallyaManageCode,
  rallya_full_code: rallyaFullCode,
};
