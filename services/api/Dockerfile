FROM node:20-bookworm-slim AS base
ARG NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Не полагаемся на Corepack для pnpm: он качает pnpm с registry с коротким connect-timeout
# и на части VPS падает (UND_ERR_CONNECT_TIMEOUT → сборка ломается на deps).
# При недоступности registry.npmjs.org: docker compose build --build-arg NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
RUN npm config set fetch-timeout 300000 \
  && npm config set fetch-retry-mintimeout 15000 \
  && npm config set fetch-retry-maxtimeout 300000 \
  && npm config set fetch-retries 10 \
  && npm config set registry "$NPM_CONFIG_REGISTRY" \
  && npm install -g pnpm@9.0.0

FROM base AS deps
ARG NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY services/api ./services/api
RUN printf '\n# gentler installs on flaky VPS/registry paths\nfetch-timeout=600000\nnetwork-concurrency=2\n' >> .npmrc
RUN npm config set registry "$NPM_CONFIG_REGISTRY" \
  && pnpm config set registry "$NPM_CONFIG_REGISTRY" \
  && pnpm install --frozen-lockfile

FROM deps AS build
ARG PRISMA_ENGINES_MIRROR=
ENV PRISMA_ENGINES_MIRROR=${PRISMA_ENGINES_MIRROR}
RUN pnpm --filter @mywave/config build
# prisma generate парсит datasource — нужен валидный DATABASE_URL (БД не должна быть доступна).
RUN DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public" pnpm --filter api db:generate
RUN pnpm --filter api build

FROM node:20-bookworm-slim AS runtime
ARG NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
ARG PRISMA_ENGINES_MIRROR=
ENV PRISMA_ENGINES_MIRROR=${PRISMA_ENGINES_MIRROR}
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN npm config set fetch-timeout 300000 \
  && npm config set fetch-retry-mintimeout 15000 \
  && npm config set fetch-retry-maxtimeout 300000 \
  && npm config set fetch-retries 10 \
  && npm config set registry "$NPM_CONFIG_REGISTRY" \
  && npm install -g pnpm@9.0.0
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/api ./services/api
RUN printf '\n# gentler installs on flaky VPS/registry paths\nfetch-timeout=600000\nnetwork-concurrency=2\n' >> .npmrc
RUN npm config set registry "$NPM_CONFIG_REGISTRY" \
  && pnpm config set registry "$NPM_CONFIG_REGISTRY" \
  && pnpm install --prod --frozen-lockfile
# После --prod клиент Prisma не сгенерирован; generate обязателен для runtime.
# DATABASE_URL нужен парсеру схемы (datasource); на рантайме подставится из .env.production.
RUN DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public" pnpm --filter api exec prisma generate
# Сборка падает, если tsx не в prod-зависимостях api (иначе prisma/ts-операции в контейнере ломаются).
RUN pnpm --filter api exec tsx --version
WORKDIR /app/services/api
EXPOSE 3001
CMD ["pnpm", "start"]
