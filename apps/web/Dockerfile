# Build context is the repo root (see docker-compose.yml) — this Dockerfile
# needs packages/core and packages/cli alongside apps/web to build the
# npm workspace. node:24-slim to match the Node version node:sqlite (used
# instead of a native module — see the project notes) was verified against.
FROM node:24-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      git \
      git-lfs \
      ca-certificates \
    && git lfs install --system \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --shell /bin/bash glab2gh

WORKDIR /app

# Install first, so dependency layers cache independently of source changes.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/cli/package.json packages/cli/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY packages/core packages/core
COPY packages/cli packages/cli
COPY apps/web apps/web
RUN npm run build --workspace=@glab2gh/core \
    && npm run build --workspace=@glab2gh/web

RUN chmod +x apps/web/docker-entrypoint.sh \
    && mkdir -p apps/web/data \
    && chown -R glab2gh:glab2gh /app

USER glab2gh
WORKDIR /app/apps/web

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

VOLUME ["/app/apps/web/data"]

ENTRYPOINT ["./docker-entrypoint.sh"]
