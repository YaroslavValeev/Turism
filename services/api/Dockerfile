FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

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
RUN corepack enable
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/api ./services/api
RUN pnpm install --prod --frozen-lockfile
WORKDIR /app/services/api
EXPOSE 3001
CMD ["pnpm", "start"]
