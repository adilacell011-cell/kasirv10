# API server (Express + Prisma + Socket.IO) for AlfathPOS.
# Built from the repository root as the Docker build context:
#   docker build -f artifacts/api-server/Dockerfile .
FROM node:20-bookworm-slim

# BuildKit supplies TARGETARCH for each requested platform. Fail early if QEMU
# or the builder is executing dependencies for the host instead of the target.
ARG TARGETARCH
RUN node -e "const expected = process.env.TARGETARCH === 'amd64' ? 'x64' : process.env.TARGETARCH; if (process.arch !== expected) throw new Error('Node architecture does not match target: ' + process.arch + ' != ' + process.env.TARGETARCH)"

# Prisma needs openssl at runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Use the same pnpm version as the workspace.
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

# Copy the whole monorepo (node_modules are excluded via .dockerignore) and install.
COPY . .
# The lockfile contains the optional native packages for both supported targets;
# pnpm selects the current target's package while keeping resolution reproducible.
RUN pnpm install --frozen-lockfile

# Bundle the server and generate the Prisma client.
RUN pnpm --filter @workspace/api-server run build \
  && pnpm --filter @workspace/api-server exec prisma generate

RUN chmod +x /app/artifacts/api-server/docker-entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["/app/artifacts/api-server/docker-entrypoint.sh"]
