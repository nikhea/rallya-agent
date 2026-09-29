# rallya-agent — production image (Bun + Mastra)
# Build:  docker build -t rallya-agent .
# Run:    docker run --env-file .env -p 4111:4111 rallya-agent
# Required at runtime (never baked in): DATABASE_URL, MASTRA_JWT_SECRET,
# RALLYA_BASE_URL, model provider keys. NODE_ENV=production enforced below.

FROM oven/bun:1.2 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.2 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.json ./
COPY src ./src
RUN bun run build

FROM oven/bun:1.2 AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.mastra ./.mastra
COPY package.json ./
EXPOSE 4111
CMD ["bun", "run", "start"]
