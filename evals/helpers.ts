/**
 * Shared vitest helper: one independent gate test per eval case.
 * Gates are deterministic checks (calledTool/didNotCall/noToolErrors) —
 * zero judge-LLM cost, but each case still runs the agent (agent model +
 * live Rallya backend required). Multi-turn cases run on a shared thread
 * with per-turn gates.
 */
import { randomUUID } from "node:crypto";
import { test } from "vitest";
import { expectEval } from "@mastra/evals/vitest";
import { mastra } from "../src/mastra/index.js";
import {
  gatesFor,
  turnGatesFor,
  type EvalCase,
} from "../src/mastra/evals/index.js";
import { requireEvalEnv } from "../src/mastra/evals/require-env.js";

export function gateTests(cases: EvalCase[]) {
  test.for(cases)("$id", { timeout: 180_000 }, async (c) => {
    requireEvalEnv();
    // Thread-scoped observational memory requires a pre-existing thread:
    // one fresh thread per case on the dedicated eval resource (never real
    // users). Multi-turn cases share their thread across turns.
    const agent = mastra.getAgent("rallyaAgent");
    const memory = await agent.getMemory();
    const threadId = `eval-${randomUUID()}`;
    await memory?.createThread({ threadId, resourceId: "eval-ci", title: c.id });
    const data = c.turns?.length
      ? {
          turns: c.turns.map((t) => ({
            input: t.input,
            gates: Object.values(turnGatesFor(t)),
          })),
        }
      : { input: c.prompt };
    await expectEval({
      target: agent,
      data,
      gates: Object.values(gatesFor(c)),
      targetOptions: { memory: { thread: threadId, resource: "eval-ci" } },
    }).toPass();
  });
}
