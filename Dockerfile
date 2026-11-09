# syntax=docker/dockerfile:1.7
# One image for web, worker and migrations; the Deployment picks the command.

FROM node:26-bookworm-slim AS build
WORKDIR /app
ENV CI=true
COPY package.json package-lock.json .npmrc ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/metadata/package.json packages/metadata/
COPY packages/server/package.json packages/server/
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY . .
ARG BOK_VERSION=dev
ENV BOK_VERSION=$BOK_VERSION
# Placeholder values only satisfy env validation during SvelteKit's build analysis; nothing is inlined.
RUN DATABASE_URL=postgres://build ORIGIN=http://build BETTER_AUTH_SECRET=build \
    R2_ACCOUNT_ID=build R2_ACCESS_KEY_ID=build R2_SECRET_ACCESS_KEY=build R2_BUCKET=build \
    npm run build
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:26-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    MIGRATIONS_DIR=/app/packages/db/migrations \
    BODY_SIZE_LIMIT=16M
ARG BOK_VERSION=dev
LABEL org.opencontainers.image.title="bok" org.opencontainers.image.version=$BOK_VERSION
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/apps/web/build ./apps/web/build
COPY --from=build --chown=node:node /app/apps/web/package.json ./apps/web/
COPY --from=build --chown=node:node /app/apps/worker/dist ./apps/worker/dist
COPY --from=build --chown=node:node /app/apps/worker/package.json ./apps/worker/
USER node
EXPOSE 3000 9091
# Default: web server. Worker: ["node","apps/worker/dist/index.js"]. Migrations: ["node","apps/worker/dist/migrate.js"].
CMD ["node", "apps/web/build/index.js"]
