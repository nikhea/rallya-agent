import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { LibSQLStore } from "@mastra/libsql";
import { DuckDBStore } from "@mastra/duckdb";
import { MastraCompositeStore } from "@mastra/core/storage";
import { MastraJwtAuth } from "@mastra/auth";
import {
  Observability,
  MastraStorageExporter,
  MastraPlatformExporter,
  SensitiveDataFilter,
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
  },
  mcpServers: { rallyaMcpServer },
  server: {
    auth: new MastraJwtAuth({
      secret: process.env.MASTRA_JWT_SECRET,
    }),
    // Single-token auth lives in rallyaAuthMiddleware (verified Rallya
    // identity per request). No server.auth: this instance serves one
    // trusted team, and a second credential system only caused confusion.
    middleware: [{ path: "/api/*", handler: rallyaAuthMiddleware }],
    apiRoutes: rallyaAuthRoutes,
  },
  storage: new MastraCompositeStore({
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
        serviceName: "mastra",
        // Auto-attach these RequestContext values as metadata to all spans
        // in a trace. Flat keys are set by rallyaAuthMiddleware; nested
        // paths cover Studio request-context JSON without the middleware.
        // Never add `rallyaAuth` here — it holds tokens.
        requestContextKeys: [
          "userId",
          "userEmail",
          "authMethod",
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
