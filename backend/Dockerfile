# backend/Dockerfile
# Multi-stage build for local development and CI integration tests.
# NOT the production image -- production deploys are managed by Coolify (ADR-014, EPIC-12).
#
# Stages:
#   deps    -- install all dependencies (including devDependencies needed by build)
#   build   -- compile TypeScript -> dist/
#   runtime -- lean image with only production deps + compiled output
#
# The runtime CMD runs pending migrations then starts the server.
# DB_HOST is overridden to "postgres" by docker-compose so the container
# reaches the compose postgres service rather than its own loopback.

# Stage 1: install all dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Stage 2: compile TypeScript
FROM deps AS build
COPY . .
RUN npm run build

# Stage 3: lean runtime image
FROM node:22-alpine AS runtime
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 3000

# Paths are `dist/src/…`, not `dist/…`. `migrations/` and `seed/` sit beside
# `src/` and are inside the build program, so TypeScript's common source
# directory is the package root and the emit is `dist/src/`, `dist/migrations/`,
# `dist/seed/`. `nest start` hides this in development (it joins outDir with
# nest-cli.json's sourceRoot), which is why the un-prefixed paths that used to
# be here were never exercised — they only ran here, and they failed with
# MODULE_NOT_FOUND. `dist/src/database/data-source.js` resolves its own
# migrations glob as `../../migrations` → `dist/migrations/*.js`, which this
# same emit produces, so the compiled migrations need no separate COPY.
CMD ["sh", "-c", "node -e \"require('./dist/src/database/data-source').AppDataSource.initialize().then(ds => ds.runMigrations()).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); })\" && node dist/src/main.js"]
