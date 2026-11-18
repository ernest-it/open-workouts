# syntax=docker/dockerfile:1
# ---- build ------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
# Toolchain for compiling better-sqlite3 when no prebuilt binary exists for the platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY apps/web apps/web
COPY scripts scripts
RUN npm run build

# Install only the native runtime dependency into a clean folder.
FROM node:22-bookworm-slim AS deps
# Toolchain for compiling better-sqlite3 when no prebuilt binary exists for the platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /deps
COPY --from=build /src/node_modules/better-sqlite3/package.json /tmp/bs.json
RUN npm init -y >/dev/null && \
    npm install --omit=dev --no-audit --no-fund "better-sqlite3@$(node -p "require('/tmp/bs.json').version")"

# ---- runtime ----------------------------------------------------------------
FROM node:22-bookworm-slim
LABEL org.opencontainers.image.licenses="PolyForm-Noncommercial-1.0.0"
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    WEB_DIR=/app/web
WORKDIR /app
COPY --from=deps /deps/node_modules ./node_modules
COPY --from=build /src/apps/server/dist ./server
COPY --from=build /src/apps/web/dist ./web
COPY LICENSE LICENSING.md NOTICE.md ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
