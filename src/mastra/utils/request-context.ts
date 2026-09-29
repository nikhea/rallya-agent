import { MASTRA_RESOURCE_ID_KEY } from "@mastra/core/request-context";
import { createHash } from "node:crypto";

/**
 * Per-request Rallya identity for multi-user operation.
 *
 * Single-user mode (env credentials) keeps working untouched. When a caller
 * presents per-request credentials, tools act as THAT user instead:
 *
 * - `X-Rallya-Api-Key: rk_live_...` — server-to-server org key.
 * - `X-Rallya-Access-Token: eyJ...` (+ optional `X-Rallya-Refresh-Token`) —
 *   user JWT session. Dedicated headers (not `Authorization`) so they never
 *   clash with Mastra server auth.
 *
 * In Studio, set the same `rallyaAuth` object in the request-context JSON
 * editor instead of headers. In both cases the tools read it from
 * `context.requestContext` (see `getRallyaClient`).
 *
 * Memory isolation: the middleware pins `MASTRA_RESOURCE_ID_KEY` to
 * `rallya-user:<jwt-sub>` (or a credential hash for API keys), so threads
 * are namespaced per Rallya identity. Caveat: the JWT `sub` is read WITHOUT
 * signature verification (Rallya owns the signing secret), so treat the
 * resource id as namespacing, not proof — the Rallya API itself remains the
 * real authorization gate, and production front-ends should verify tokens
 * before trusting resource-scoped reads.
 */

export const RALLYA_AUTH_KEY = "rallyaAuth";
export const RALLYA_API_KEY_HEADER = "x-rallya-api-key";
export const RALLYA_ACCESS_TOKEN_HEADER = "x-rallya-access-token";
export const RALLYA_REFRESH_TOKEN_HEADER = "x-rallya-refresh-token";

export interface RallyaRequestAuth {
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
}

type ContextLike = { get(key: string): unknown } | null | undefined;

/** Extract per-request Rallya credentials from a Mastra RequestContext. */
export function readRallyaAuth(requestContext: unknown): RallyaRequestAuth | null {
  const get = (requestContext as ContextLike)?.get;
  if (typeof get !== "function") return null;
  let raw: unknown;
  try {
    raw = (get as (key: string) => unknown).call(requestContext, RALLYA_AUTH_KEY);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const { apiKey, accessToken, refreshToken } = raw as Record<string, unknown>;
  const auth: RallyaRequestAuth = {};
  if (typeof apiKey === "string" && apiKey) auth.apiKey = apiKey;
  if (typeof accessToken === "string" && accessToken) auth.accessToken = accessToken;
  if (typeof refreshToken === "string" && refreshToken) auth.refreshToken = refreshToken;
  return auth.apiKey || auth.accessToken ? auth : null;
}

/** Decode a JWT payload WITHOUT verification (namespacing only, see above). */
export function decodeJwtSub(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as {
      sub?: unknown;
    };
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Stable per-credential resource id for memory namespacing. */
export function deriveResourceId(auth: RallyaRequestAuth): string | null {
  if (auth.accessToken) {
    const sub = decodeJwtSub(auth.accessToken);
    if (sub) return `rallya-user:${sub}`;
  }
  const secret = auth.apiKey ?? auth.accessToken;
  if (!secret) return null;
  return `rallya-key:${createHash("sha256").update(secret).digest("hex").slice(0, 16)}`;
}

/**
 * Hono middleware: picks Rallya credentials off request headers into the
 * request context, and pins memory resource scoping to the credential.
 * Missing headers fall through untouched (env-credential single-user mode).
 */
export async function rallyaAuthMiddleware(c: any, next: () => Promise<void>): Promise<void> {
  const apiKey = c.req.header(RALLYA_API_KEY_HEADER);
  const accessToken = c.req.header(RALLYA_ACCESS_TOKEN_HEADER);
  if (!apiKey && !accessToken) {
    await next();
    return;
  }
  const requestContext = c.get("requestContext");
  const auth: RallyaRequestAuth = {};
  if (apiKey) auth.apiKey = apiKey;
  if (accessToken) auth.accessToken = accessToken;
  const refreshToken = c.req.header(RALLYA_REFRESH_TOKEN_HEADER);
  if (refreshToken) auth.refreshToken = refreshToken;
  requestContext?.set?.(RALLYA_AUTH_KEY, auth);
  const resourceId = deriveResourceId(auth);
  if (resourceId) requestContext?.set?.(MASTRA_RESOURCE_ID_KEY, resourceId);
  await next();
}
