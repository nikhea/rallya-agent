import { registerApiRoute } from "@mastra/core/server";
import { MASTRA_RESOURCE_ID_KEY } from "@mastra/core/request-context";
import { RallyaClient } from "@rallya/sdk";
import { z } from "zod";
import { RALLYA_AUTH_KEY, RALLYA_IDENTITY_KEY, rallyaAuthMiddleware } from "../utils/request-context.js";

/**
 * Public Rallya auth routes served by the Mastra server.
 *
 * Two layers (see `rallyaAuthMiddleware`):
 * - Operator gate: `Authorization: Bearer <mastra-jwt>` (`MastraJwtAuth`).
 *   Public routes below opt out via `requiresAuth: false`.
 * - Rallya identity: `X-Rallya-Access-Token` (+ `X-Rallya-Refresh-Token`)
 *   or `X-Rallya-Api-Key`. The middleware confirms it and tools act as that
 *   user. Without any Rallya credential, tools fall back to server env.
 *
 * - POST /rallya-auth/register { email, password, firstName?, lastName? }
 * - POST /rallya-auth/login { email, password } → { accessToken, refreshToken }
 * - POST /rallya-auth/refresh { refreshToken } → { accessToken, refreshToken }
 * - GET  /rallya-auth/me (Rallya headers) → profile + memberships
 * - GET  /rallya-auth/whoami (Rallya headers) → resolved request identity
 */

const baseUrl = process.env.RALLYA_BASE_URL ?? "http://localhost:8080/api/v1";

/** Client with no identity, for logged-out auth endpoints only. */
function anonymousClient(): RallyaClient {
  return new RallyaClient({
    baseUrl,
    getTokens: () => null,
    setTokens: () => {},
  });
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

/** Rallya token from the dedicated header (`Authorization` is Mastra's). */
function rallyaHeaderToken(c: any): string | undefined {
  return c.req.header("x-rallya-access-token") ?? undefined;
}

export const rallyaAuthRoutes = [
  registerApiRoute("/rallya-auth/register", {
    method: "POST",
    requiresAuth: false, // public: issues Rallya credentials, needs no operator token
    openapi: { summary: "Register a Rallya account", tags: ["Rallya Auth"] },
    handler: async (c) => {
      const body = registerSchema.safeParse(await c.req.json().catch(() => null));
      if (!body.success) {
        return c.json({ error: "invalid body", details: body.error.flatten() }, 400);
      }
      try {
        const pair = await anonymousClient().auth.register(body.data);
        return c.json(pair, 201);
      } catch (e: any) {
        return c.json({ error: e?.message ?? "registration failed" }, e?.status ?? 400);
      }
    },
  }),
  registerApiRoute("/rallya-auth/login", {
    method: "POST",
    requiresAuth: false, // public: issues Rallya credentials, needs no operator token
    openapi: { summary: "Log in and receive Rallya tokens", tags: ["Rallya Auth"] },
    handler: async (c) => {
      const body = loginSchema.safeParse(await c.req.json().catch(() => null));
      if (!body.success) {
        return c.json({ error: "invalid body", details: body.error.flatten() }, 400);
      }
      try {
        const pair = await anonymousClient().auth.login(body.data);
        return c.json(pair);
      } catch (e: any) {
        return c.json({ error: e?.message ?? "login failed" }, e?.status ?? 401);
      }
    },
  }),
  registerApiRoute("/rallya-auth/refresh", {
    method: "POST",
    requiresAuth: false, // public: rotates Rallya credentials, needs no prior session
    openapi: { summary: "Refresh Rallya tokens", tags: ["Rallya Auth"] },
    handler: async (c) => {
      const body = refreshSchema.safeParse(await c.req.json().catch(() => null));
      if (!body.success) {
        return c.json({ error: "invalid body", details: body.error.flatten() }, 400);
      }
      try {
        const pair = await anonymousClient().auth.refresh(body.data.refreshToken);
        return c.json(pair);
      } catch (e: any) {
        return c.json({ error: e?.message ?? "refresh failed" }, e?.status ?? 401);
      }
    },
  }),
  registerApiRoute("/rallya-auth/me", {
    method: "GET",
    requiresAuth: false, // public: validates Rallya credentials, needs no operator token
    openapi: { summary: "Validate Rallya credentials, return profile", tags: ["Rallya Auth"] },
    handler: async (c) => {
      const apiKey = c.req.header("x-rallya-api-key");
      const accessToken = rallyaHeaderToken(c);
      const refreshToken = c.req.header("x-rallya-refresh-token") ?? "";
      try {
        const client = apiKey
          ? new RallyaClient({ baseUrl, apiKey })
          : new RallyaClient({
              baseUrl,
              getTokens: () => (accessToken ? { accessToken, refreshToken } : null),
              setTokens: () => {},
            });
        return c.json(await client.auth.me());
      } catch (e: any) {
        return c.json({ error: e?.message ?? "unauthorized" }, e?.status ?? 401);
      }
    },
  }),
  registerApiRoute("/rallya-auth/whoami", {
    method: "GET",
    requiresAuth: false, // public: echoes resolved Rallya identity, needs no operator token
    // Needs the middleware explicitly: server middleware only covers /api/*,
    // while custom routes live at the server root.
    middleware: [rallyaAuthMiddleware],
    openapi: { summary: "Show the identity this request acts as", tags: ["Rallya Auth"] },
    handler: async (c) => {
      const requestContext = c.get("requestContext");
      const get = (k: string): unknown => {
        try {
          return requestContext?.get?.(k) ?? null;
        } catch {
          return null;
        }
      };
      const resourceId = get(MASTRA_RESOURCE_ID_KEY);
      return c.json({
        // What the middleware resolved for THIS request (nulls = env identity):
        rallyaAuthPresent: get(RALLYA_AUTH_KEY) != null,
        identity: get(RALLYA_IDENTITY_KEY),
        resourceId: typeof resourceId === "string" ? resourceId : null,
      });
    },
  }),
];
