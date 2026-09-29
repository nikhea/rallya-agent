/**
 * Live eval runner: executes eval cases against rallya-agent via `runEvals`.
 *
 * Usage:
 *   bun run evals:run [--domain=checkin] [--case=checkin/scan-qr] [--full] [--concurrency=2]
 *
 * Modes:
 * - default: deterministic gates (calledTool/didNotCall/noToolErrors) +
 *   tracked checks. Zero judge-LLM cost, but the agent itself still runs
 *   (agent model + live Rallya backend required).
 * - --full: + answer-relevancy, per-case faithfulness (cases with context),
 *   custom domain scorers, and the multi-turn judge. Needs OPENAI_API_KEY.
 *
 * Target is resolved via `mastra.getAgent()` (registry lookups, score
 * persistence, trajectory all require the attached instance).
 * Memory resource is pinned to `eval-ci` so experiments never touch real
 * user state; `runEvals` owns one thread per case. Exit 1 on any `failed`.
 */
import { randomUUID } from "node:crypto";
import { runEvals } from "@mastra/core/evals";
import {
  createAnswerRelevancyScorer,
  createFaithfulnessScorer,
  createMultiTurnJudgeScorer,
} from "@mastra/evals/scorers/prebuilt";
import { mastra } from "../index.js";
import {
  allEvalCases,
  gatesFor,
  trackedFor,
  turnGatesFor,
  type EvalCase,
} from "./index.js";
import {
  RALLYA_JUDGE_MODEL,
  refusalSemanticsScorer,
  redirectHandoffScorer,
  destructiveConfirmScorer,
} from "./scorers/rallya-scorers.js";
import { requireEvalEnv } from "./require-env.js";

const EVAL_RESOURCE = "eval-ci";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const relevancyScorer = createAnswerRelevancyScorer({ model: RALLYA_JUDGE_MODEL });

async function runCase(c: EvalCase, full: boolean) {
  const gates = Object.values(gatesFor(c));
  const scorers: object[] = Object.values(trackedFor(c));

  if (full) {
    scorers.push(relevancyScorer);
    if (c.context?.length) {
      scorers.push(createFaithfulnessScorer({ model: RALLYA_JUDGE_MODEL, options: { context: c.context } }));
    }
    scorers.push(refusalSemanticsScorer, redirectHandoffScorer, destructiveConfirmScorer);
    if (c.turns?.length && c.judgeCriterion) {
      scorers.push(createMultiTurnJudgeScorer({ model: RALLYA_JUDGE_MODEL, criterion: c.judgeCriterion }));
    }
  }

  const data: object[] = c.turns?.length
    ? [
        {
          turns: c.turns.map((t) => ({
            input: t.input,
            gates: Object.values(turnGatesFor(t)),
          })),
        },
      ]
    : [{ input: c.prompt, groundTruth: c.groundTruth }];

  // Thread-scoped observational memory requires a pre-existing thread:
  // one fresh thread per case on the dedicated eval resource.
  const agent = mastra.getAgent("rallyaAgent");
  const memory = await agent.getMemory();
  const threadId = `eval-${randomUUID()}`;
  await memory?.createThread({ threadId, resourceId: EVAL_RESOURCE, title: c.id });

  return runEvals({
    target: agent,
    data: data as never,
    gates: gates as never,
    scorers: scorers as never,
    targetOptions: { memory: { thread: threadId, resource: EVAL_RESOURCE } },
  });
}

const domain = arg("domain");
const onlyCase = arg("case");
const full = flag("full");
const concurrency = Number(arg("concurrency") ?? 2);

requireEvalEnv({ judges: full });

const selected = allEvalCases.filter(
  (c) => (!domain || c.domain === domain) && (!onlyCase || c.id === onlyCase),
);
if (selected.length === 0) {
  console.error("No cases match. Check --domain/--case.");
  process.exit(2);
}

console.log(`Running ${selected.length} case(s)${full ? " [full: LLM judges on]" : " [gates only]"} (concurrency=${concurrency})`);

let failed = 0;
let scored = 0;
const queue = [...selected];
async function worker() {
  while (queue.length > 0) {
    const c = queue.shift()!;
    try {
      const result = await runCase(c, full);
      const verdict = (result as { verdict?: string }).verdict ?? "n/a";
      if (verdict === "failed") failed++;
      if (verdict === "scored") scored++;
      console.log(`${verdict === "failed" ? "FAIL" : verdict === "scored" ? "WARN" : "PASS"}  ${c.id}  verdict=${verdict}`);
      const gateResults = (result as { gateResults?: { passed: boolean; id: string }[] }).gateResults ?? [];
      for (const g of gateResults.filter((g) => !g.passed)) {
        console.log(`      gate miss: ${g.id}`);
      }
    } catch (e) {
      failed++;
      console.log(`ERROR ${c.id}: ${(e as Error).message}`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, worker));

console.log(`\nDone: ${selected.length - failed - scored} passed, ${scored} scored, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
