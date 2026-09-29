import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { LibSQLStore } from "@mastra/libsql";
import { DuckDBStore } from "@mastra/duckdb";
import { PostgresStore } from "@mastra/pg";
import { MastraCompositeStore } from "@mastra/core/storage";
import { MastraJwtAuth } from "@mastra/auth";
import {
  Observability,
  MastraStorageExporter,
  MastraPlatformExporter,
  SensitiveDataFilter,
  SamplingStrategyType,
} from "@mastra/observability";
import { weatherWorkflow } from "./workflows/weather-workflow";
import { weatherAgent } from "./agents/weather-agent";
import { rallyaAgent } from "./agents/rallya-agent";
import {
  toolCallAppropriatenessScorer,
  completenessScorer,
  translationScorer,
} from "./scorers/weather-scorer";
import { weatherTool } from "./tools/weather-tool";
import { rallyaMcpServer } from "./mcp/rallya-mcp-server.js";
import { rallyaAuthMiddleware } from "./utils/request-context.js";
import { rallyaAuthRoutes } from "./routes/rallya-auth.js";
import { evalCheckScorers } from "./evals/index.js";
import { rallyaScorers } from "./evals/scorers/rallya-scorers.js";
import {
  orgTools,
  eventTools,
  ticketTools,
  orderTools,
  paymentTools,
  attendeeTools,
  checkinTools,
  kitTools,
  subscriptionTools,
  authTools,
  auditAdminTools,
} from "./tools/index";
import {
  rallyaSalesCode,
  rallyaDoorCode,
  rallyaManageCode,
  rallyaFullCode,
} from "./utils/index";

const jwtSecret = process.env.MASTRA_JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error(
    "MASTRA_JWT_SECRET must be set (min 32 chars). Generate with: openssl rand -base64 48",
  );
}

// Best choice: fail fast in production so a missing DATABASE_URL can never
// silently boot on ephemeral SQLite. Dev keeps the file fallback.
if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set in production (Postgres). Example: postgresql://user:pass@host:5432/rallya",
  );
}

export const mastra = new Mastra({
  environment: process.env.NODE_ENV ?? "development",
  workflows: { weatherWorkflow },
  agents: { weatherAgent, rallyaAgent },
  tools: {
    weatherTool,
    ...orgTools,
    ...eventTools,
    ...ticketTools,
    ...orderTools,
    ...paymentTools,
    ...attendeeTools,
    ...checkinTools,
    ...kitTools,
    ...subscriptionTools,
    ...authTools,
    ...auditAdminTools,
    rallya_sales_code: rallyaSalesCode.tool,
    rallya_door_code: rallyaDoorCode.tool,
    rallya_manage_code: rallyaManageCode.tool,
    rallya_full_code: rallyaFullCode.tool,
  },
  scorers: {
    toolCallAppropriatenessScorer,
    completenessScorer,
    translationScorer,
    ...evalCheckScorers,
    ...rallyaScorers,
  },
  mcpServers: { rallyaMcpServer },
  server: {
    auth: new MastraJwtAuth({
      secret: jwtSecret,
    }),
    // Two layers: MastraJwtAuth gates `Authorization: Bearer <mastra-jwt>`
    // at the edge; rallyaAuthMiddleware resolves per-request Rallya identity
    // from `X-Rallya-*` headers into request context (never `Authorization`).
    middleware: [{ path: "/api/*", handler: rallyaAuthMiddleware }],
    apiRoutes: rallyaAuthRoutes,
  },
  storage: process.env.DATABASE_URL
    ? // Production: single Postgres handles memory, threads, workflows,
      // scorers, resources + observability (auto-creates tables on init).
      new PostgresStore({
        id: "pg-storage",
        connectionString: process.env.DATABASE_URL,
        max: Number(process.env.PG_POOL_MAX ?? 20),
        idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS ?? 30000),
        ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
      })
    : // Local dev fallback (no DATABASE_URL): file stores.
      new MastraCompositeStore({
        id: "composite-storage",
        default: new LibSQLStore({
          id: "mastra-storage",
          url: "file:./mastra.db",
        }),
        domains: {
          observability: await new DuckDBStore().getStore("observability"),
        },
      }),
  logger: new PinoLogger({
    name: "Mastra",
    level: "info",
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: "rallya-agent",
        // Dev 50% / production 100% trace sampling.
        sampling:
          process.env.NODE_ENV === "production"
            ? { type: SamplingStrategyType.ALWAYS }
            : { type: SamplingStrategyType.RATIO, probability: 0.5 },
        // Auto-attach these RequestContext values as metadata to all spans
        // in a trace. Flat keys are set by rallyaAuthMiddleware; nested
        // paths cover Studio request-context JSON without the middleware.
        // Never add `rallyaAuth` here — it holds tokens.
        requestContextKeys: [
          "userId",
          "userEmail",
          "authMethod",
          "mastra__resourceId",
          "rallyaIdentity.userId",
          "rallyaIdentity.email",
        ],
        exporters: [
          new MastraStorageExporter(), // Persists observability events to Mastra Storage
          new MastraPlatformExporter(), // Sends observability events to Mastra Platform (if MASTRA_PLATFORM_ACCESS_TOKEN is set)
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
        ],
      },
    },
  }),
});
