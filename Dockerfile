# Openpolis production image: builds the client, then runs the save server, which also serves
# the client. See docs/deploy.md. Build: docker build -t openpolis .

FROM oven/bun:1.4-alpine AS build
WORKDIR /app
ARG VITE_PUBLIC_BASE=/
ENV VITE_PUBLIC_BASE=${VITE_PUBLIC_BASE}
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
# --bun runs tsc and Vite on bun too (the image has no Node).
RUN bun --bun run build

FROM oven/bun:1.4-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
# The server runs its TypeScript directly and shares one file with the client.
COPY server ./server
COPY src/shared/api.ts ./src/shared/api.ts
COPY --from=build /app/dist ./dist
USER bun
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1
CMD ["bun", "server/index.ts"]
