import { RallyaClient, type TokenPair } from "@rallya/sdk";

/**
 * Shared Rallya SDK client for Mastra tools.
 *
 * Auth resolution (in order):
 * 1. RALLYA_API_KEY — server-to-server org key (`rk_live_*`), sent as X-API-Key.
 *    Best for agents, door tablets, cron jobs. No refresh cycle.
 * 2. RALLYA_ACCESS_TOKEN (+ optional RALLYA_REFRESH_TOKEN) — user JWT session.
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

export function getRallyaClient(): RallyaClient {
  const baseUrl = process.env.RALLYA_BASE_URL ?? "http://localhost:8080/api/v1";
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
