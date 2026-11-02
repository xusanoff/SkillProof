# syntax=docker/dockerfile:1.7
# SkillProof web (Next.js standalone). Build context: ./frontend
#   docker build -t skillproof-web --build-arg NEXT_PUBLIC_APP_NAME=SkillProof frontend
# Runtime env: API_INTERNAL_URL (default http://api:8000), PORT (3000).

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM base AS build
# NEXT_PUBLIC_* values are inlined into the client bundle at build time.
ARG NEXT_PUBLIC_APP_NAME=SkillProof
ENV NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME}
ARG NEXT_PUBLIC_WS_URL=ws://localhost:8000
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next/font downloads Onest + Literata from Google Fonts here (network needed at build only).
RUN pnpm build

FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    API_INTERNAL_URL=http://api:8000
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/uz >/dev/null || exit 1
CMD ["node", "server.js"]
