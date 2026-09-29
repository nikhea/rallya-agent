import { registerApiRoute } from "@mastra/core/server";
import { RallyaClient } from "@rallya/sdk";
import { z } from "zod";

/**
 * Public Rallya auth routes served by the Mastra server.
 *
 * Clients obtain Rallya credentials here, then present them per request via
 * `X-Rallya-Access-Token` (+ `X-Rallya-Refresh-Token`) or `X-Rallya-Api-Key`
 * headers (see `rallyaAuthMiddleware`), or via Studio's request-context
 * editor (`rallyaAuth` object). Tools act as the presenting identity;
 * without per-request credentials they fall back to server env (single-user).
 *
 * - POST /rallya-auth/register { email, password, firstName?, lastName? }
 * - POST /rallya-auth/login { email, password } → { accessToken, refreshToken }
 * - GET  /rallya-auth/me (with rallya headers) → profile + memberships
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

export const rallyaAuthRoutes = [
  registerApiRoute("/rallya-auth/register", {
    method: "POST",
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
  registerApiRoute("/rallya-auth/me", {
    method: "GET",
    openapi: { summary: "Validate Rallya credentials, return profile", tags: ["Rallya Auth"] },
    handler: async (c) => {
      const apiKey = c.req.header("x-rallya-api-key");
      const accessToken = c.req.header("x-rallya-access-token");
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
];
