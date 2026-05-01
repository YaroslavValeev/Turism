FROM node:20-alpine AS base
WORKDIR /app
# Corepack качает pnpm с registry с коротким таймаутом — на части VPS падает (UND_ERR_CONNECT_TIMEOUT).
RUN npm config set fetch-timeout 300000 \
  && npm config set fetch-retry-mintimeout 15000 \
  && npm config set fetch-retry-maxtimeout 300000 \
  && npm config set fetch-retries 10 \
  && npm install -g pnpm@9.0.0

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter @mywave/shared-types build
RUN pnpm --filter web build

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
COPY --from=build /app/apps/web ./apps/web
RUN pnpm install --prod --frozen-lockfile
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
