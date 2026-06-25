# Web frontend (Vite + React) for AlfathPOS, served by nginx.
# nginx serves the built static files and proxies /api and /socket.io to the api service.
# Built from the repository root as the Docker build context:
#   docker build -f artifacts/alfath-pos/Dockerfile .

# --- Build stage ---
FROM node:20-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile

# vite.config.ts requires PORT and BASE_PATH even at build time.
# BASE_PATH=/ makes the app load from the site root (served by nginx).
ENV NODE_ENV=production
ENV BASE_PATH=/
ENV PORT=8080
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN pnpm --filter @workspace/alfath-pos run build

# --- Runtime stage ---
FROM nginx:1.27-alpine
COPY artifacts/alfath-pos/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/artifacts/alfath-pos/dist/public /usr/share/nginx/html
EXPOSE 80
