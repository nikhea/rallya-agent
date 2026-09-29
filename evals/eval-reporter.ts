/**
 * Minimal eval score reporter: prints the per-test score tables that
 * `expectEval`/`expectEvals` attach to `task.meta.mastraEval`.
 *
 * Why not `MastraEvalsReporter` from `@mastra/evals/vitest`? That module
 * calls `expect.extend()` at import time, which crashes when vitest loads
 * it from the config file (main process, not a worker). This reporter only
 * uses type-only `vitest` imports (erased at bundle time) and reads the
 * documented meta shape, so the config loads cleanly. The official setup
 * file (`@mastra/evals/vitest/setup`) still runs in workers and is kept.
 */
import type { Reporter, File, Task } from "vitest";

interface GateResult {
  id: string;
  passed: boolean;
  score?: number;
}

interface EvalMeta {
  scores?: Record<string, number>;
  verdict?: string;
  gateResults?: GateResult[];
}

function* walk(tasks: Task[]): Generator<Task> {
  for (const t of tasks) {
    yield t;
    const children = (t as { tasks?: Task[] }).tasks;
    if (Array.isArray(children)) yield* walk(children);
  }
}

export class EvalScoreReporter implements Reporter {
  onFinished(files: File[] = []) {
    let total = 0;
    let failed = 0;
    const lines: string[] = ["", "Eval scores"];
    for (const f of files) {
      for (const t of walk(f.tasks)) {
        const meta = (t.meta as Record<string, unknown> | undefined)?.mastraEval as
          | EvalMeta
          | undefined;
        if (!meta) continue;
        total++;
        const ok = t.result?.state === "pass";
        if (!ok) failed++;
        lines.push(`${ok ? "✓" : "✗"} ${t.name}${meta.verdict ? `  verdict=${meta.verdict}` : ""}`);
        for (const g of meta.gateResults ?? []) {
          lines.push(`    ${g.passed ? "✓" : "✗"} ${g.id}${g.score !== undefined ? `  ${g.score}` : ""}`);
        }
        for (const [id, score] of Object.entries(meta.scores ?? {})) {
          lines.push(`      ${id}  ${typeof score === "number" ? score.toFixed(2) : score}`);
        }
      }
    }
    if (total > 0) {
      lines.push("", `Eval runs: ${total} (${total - failed} passed)`);
      console.log(lines.join("\n"));
    }
  }
}
