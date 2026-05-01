FROM node:20-alpine AS base
WORKDIR /app
RUN npm config set fetch-timeout 300000 \
  && npm config set fetch-retry-mintimeout 15000 \
  && npm config set fetch-retry-maxtimeout 300000 \
  && npm config set fetch-retries 10 \
  && npm install -g pnpm@9.0.0

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/admin ./apps/admin
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter @mywave/shared-types build
RUN pnpm --filter admin build

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
COPY --from=build /app/apps/admin ./apps/admin
RUN pnpm install --prod --frozen-lockfile
WORKDIR /app/apps/admin
EXPOSE 3002
CMD ["pnpm", "start"]
