# Web frontend (Vite + React) for AlfathPOS, served by nginx.
# nginx serves the built static files and proxies /api and /socket.io to the api service.
# Built from the repository root as the Docker build context:
#   docker build -f artifacts/alfath-pos/Dockerfile .

# --- Build stage ---
FROM node:20-bookworm-slim AS build
ARG TARGETARCH
RUN node -e "const expected = process.env.TARGETARCH === 'amd64' ? 'x64' : process.env.TARGETARCH; if (process.arch !== expected) throw new Error('Node architecture does not match target: ' + process.arch + ' != ' + process.env.TARGETARCH)"
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /app

COPY . .

# Install from the same committed lockfile on AMD64 and ARM64. pnpm selects
# platform-specific optional native packages for the target architecture.
RUN pnpm install --frozen-lockfile

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
