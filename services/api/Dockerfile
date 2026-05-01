FROM node:20-alpine AS base
WORKDIR /app
# Не полагаемся на Corepack для pnpm: он качает pnpm с registry с коротким connect-timeout
# и на части VPS падает (UND_ERR_CONNECT_TIMEOUT → сборка ломается на deps).
RUN npm config set fetch-timeout 300000 \
  && npm config set fetch-retry-mintimeout 15000 \
  && npm config set fetch-retry-maxtimeout 300000 \
  && npm config set fetch-retries 10 \
  && npm install -g pnpm@9.0.0

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY services/api ./services/api
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter @mywave/config build
RUN pnpm --filter api db:generate
RUN pnpm --filter api build

FROM node:20-alpine AS runtime
WORKDIR /app
RUN npm config set fetch-timeout 300000 \
  && npm config set fetch-retry-mintimeout 15000 \
  && npm config set fetch-retry-maxtimeout 300000 \
  && npm config set fetch-retries 10 \
  && npm install -g pnpm@9.0.0
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/api ./services/api
RUN pnpm install --prod --frozen-lockfile
# Сборка падает, если tsx не в prod-зависимостях api (иначе prisma/ts-операции в контейнере ломаются).
RUN pnpm --filter api exec tsx --version
WORKDIR /app/services/api
EXPOSE 3001
CMD ["pnpm", "start"]
