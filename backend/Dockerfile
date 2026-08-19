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
COPY --from=build /app/migrations ./migrations

EXPOSE 3000

CMD ["sh", "-c", "node -e \"require('./dist/database/data-source').AppDataSource.initialize().then(ds => ds.runMigrations()).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); })\" && node dist/main.js"]
