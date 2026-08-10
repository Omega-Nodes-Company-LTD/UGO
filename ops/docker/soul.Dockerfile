# syntax=docker/dockerfile:1
# Multi-stage build for apps/soul. Runtime runs as the non-root `node` user
# with no dev dependencies, no sources and no secrets baked in
# (SECURITY_COMPLIANCE §5-§6). Build context: repository root.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# --- install full workspace deps and build ---------------------------------
FROM base AS build
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
# every workspace package soul depends on, transitively:
# soul → db, memory, psyche, shared · memory → db, prompts, shared · db → shared
COPY apps/soul/package.json apps/soul/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/memory/package.json packages/memory/
COPY packages/psyche/package.json packages/psyche/
COPY packages/prompts/package.json packages/prompts/
COPY tests/factories/package.json tests/factories/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY apps/soul apps/soul
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY packages/memory packages/memory
COPY packages/psyche packages/psyche
COPY packages/prompts packages/prompts
COPY tests/factories tests/factories
RUN pnpm turbo build --filter=soul

# --- prune to production deps for soul only --------------------------------
FROM build AS prune
RUN pnpm --filter=soul deploy --prod --legacy /out

# --- runtime ----------------------------------------------------------------
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prune --chown=node:node /out .
# drizzle migrations travel with the image so the release step can run them
COPY --from=build --chown=node:node /repo/packages/db/drizzle ./node_modules/@ugo/db/drizzle
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then((r)=>process.exit(r.status===503?1:0)).catch(()=>process.exit(1))"]
CMD ["node", "dist/index.js"]
