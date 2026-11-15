# Build the API in the full workspace, then package only runtime files and
# production dependencies into the final image.
FROM node:20-bookworm-slim AS build

# BuildKit supplies TARGETARCH for each requested platform. Fail early if QEMU
# or the builder is executing dependencies for the host instead of the target.
ARG TARGETARCH
RUN node -e "const expected = process.env.TARGETARCH === 'amd64' ? 'x64' : process.env.TARGETARCH; if (process.arch !== expected) throw new Error('Node architecture does not match target: ' + process.arch + ' != ' + process.env.TARGETARCH)"

# Prisma needs OpenSSL in both the build and runtime stages.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Use the same pnpm version as the workspace.
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /workspace

# Install from the root workspace so frozen-lockfile resolution stays identical
# to the tested source tree.
COPY . .
RUN pnpm install --frozen-lockfile

# Bundle the server and generate the Prisma client.
RUN pnpm --filter @workspace/api-server run build \
  && pnpm --filter @workspace/api-server exec prisma generate

# The Prisma CLI remains a production dependency because the guarded, one-off
# migration command is run from this same image. pnpm deploy uses the API
# package's "files" allowlist and installs only production dependencies.
RUN pnpm --config.inject-workspace-packages=true \
    --filter @workspace/api-server deploy --prod /runtime/api-server \
  && chmod +x /runtime/api-server/docker-entrypoint.sh

FROM node:20-bookworm-slim AS runtime

ARG TARGETARCH
RUN node -e "const expected = process.env.TARGETARCH === 'amd64' ? 'x64' : process.env.TARGETARCH; if (process.arch !== expected) throw new Error('Node architecture does not match target: ' + process.arch + ' != ' + process.env.TARGETARCH)"

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/artifacts/api-server
COPY --from=build /runtime/api-server/ ./

EXPOSE 8080
ENTRYPOINT ["./docker-entrypoint.sh"]
