import { MASTRA_RESOURCE_ID_KEY } from "@mastra/core/request-context";
import { createHash } from "node:crypto";
import { RallyaClient } from "@rallya/sdk";

/**
 * Two-layer auth: Mastra operator JWT + per-request Rallya identity.
 *
 * - `Authorization: Bearer <mastra-jwt>` belongs to `MastraJwtAuth`
 *   (edge gate, `MASTRA_JWT_SECRET`). This middleware never reads it.
 * - Rallya identity travels via dedicated headers (Studio: Headers editor):
 *   `X-Rallya-Access-Token: <rallya-jwt>` (+ optional
 *   `X-Rallya-Refresh-Token`), or `X-Rallya-Api-Key: rk_live_...` for
 *   tablets/cron. Both are confirmed against the Rallya API once per
 *   credential (5-minute TTL cache), then stored as `rallyaAuth` plus a
 *   verified `rallya-user:<id>` memory resource. Tools act as that user;
 *   threads namespace per user.
 *
 * - Missing credentials fall through untouched (public routes and Studio's
 *   request-context JSON editor path). Present-but-invalid credentials get
 *   401 — never silently downgraded to the server identity.
 * - Studio's request-context JSON editor (`{"rallyaAuth": {...}}`) still
 *   works when headers are absent.
 */

export const RALLYA_AUTH_KEY = "rallyaAuth";
export const RALLYA_IDENTITY_KEY = "rallyaIdentity";
export const RALLYA_API_KEY_HEADER = "x-rallya-api-key";
export const RALLYA_ACCESS_TOKEN_HEADER = "x-rallya-access-token";
export const RALLYA_REFRESH_TOKEN_HEADER = "x-rallya-refresh-token";
// Flat keys extracted automatically into trace metadata (see observability
// `requestContextKeys` in src/mastra/index.ts). Never put tokens here —
export const OBS_USER_ID_KEY = "userId";
export const OBS_USER_EMAIL_KEY = "userEmail";
export const OBS_AUTH_METHOD_KEY = "authMethod";

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

/** Decode a JWT payload WITHOUT verification (namespacing fallback only). */
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

const VERIFY_TTL_MS = 5 * 60 * 1000;
interface VerifiedIdentity {
  userId: string;
  email?: string;
  cachedAt: number;
}
const verifiedCache = new Map<string, VerifiedIdentity>();

function cacheKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Confirm a Rallya access token against the API (`auth/me`), cached per
 * token for VERIFY_TTL_MS. Returns the verified user id, or null.
 */
export async function verifyRallyaToken(accessToken: string): Promise<{ userId: string; email?: string } | null> {
  const key = cacheKey(accessToken);
  const hit = verifiedCache.get(key);
  if (hit && Date.now() - hit.cachedAt < VERIFY_TTL_MS) {
    return { userId: hit.userId, email: hit.email };
  }
  verifiedCache.delete(key);
  try {
    const baseUrl = process.env.RALLYA_BASE_URL ?? "http://localhost:8080/api/v1";
    const client = new RallyaClient({
      baseUrl,
      getTokens: () => ({ accessToken, refreshToken: "" }),
      setTokens: () => {},
    });
    const me = await client.auth.me();
    if (!me?.id) return null;
    verifiedCache.set(key, { userId: me.id, email: me.email, cachedAt: Date.now() });
    return { userId: me.id, email: me.email };
  } catch {
    return null;
  }
}

/**
 * Confirm a Rallya API key against the API (`auth/me`), cached per key for
 * VERIFY_TTL_MS. Returns the verified user id, or null.
 */
export async function verifyRallyaApiKey(apiKey: string): Promise<{ userId: string; email?: string } | null> {
  const key = cacheKey(`api-key:${apiKey}`);
  const hit = verifiedCache.get(key);
  if (hit && Date.now() - hit.cachedAt < VERIFY_TTL_MS) {
    return { userId: hit.userId, email: hit.email };
  }
  verifiedCache.delete(key);
  try {
    const baseUrl = process.env.RALLYA_BASE_URL ?? "http://localhost:8080/api/v1";
    const client = new RallyaClient({ baseUrl, apiKey });
    const me = await client.auth.me();
    if (!me?.id) return null;
    verifiedCache.set(key, { userId: me.id, email: me.email, cachedAt: Date.now() });
    return { userId: me.id, email: me.email };
  } catch {
    return null;
  }
}

/**
 * Hono middleware: Rallya identity for `/api/*`.
 *
 * Reads ONLY the dedicated `X-Rallya-*` headers — `Authorization` belongs
 * to `MastraJwtAuth` and is never inspected here.
 *
 * - `X-Rallya-Access-Token` → verified (cached); sets `rallyaAuth` +
 *   verified `rallya-user:<id>` resource. Invalid/expired → 401, never
 *   downgraded to the server identity.
 * - `X-Rallya-Api-Key` → verified (cached); sets `rallyaAuth` + verified
 *   `rallya-user:<id>` resource. Invalid → 401.
 * - Neither present → fall through (public routes / Studio JSON-editor path).
 */
export async function rallyaAuthMiddleware(c: any, next: () => Promise<void>): Promise<void> {
  const apiKey = c.req.header(RALLYA_API_KEY_HEADER);
  // NOTE: `Authorization` is owned by MastraJwtAuth — do not read it here.
  const accessToken = c.req.header(RALLYA_ACCESS_TOKEN_HEADER) ?? undefined;
  if (!apiKey && !accessToken) {
    await next();
    return;
  }
  const requestContext = c.get("requestContext");
  if (accessToken) {
    const identity = await verifyRallyaToken(accessToken);
    if (!identity) {
      return c.json(
        { error: "unauthorized", message: "Invalid or expired Rallya session. Log in again." },
        401,
      );
    }
    const auth: RallyaRequestAuth = { accessToken };
    const refreshToken = c.req.header(RALLYA_REFRESH_TOKEN_HEADER);
    if (refreshToken) auth.refreshToken = refreshToken;
    requestContext?.set?.(RALLYA_AUTH_KEY, auth);
    requestContext?.set?.(RALLYA_IDENTITY_KEY, { userId: identity.userId, email: identity.email });
    requestContext?.set?.(MASTRA_RESOURCE_ID_KEY, `rallya-user:${identity.userId}`);
    // Flat observability keys (auto-extracted via `requestContextKeys`).
    requestContext?.set?.(OBS_USER_ID_KEY, identity.userId);
    if (identity.email) requestContext?.set?.(OBS_USER_EMAIL_KEY, identity.email);
    requestContext?.set?.(OBS_AUTH_METHOD_KEY, "rallya-jwt");
    await next();
    return;
  }
  // API-key path: verified upfront (cached), same identity shape as JWT.
  const keyIdentity = await verifyRallyaApiKey(apiKey);
  if (!keyIdentity) {
    return c.json(
      { error: "unauthorized", message: "Invalid Rallya API key." },
      401,
    );
  }
  const auth: RallyaRequestAuth = { apiKey };
  requestContext?.set?.(RALLYA_AUTH_KEY, auth);
  requestContext?.set?.(RALLYA_IDENTITY_KEY, { userId: keyIdentity.userId, email: keyIdentity.email });
  requestContext?.set?.(MASTRA_RESOURCE_ID_KEY, `rallya-user:${keyIdentity.userId}`);
  // Flat observability keys for the API-key path.
  requestContext?.set?.(OBS_USER_ID_KEY, keyIdentity.userId);
  if (keyIdentity.email) requestContext?.set?.(OBS_USER_EMAIL_KEY, keyIdentity.email);
  requestContext?.set?.(OBS_AUTH_METHOD_KEY, "api-key");
  await next();
}
