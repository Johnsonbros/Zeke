# ZEKE - Production Docker image
#
# Multi-stage build:
# 1) install deps (with lockfile)
# 2) build client + server bundle
# 3) runtime image with only what's needed

FROM node:20-bookworm-slim AS deps
WORKDIR /app

# Install system deps needed by some npm modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build bundle into dist/
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Runtime deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
  && rm -rf /var/lib/apt/lists/*

# Copy built output + runtime files
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules

# Runtime scripts
COPY docker/entrypoint.sh ./docker/entrypoint.sh
RUN chmod +x ./docker/entrypoint.sh

EXPOSE 5000

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=10 \
  CMD curl -fsS http://127.0.0.1:${PORT:-5000}/healthz || exit 1

ENTRYPOINT ["./docker/entrypoint.sh"]
