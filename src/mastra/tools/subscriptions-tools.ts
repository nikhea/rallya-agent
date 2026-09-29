import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getRallyaClient } from "../utils/rallya-client.js";
import { checkoutResponseSchema, subscriptionSchema, subscriptionTierSchema } from "../utils/rallya-schemas.js";

const orgRef = "Org UUID or slug (slugs are the short human-readable identifier, e.g. 'acme')";

export const listSubscriptionPlansTool = createTool({
  id: "rallya-list-subscription-plans",
  description:
    "List the public subscription tier catalog: FREE, PRO, and SCALE with their quota limits (max events, members, attendees/event, kits/event), feature lists, and prices. " +
    "Use when a user asks about pricing, compares plans, or when an operation failed with 402 UPGRADE_REQUIRED and you need to explain the next tier up. No auth required.",
  inputSchema: z.object({}),
  outputSchema: z.array(subscriptionTierSchema),
  execute: async () => {
    const client = getRallyaClient();
    return await client.subscriptions.listPlans();
  },
});

export const getSubscriptionTool = createTool({
  id: "rallya-get-subscription",
  description:
    "Get an organization's current billing state: plan (FREE/PRO/SCALE), status (ACTIVE/PAST_DUE/CANCELED), current period end, and whether cancellation is scheduled. " +
    "An org with no subscription reads as FREE. Use before advising on upgrades or diagnosing quota errors.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
  }),
  outputSchema: subscriptionSchema,
  execute: async ({ org }) => {
    const client = getRallyaClient();
    return await client.subscriptions.get(org);
  },
});

export const checkoutSubscriptionTool = createTool({
  id: "rallya-checkout-subscription",
  description:
    "Start a Stripe subscription-mode Checkout to upgrade an org to PRO or SCALE. OWNER role required. " +
    "Returns a hosted payment URL plus session id — the billing owner completes payment in the browser and fulfillment lands via webhook (poll get-subscription to confirm). " +
    "Sessions are single-use and every call mints a fresh one; fails with 409 if the org already holds that plan, 503 when billing is unconfigured server-side. " +
    "Note this changes real billing — confirm the plan with the user first. Requires human approval before execution.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    plan: z.enum(["PRO", "SCALE"]).describe("Target paid tier"),
  }),
  outputSchema: checkoutResponseSchema,
  requireApproval: true,
  execute: async ({ org, plan }) => {
    const client = getRallyaClient();
    return await client.subscriptions.checkout(org, plan);
  },
});

export const openSubscriptionPortalTool = createTool({
  id: "rallya-open-subscription-portal",
  description:
    "Open the Stripe Customer Portal for self-serve subscription management (update payment method, cancel). OWNER role required. " +
    "Downgrades and cancellations take effect at the end of the current billing period. Managing billing requires human approval before execution. Returns the portal { url } to redirect the billing owner to.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
  }),
  outputSchema: z.object({ url: z.string() }),
  requireApproval: true,
  execute: async ({ org }) => {
    const client = getRallyaClient();
    return await client.subscriptions.portal(org);
  },
});

export const subscriptionTools = {
  listSubscriptionPlansTool,
  getSubscriptionTool,
  checkoutSubscriptionTool,
  openSubscriptionPortalTool,
};
