/**
 * Offline eval-case validation: every referenced tool id must exist,
 * ids unique, prompts non-empty, and every registered tool covered.
 * No network, no LLM. Run: `bun run evals`
 */
import { allEvalCases, validateCases, uncoveredTools } from "./index.js";
import {
  authTools,
  orgTools,
  eventTools,
  ticketTools,
  orderTools,
  paymentTools,
  attendeeTools,
  checkinTools,
  kitTools,
  subscriptionTools,
  auditAdminTools,
} from "../tools/index.js";

const registries = {
  authTools,
  orgTools,
  eventTools,
  ticketTools,
  orderTools,
  paymentTools,
  attendeeTools,
  checkinTools,
  kitTools,
  subscriptionTools,
  auditAdminTools,
};

const knownToolIds = new Set<string>();
for (const registry of Object.values(registries)) {
  for (const tool of Object.values(registry) as { id?: string }[]) {
    if (tool?.id) knownToolIds.add(tool.id);
  }
}

const errors = validateCases(allEvalCases, knownToolIds);
const uncovered = uncoveredTools(allEvalCases, knownToolIds);
const byDomain = Object.fromEntries(
  [...new Set(allEvalCases.map((c) => c.domain))].map((d) => [
    d,
    allEvalCases.filter((c) => c.domain === d).length,
  ]),
);

console.log(`cases: ${allEvalCases.length}  tools: ${knownToolIds.size}  domains:`, byDomain);
if (uncovered.length > 0) {
  console.log(`UNCOVERED TOOLS (${uncovered.length}):`);
  for (const t of uncovered) console.log(`  - ${t}`);
}
if (errors.length > 0) {
  console.log(`ERRORS (${errors.length}):`);
  for (const e of errors) console.log(`  ! ${e}`);
  process.exit(1);
}
console.log(uncovered.length > 0 ? "PASS with coverage gaps" : "PASS: all tools covered, all cases valid");
process.exit(uncovered.length > 0 ? 2 : 0);
