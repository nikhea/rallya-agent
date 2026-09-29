/**
 * Seed per-domain datasets from eval cases for Studio experiments.
 *
 * Usage: bun src/mastra/evals/seed-datasets.ts [--domain=checkin]
 *
 * One dataset per domain (`rallya-evals-<domain>`), zod schemas on
 * input/groundTruth, items carrying case metadata + per-dataset scorerIds.
 *
 * Experiment safety: mutating tools get static mocks (`matchArgs: "ignore"`)
 * and destructive items set `unmockedToolPolicy: "deny"`, so experiments
 * score tool SELECTION without touching the live backend. Read-only tools
 * (list/get/search/health/stats) run live against staging. Always start
 * experiments with `unmockedToolPolicy: "deny"` as well.
 */
import { z } from "zod";
import { mastra } from "../index.js";
import { allEvalCases, type EvalCase } from "./index.js";

/** Tools matching this never mutate: safe to run live in experiments. */
const READ_ONLY = /^(rallya-(list|get|search|health)[a-z-]*|rallya-get-[a-z-]+)$/;

const DESTRUCTIVE = new Set([
  "rallya-remove-org",
  "rallya-remove-org-member",
  "rallya-revoke-org-invite",
  "rallya-delete-org-role",
  "rallya-remove-event",
  "rallya-cancel-event",
  "rallya-remove-ticket",
  "rallya-cancel-order",
  "rallya-cancel-my-attendee",
  "rallya-revert-checkin",
  "rallya-remove-kit",
  "rallya-void-kit-collection",
]);

const DOMAIN_SCORERS: Record<string, string[]> = {
  checkin: ["rallya-refusal-semantics"],
  payments: ["rallya-redirect-handoff"],
  subscriptions: ["rallya-redirect-handoff"],
  orgs: ["rallya-destructive-confirm"],
  events: ["rallya-destructive-confirm"],
  tickets: ["rallya-destructive-confirm"],
  kits: ["rallya-destructive-confirm"],
};

const BASE_SCORERS = [
  "check-called-tool",
  "check-did-not-call",
  "check-no-tool-errors",
  "check-includes",
  "check-tool-order",
];

const inputSchema = z.object({ prompt: z.string() });
const groundTruthSchema = z.object({
  expectedTools: z.array(z.string()),
  forbiddenTools: z.array(z.string()).optional(),
});

function mocksFor(c: EvalCase) {
  const mutating = c.expectedTools.filter((t) => !READ_ONLY.test(t));
  return mutating.map((toolName) => ({
    toolName,
    args: {},
    matchArgs: "ignore" as const,
    output: { mocked: true, tool: toolName },
  }));
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const domain = arg("domain");
const domains = [...new Set(allEvalCases.map((c) => c.domain))].filter((d) => !domain || d === domain);
if (domains.length === 0) {
  console.error("No domains match --domain=");
  process.exit(2);
}

for (const d of domains) {
  const cases = allEvalCases.filter((c) => c.domain === d);
  const dataset = await mastra.datasets.create({
    name: `rallya-evals-${d}`,
    description: `Eval cases for the ${d} tool domain (seeded from src/mastra/evals).`,
    inputSchema,
    groundTruthSchema,
  });
  await dataset.addItems({
    items: cases.map((c) => ({
      input: { prompt: c.prompt || c.turns!.map((t) => t.input).join("\n\n") },
      groundTruth: { expectedTools: c.expectedTools, forbiddenTools: c.forbiddenTools ?? [] },
      metadata: { caseId: c.id, domain: c.domain, notes: c.notes },
      scorerIds: [...BASE_SCORERS, ...(DOMAIN_SCORERS[d] ?? [])],
      toolMocks: mocksFor(c),
      ...(c.expectedTools.some((t) => DESTRUCTIVE.has(t))
        ? { unmockedToolPolicy: "deny" as const }
        : {}),
    })),
  });
  console.log(`seeded rallya-evals-${d}: ${cases.length} items (id=${dataset.id})`);
}
process.exit(0);
