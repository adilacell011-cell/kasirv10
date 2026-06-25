# Web frontend (Vite + React) for AlfathPOS, served by nginx.
# nginx serves the built static files and proxies /api and /socket.io to the api service.
# Built from the repository root as the Docker build context:
#   docker build -f artifacts/alfath-pos/Dockerfile .

# --- Build stage ---
FROM node:20-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /app

COPY . .

# This Replit workspace excludes every non-linux-x64 native binary in
# pnpm-workspace.yaml (overrides set to "-") to keep x64 installs small.
# That breaks arm64 image builds because rollup, lightningcss and
# @tailwindcss/oxide have no JS fallback and hard-require their platform's
# native package. Strip those platform-exclusion overrides so pnpm installs
# the native binaries for whatever platform this image is being built for.
RUN sed -i -E "/>.*:[[:space:]]*['\"]-['\"][[:space:]]*$/d" pnpm-workspace.yaml
RUN pnpm install --no-frozen-lockfile

# vite.config.ts requires PORT and BASE_PATH even at build time.
# BASE_PATH=/ makes the app load from the site root (served by nginx).
ENV NODE_ENV=production
ENV BASE_PATH=/
ENV PORT=8080
# Give Node a large heap so the big single-file App.tsx build doesn't OOM,
# especially under emulated (QEMU) arm64 builds on CI.
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN pnpm --filter @workspace/alfath-pos run build

# --- Runtime stage ---
FROM nginx:1.27-alpine
COPY artifacts/alfath-pos/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/artifacts/alfath-pos/dist/public /usr/share/nginx/html
EXPOSE 80
