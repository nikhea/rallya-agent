import { ToolSearchProcessor } from "@mastra/core/processors";
import {
  orgTools,
  eventTools,
  ticketTools,
  orderTools,
  paymentTools,
  attendeeTools,
  checkinTools,
  kitTools,
  subscriptionTools,
  authTools,
  auditAdminTools,
} from "../tools/index.js";

/**
 * Runtime tool discovery over the Rallya tool library.
 *
 * With 60+ tools, handing them all to the model upfront burns context on
 * every turn. This processor instead exposes two meta-tools:
 *
 * - `search_tools` — find tools by keywords (e.g. "refund order", "door check-in")
 * - (skipped: `autoLoad` activates matches immediately, so no `load_tool` step)
 *
 * Discovered tools activate on the next turn. State lives in the
 * conversation (`storage: "context"`), so it survives server restarts and
 * needs no extra memory configuration.
 *
 * Attach to any agent that should range across Rallya domains:
 *
 * ```ts
 * import { rallyaToolSearch } from "./utils/tool-search.js";
 *
 * new Agent({
 *   instructions: ["...", "Use search_tools to find Rallya tools before calling them."],
 *   model: "openai/gpt-5-mini", // any provider works
 *   inputProcessors: [rallyaToolSearch],
 * });
 * ```
 *
 * Note: this covers the granular tools. The scoped QuickJS code-mode
 * bundles (`./code-mode.ts`) are a separate path — attach those directly
 * to agents whose job is multi-tool computation, since a code tool's
 * allow-list is fixed at construction and can't see dynamically loaded
 * tools.
 */
export const rallyaToolSearch = new ToolSearchProcessor({
  tools: {
    ...orgTools,
    ...eventTools,
    ...ticketTools,
    ...orderTools,
    ...paymentTools,
    ...attendeeTools,
    ...checkinTools,
    ...kitTools,
    ...subscriptionTools,
    ...authTools,
    ...auditAdminTools,
  },
  search: {
    topK: 5,
    minScore: 0.1,
    autoLoad: true,
  },
  storage: "context",
});
