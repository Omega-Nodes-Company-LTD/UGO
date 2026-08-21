# Niente riga `# syntax=`: faceva scaricare il frontend `docker/dockerfile:1`
# da Docker Hub A OGNI build, e il deploy del 2026-08-21 è morto su un 502 di
# registry-1.docker.io prima ancora di cominciare. Il frontend integrato di
# BuildKit (Docker ≥23) copre tutto quel che usiamo, `--mount=type=cache` incluso.
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
# apps/face carries Playwright as a dev dependency; the image builds the
# bundle, it never runs the browsers
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
# every workspace package soul depends on, transitively:
# soul → db, memory, psyche, shared · memory → db, prompts, shared · db → shared
# e il registro: soul lo tiene fra le dipendenze di sviluppo perché il test
# d'integrazione dell'adozione (ADR-084) avvia un libro genealogico vero
# accanto all'anima. Qui serve solo il suo manifesto — pnpm deve poter
# risolvere il link di workspace prima di potarlo con `--prod`; nel runtime
# non entra, né lui né i suoi sorgenti.
COPY apps/soul/package.json apps/soul/
COPY apps/registry/package.json apps/registry/
COPY apps/face/package.json apps/face/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/memory/package.json packages/memory/
COPY packages/psyche/package.json packages/psyche/
COPY packages/prompts/package.json packages/prompts/
# ADR-115: il corpo del muso vive in un package suo, e il muso viaggia dentro
# questa immagine (ADR-018 Tempo 1): senza, `turbo build --filter=face` non trova
# ciò che disegna il maiale
COPY packages/face-body/package.json packages/face-body/
COPY tests/factories/package.json tests/factories/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY apps/soul apps/soul
COPY apps/registry apps/registry
COPY apps/face apps/face
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY packages/memory packages/memory
COPY packages/psyche packages/psyche
COPY packages/prompts packages/prompts
COPY packages/face-body packages/face-body
COPY tests/factories tests/factories
# the face travels inside soul's image (ADR-018 Tempo 1): one origin, one
# certificate, therefore a secure context for microphone and wake lock
RUN pnpm turbo build --filter=soul --filter=face

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
COPY --from=build --chown=node:node /repo/apps/face/dist ./public
ENV UGO_FACE_DIR=/app/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then((r)=>process.exit(r.status===503?1:0)).catch(()=>process.exit(1))"]
CMD ["node", "dist/index.js"]
