# Build context: mobile/. Pass the backend's public URL at build time:
# --build-arg EXPO_PUBLIC_API_BASE_URL=https://api.example.com/api/v1
# Expo embeds this URL in the browser bundle; container env vars cannot change it.
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci
COPY . .

ARG EXPO_PUBLIC_API_BASE_URL
ENV CI=1 \
    EXPO_NO_TELEMETRY=1 \
    EXPO_PUBLIC_API_BASE_URL=${EXPO_PUBLIC_API_BASE_URL}
RUN node -e "const value = process.env.EXPO_PUBLIC_API_BASE_URL; if (!value) throw new Error('Pass --build-arg EXPO_PUBLIC_API_BASE_URL with the public backend URL, including /api/v1'); const url = new URL(value); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('EXPO_PUBLIC_API_BASE_URL must be an absolute HTTP(S) URL without credentials, query, or fragment');" \
    && npx expo export --platform web

FROM nginx:stable-alpine AS runtime
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
