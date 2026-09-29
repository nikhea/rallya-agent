/**
 * Eval environment guard: live eval runs execute the agent, which needs
 * model provider keys, and tools, which need Rallya credentials (there is
 * no requestContext in evals, so per-request headers can't supply them).
 *
 * Required:
 * - RALLYA_API_KEY (staging/test key, preferred) or RALLYA_ACCESS_TOKEN
 * - Model keys for the agent-under-test (see agent model list)
 * - OPENAI_API_KEY as well when running with LLM judges (--full)
 *
 * Throws with a setup checklist when anything is missing. Never prints values.
 */
export function requireEvalEnv(opts: { judges?: boolean } = {}): void {
  const missing: string[] = [];
  if (!process.env.RALLYA_API_KEY && !process.env.RALLYA_ACCESS_TOKEN) {
    missing.push("RALLYA_API_KEY (preferred) or RALLYA_ACCESS_TOKEN (+ RALLYA_REFRESH_TOKEN)");
  }
  if (opts.judges && !process.env.OPENAI_API_KEY) {
    missing.push("OPENAI_API_KEY (judge model: openai/gpt-5-mini)");
  }
  if (missing.length > 0) {
    throw new Error(
      `Eval env incomplete — missing: ${missing.join("; ")}. ` +
        `Use a staging/test backend (RALLYA_BASE_URL) and test credentials; ` +
        `never point live evals at production. See .env.example.`,
    );
  }
}
