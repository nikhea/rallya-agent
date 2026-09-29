import { checks } from "@mastra/evals/checks";
import type { EvalCase } from "./cases.js";
import { authCases } from "./auth-evals.js";
import { orgsCases } from "./orgs-evals.js";
import { eventsCases } from "./events-evals.js";
import { ticketsCases } from "./tickets-evals.js";
import { ordersCases, paymentsCases } from "./orders-payments-evals.js";
import { attendeesCases } from "./attendees-evals.js";
import { checkinCases } from "./checkin-evals.js";
import { kitsCases } from "./kits-evals.js";
import { subscriptionsCases } from "./subscriptions-evals.js";
import { auditAdminCases } from "./audit-admin-evals.js";
import { multiTurnCases } from "./multi-turn-evals.js";

export type { EvalCase, EvalTurnCase } from "./cases.js";
export { checksFor, gatesFor, trackedFor, turnGatesFor, validateCases, uncoveredTools } from "./cases.js";

/** Every eval case across all tool domains. */
export const allEvalCases: EvalCase[] = [
  ...authCases,
  ...orgsCases,
  ...eventsCases,
  ...ticketsCases,
  ...ordersCases,
  ...paymentsCases,
  ...attendeesCases,
  ...checkinCases,
  ...kitsCases,
  ...subscriptionsCases,
  ...auditAdminCases,
  ...multiTurnCases,
];

/** Cases grouped by domain. */
export const evalCasesByDomain: Record<string, EvalCase[]> = Object.fromEntries(
  [...new Set(allEvalCases.map((c) => c.domain))].map((d) => [d, allEvalCases.filter((c) => c.domain === d)]),
);

/**
 * Representative check scorers for Mastra registration (`scorers` map).
 * Check IDs are shared per check type, so one registration each covers
 * every case evaluated with `runEvals()` or Studio experiments — scores
 * then persist to `mastra_scorers`. Representative args keep stored
 * descriptions meaningful.
 */
export const evalCheckScorers = {
  checkCalledTool: checks.calledTool("rallya-scan-checkin"),
  checkDidNotCall: checks.didNotCall("rallya-remove-org"),
  checkToolOrder: checks.toolOrder(["rallya-get-my-profile", "rallya-list-org-events"]),
  checkMaxToolCalls: checks.maxToolCalls(10),
  checkNoToolErrors: checks.noToolErrors(),
  checkIncludes: checks.includes("http"),
  checkExcludes: checks.excludes("paid successfully"),
};
