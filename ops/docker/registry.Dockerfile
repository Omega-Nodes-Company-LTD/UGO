# Niente riga `# syntax=`: faceva scaricare il frontend `docker/dockerfile:1`
# da Docker Hub A OGNI build, e il deploy del 2026-08-21 è morto su un 502 di
# registry-1.docker.io prima ancora di cominciare. Il frontend integrato di
# BuildKit (Docker ≥23) copre tutto quel che usiamo, `--mount=type=cache` incluso.
# Il libro genealogico (ADR-073): un registrar in un container suo, con un
# database suo. Non ha la chiave dati delle case, non ha la chiave del
# provider, non sa niente delle anime — solo atti, impronte e firme.
# Build context: root.

FROM node:22-slim AS build
RUN corepack enable pnpm
WORKDIR /repo

# manifests first: dependency layers survive code-only commits
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/registry/package.json apps/registry/
RUN pnpm install --frozen-lockfile --filter registry... --filter @ugo/shared

COPY packages/shared packages/shared
COPY apps/registry apps/registry
RUN pnpm --filter @ugo/shared build && pnpm --filter registry build
# solo le dipendenze di produzione nell'immagine finale
RUN pnpm install --frozen-lockfile --prod --filter registry... --filter @ugo/shared

FROM node:22-slim AS runtime
RUN useradd --system --create-home ugo
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /repo/node_modules /app/node_modules
COPY --from=build /repo/packages/shared/dist /app/packages/shared/dist
COPY --from=build /repo/packages/shared/package.json /app/packages/shared/
COPY --from=build /repo/packages/shared/node_modules /app/packages/shared/node_modules
COPY --from=build /repo/apps/registry/dist /app/dist
COPY --from=build /repo/apps/registry/package.json /app/
COPY --from=build /repo/apps/registry/node_modules /app/node_modules

USER ugo
EXPOSE 3100
CMD ["node", "dist/index.js"]
