# Niente riga `# syntax=`: faceva scaricare il frontend `docker/dockerfile:1`
# da Docker Hub A OGNI build, e il deploy del 2026-08-21 è morto su un 502 di
# registry-1.docker.io prima ancora di cominciare. Il frontend integrato di
# BuildKit (Docker ≥23) copre tutto quel che usiamo, `--mount=type=cache` incluso.
# La reception (ADR-051): l'unica superficie pubblica. Il container non ha
# database, non ha chiavi dati, non ha chiave del provider — solo il segreto
# di servizio verso soul (UGO_RECEPTION_TOKEN) e la UI. Build context: root.

FROM node:22-slim AS build
RUN corepack enable pnpm
WORKDIR /repo

# manifests first: dependency layers survive code-only commits
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/reception/package.json apps/reception/turbo.json apps/reception/
RUN pnpm install --frozen-lockfile --filter reception... --filter @ugo/shared

COPY packages/shared packages/shared
COPY apps/reception apps/reception
RUN pnpm --filter @ugo/shared build && pnpm --filter reception build

FROM node:22-slim AS runtime
RUN useradd --system --create-home ugo
WORKDIR /app
ENV NODE_ENV=production

# `output: standalone` (next.config.ts): il server minimo con i node_modules
# tracciati, niente sorgenti e niente toolchain nell'immagine finale
COPY --from=build --chown=ugo:ugo /repo/apps/reception/.next/standalone ./
COPY --from=build --chown=ugo:ugo /repo/apps/reception/.next/static ./apps/reception/.next/static

USER ugo
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
EXPOSE 3001
CMD ["node", "apps/reception/server.js"]
