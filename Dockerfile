FROM node:26-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
COPY . .
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
RUN npm run build && npm run worker:build && npm run admin:build

FROM deps AS migrate-deps
COPY scripts/container-package.mjs ./scripts/container-package.mjs
RUN node scripts/container-package.mjs \
    && npm prune --omit=dev --ignore-scripts --offline \
    && node -e "for (const dir of ['node_modules/@prisma/client', 'node_modules/.prisma', 'node_modules/.cache']) require('node:fs').rmSync(dir, { recursive: true, force: true })" \
    && npm cache clean --force

FROM base AS runtime-files
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/dist/worker.cjs ./dist/worker.cjs
COPY scripts/verify-container-runtime.mjs /tmp/verify-container-runtime.mjs
RUN node /tmp/verify-container-runtime.mjs /app

FROM base AS migrate
ENV NODE_ENV=production
COPY --from=migrate-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=migrate-deps --chown=node:node /app/package.json ./package.json
COPY --from=runtime-files --chown=node:node /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=runtime-files --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/dist/admin ./dist/admin
USER node
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]

FROM base AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=runtime-files --chown=node:node /app ./
USER node
EXPOSE 3000
CMD ["node", "server.js"]
