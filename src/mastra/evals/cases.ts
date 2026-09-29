import { checks } from "@mastra/evals/checks";
import type { MastraScorer } from "@mastra/core/evals";

/** Any eval scorer (checks, custom, or LLM judges) for runner plumbing. */
export type AnyScorer = MastraScorer<any, any, any, any>;

/**
 * Agent-eval cases for the Rallya assistant.
 *
 * Each case is a user prompt plus deterministic assertions built from
 * `@mastra/evals/checks` (calledTool, didNotCall, toolOrder, includes,
 * excludes, noToolErrors, maxToolCalls). Run them as Studio experiments
 * (Evaluate tab → dataset from these prompts) or via `runEvals()`.
 *
 * Conventions:
 * - `expectedTools` uses tool ids (e.g. "rallya-scan-checkin"), not export names.
 * - Discovery tools (`search_tools`, `skill_search`, `skill_read`) are an
 *   implementation detail — never assert on them, keep `maxToolCalls` loose.
 * - Destructive tools appear in two flavors: `-confirmed` (user already said
 *   yes → tool MUST be called) and `-unconfirmed` (no confirmation yet →
 *   tool MUST NOT be called, agent must ask).
 */

export interface EvalTurnCase {
  /** User message for this turn. */
  input: string;
  /** Tool ids that must be called during THIS turn only. */
  expectedTools?: string[];
  /** Tool ids that must NOT be called during THIS turn only. */
  forbiddenTools?: string[];
}

export interface EvalCase {
  /** Unique id: "<domain>/<short-name>", e.g. "checkin/scan-qr". */
  id: string;
  /** Tool domain, e.g. "checkin". */
  domain: string;
  /** User message to run the agent with (single-turn; omit when `turns` set). */
  prompt: string;
  /** Tool ids that must be called during the run. */
  expectedTools: string[];
  /** Tool ids that must NOT be called during the run. */
  forbiddenTools?: string[];
  /** Tools that must be called in this relative order (subset allowed). */
  expectedOrder?: string[];
  /** Substrings expected in the final assistant message. */
  expectedText?: string[];
  /** Substrings that must NOT appear in the final assistant message. */
  excludedText?: string[];
  /** Upper bound on total tool calls (discovery calls included). */
  maxToolCalls?: number;
  /** Reference answer for semantic scorers (answer-similarity). */
  groundTruth?: string;
  /** Domain facts for the faithfulness judge (claims must stay grounded). */
  context?: string[];
  /**
   * Multi-turn conversation with per-turn assertions. When set, the runner
   * uses `turns` instead of `prompt`; top-level expectedTools gates apply
   * to the accumulated conversation.
   */
  turns?: EvalTurnCase[];
  /**
   * Plain-English criterion for the multi-turn judge (graded over every
   * assistant turn together). Requires `turns`.
   */
  judgeCriterion?: string;
  /** What this case proves. */
  notes: string;
}

/**
 * Hard gates for a case: must average 1.0 or the verdict is `failed`.
 * Binary tool-usage checks only — text asserts stay tracked (flaky as gates).
 */
export function gatesFor(c: EvalCase): Record<string, AnyScorer> {
  const gates: Record<string, AnyScorer> = {
    noToolErrors: checks.noToolErrors() as AnyScorer,
  };
  for (const t of c.expectedTools) {
    gates[`called:${t}`] = checks.calledTool(t) as AnyScorer;
  }
  for (const t of c.forbiddenTools ?? []) {
    gates[`notCalled:${t}`] = checks.didNotCall(t) as AnyScorer;
  }
  return gates;
}

/** Tracked checks for a case: scored, reported, never fail the verdict. */
export function trackedFor(c: EvalCase): Record<string, AnyScorer> {
  const scorers: Record<string, AnyScorer> = {};
  if (c.expectedOrder) {
    scorers["toolOrder"] = checks.toolOrder(c.expectedOrder) as AnyScorer;
  }
  for (const text of c.expectedText ?? []) {
    scorers[`includes:${text.slice(0, 24)}`] = checks.includes(text) as AnyScorer;
  }
  for (const text of c.excludedText ?? []) {
    scorers[`excludes:${text.slice(0, 24)}`] = checks.excludes(text) as AnyScorer;
  }
  if (c.maxToolCalls !== undefined) {
    scorers["maxToolCalls"] = checks.maxToolCalls(c.maxToolCalls) as AnyScorer;
  }
  return scorers;
}

/** Per-turn gates for a multi-turn case (evaluate only that turn's output). */
export function turnGatesFor(t: EvalTurnCase): Record<string, AnyScorer> {
  const gates: Record<string, AnyScorer> = {};
  for (const tool of t.expectedTools ?? []) {
    gates[`called:${tool}`] = checks.calledTool(tool) as AnyScorer;
  }
  for (const tool of t.forbiddenTools ?? []) {
    gates[`notCalled:${tool}`] = checks.didNotCall(tool) as AnyScorer;
  }
  return gates;
}

/** Build deterministic check scorers for a case (for `runEvals()`). */
export function checksFor(c: EvalCase): Record<string, AnyScorer> {
  return { ...gatesFor(c), ...trackedFor(c) };
}

/**
 * Offline validation: every referenced tool id must exist in the registry,
 * case ids must be unique, prompts non-empty. No network, no LLM.
 */
export function validateCases(all: EvalCase[], knownToolIds: Set<string>): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const c of all) {
    if (seen.has(c.id)) errors.push(`duplicate case id: ${c.id}`);
    seen.add(c.id);
    if (!c.prompt.trim() && !(c.turns ?? []).length) {
      errors.push(`${c.id}: empty prompt and no turns`);
    }
    if ((c.turns ?? []).length > 0 && !c.judgeCriterion && !(c.turns ?? []).some((t) => (t.expectedTools ?? []).length + (t.forbiddenTools ?? []).length > 0)) {
      errors.push(`${c.id}: turns with no per-turn assertions and no judgeCriterion`);
    }
    if (c.expectedTools.length === 0 && !(c.forbiddenTools ?? []).length) {
      errors.push(`${c.id}: no expectedTools and no forbiddenTools`);
    }
    for (const t of [...c.expectedTools, ...(c.forbiddenTools ?? []), ...(c.expectedOrder ?? [])]) {
      if (!knownToolIds.has(t)) errors.push(`${c.id}: unknown tool id "${t}"`);
    }
    for (const t of c.forbiddenTools ?? []) {
      if (c.expectedTools.includes(t)) errors.push(`${c.id}: tool "${t}" both expected and forbidden`);
    }
  }
  return errors;
}

/** Tool ids never referenced by any case — coverage gaps. */
export function uncoveredTools(all: EvalCase[], knownToolIds: Set<string>): string[] {
  const referenced = new Set<string>();
  for (const c of all) {
    for (const t of c.expectedTools) referenced.add(t);
  }
  return [...knownToolIds].filter((t) => !referenced.has(t)).sort();
}
