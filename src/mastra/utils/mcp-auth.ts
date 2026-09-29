import { timingSafeEqual } from "node:crypto";

/**
 * MCP access control: static bearer API keys on `/api/mcp/*` only.
 *
 * Why keys and not OAuth here: the MCP spec wants full OAuth 2.1 (issuer,
 * discovery, audience-bound tokens, refresh) — correct for multi-tenant
 * production, but this stack has no identity provider and the consumers
 * are trusted first-party clients (Studio, Claude Code, Cursor). Static
 * `Authorization: Bearer <token>` works with every MCP client, needs no
 * infrastructure, and matches how the Rallya API keys already work.
 * Graduate to `server.auth` (MastraJwtAuth) or `createOAuthMiddleware`
 * when third parties consume this endpoint.
 *
 * Configure with MCP_API_TOKENS (comma-separated). When unset, MCP routes
 * stay open for local dev and responses carry an
 * `X-Rallya-MCP-Auth: disabled-no-tokens-configured` header as a reminder —
 * set tokens before any network exposure.
 * Per-request Rallya identity still flows via `X-Rallya-*` headers handled
 * by `rallyaAuthMiddleware`, which runs before this gate.
 */

const HEADER = "authorization";

function configuredTokens(): string[] {
  return (process.env.MCP_API_TOKENS ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function timingSafeHas(expected: string[], actual: string): boolean {
  const a = Buffer.from(actual);
  let ok = false;
  for (const token of expected) {
    const b = Buffer.from(token);
    if (a.length !== b.length) continue;
    ok = timingSafeEqual(a, b) || ok;
  }
  return ok;
}

/** Hono middleware: bearer-key gate for MCP routes. */
export async function mcpAuthMiddleware(c: any, next: () => Promise<void>): Promise<void> {
  const tokens = configuredTokens();
  if (tokens.length === 0) {
    c.header("X-Rallya-MCP-Auth", "disabled-no-tokens-configured");
    await next();
    return;
  }
  const header = c.req.header(HEADER) ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token || !timingSafeHas(tokens, token)) {
    return c.json(
      { error: "unauthorized", message: "Valid MCP bearer token required (MCP_API_TOKENS)." },
      401,
      { "WWW-Authenticate": 'Bearer scope="mcp:read mcp:write"' },
    );
  }
  await next();
}
