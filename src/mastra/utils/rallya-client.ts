import { RallyaClient, type TokenPair } from "@rallya/sdk";
import { readRallyaAuth } from "./request-context.js";

/**
 * Shared Rallya SDK client for Mastra tools.
 *
 * Auth resolution (in order):
 * 1. Per-request credentials from `context.requestContext` (`rallyaAuth`,
 *    set by the auth middleware from `X-Rallya-*` headers or Studio's
 *    request-context editor). Builds an isolated client per call — this is
 *    what makes the app multi-user. Token refreshes stay in memory for the
 *    life of the call; clients should re-use the latest pair they hold.
 * 2. RALLYA_API_KEY — server-to-server org key (`rk_live_*`), sent as X-API-Key.
 *    Best for agents, door tablets, cron jobs. No refresh cycle.
 * 3. RALLYA_ACCESS_TOKEN (+ optional RALLYA_REFRESH_TOKEN) — user JWT session.
 *    Auto-refreshes on 401 when a refresh token is present.
 *
 * Base URL: RALLYA_BASE_URL (default http://localhost:8080/api/v1).
 */
let cachedApiKeyClient: RallyaClient | null = null;
let cachedApiKeyValue: string | undefined;

let tokens: TokenPair | null =
  process.env.RALLYA_ACCESS_TOKEN
    ? {
        accessToken: process.env.RALLYA_ACCESS_TOKEN,
        refreshToken: process.env.RALLYA_REFRESH_TOKEN ?? "",
      }
    : null;

export function getRallyaClient(requestContext?: unknown): RallyaClient {
  const baseUrl = process.env.RALLYA_BASE_URL ?? "http://localhost:8080/api/v1";

  // 1. Per-request identity (multi-user). Fresh client every call — never cached.
  const req = readRallyaAuth(requestContext);
  if (req?.apiKey) {
    return new RallyaClient({ baseUrl, apiKey: req.apiKey });
  }
  if (req?.accessToken) {
    let pair: TokenPair | null = { accessToken: req.accessToken, refreshToken: req.refreshToken ?? "" };
    return new RallyaClient({
      baseUrl,
      getTokens: () => pair,
      setTokens: (t) => {
        pair = t;
      },
    });
  }

  const apiKey = process.env.RALLYA_API_KEY;

  if (apiKey) {
    // Cache per key value so tests / key rotation pick up changes.
    if (!cachedApiKeyClient || cachedApiKeyValue !== apiKey) {
      cachedApiKeyClient = new RallyaClient({
        baseUrl,
        apiKey,
        onAuthFailure: () => {
          cachedApiKeyClient = null;
        },
      });
      cachedApiKeyValue = apiKey;
    }
    return cachedApiKeyClient;
  }

  if (!tokens?.accessToken) {
    throw new Error(
      "Rallya auth missing: set RALLYA_API_KEY (preferred for agents) or RALLYA_ACCESS_TOKEN (+ RALLYA_REFRESH_TOKEN) / RALLYA_BASE_URL in env."
    );
  }

  // Fresh client per call in token mode so in-memory rotation stays correct.
  // TokenStore closures share the module-level `tokens` variable.
  return new RallyaClient({
    baseUrl,
    getTokens: () => tokens,
    setTokens: (t) => {
      tokens = t;
    },
    onAuthFailure: () => {
      tokens = null;
    },
  });
}
