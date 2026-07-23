# ╔══════════════════════════════════════════════════════════════════╗
# ║  Internet Backend — PRODUCTION image                             ║
# ║                                                                  ║
# ║  What it does:                                                   ║
# ║  • Installs only production deps (--omit=dev, no nodemon)        ║
# ║  • Runs as a non-root user (appuser) — security best practice    ║
# ║  • Includes a HEALTHCHECK so Docker/orchestrators know when      ║
# ║    the server is ready                                           ║
# ║                                                                  ║
# ║  Port: 3001                                                      ║
# ╚══════════════════════════════════════════════════════════════════╝

FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/core/package.json ./packages/core/package.json
COPY apps/internet/backend/package.json ./apps/internet/backend/package.json
RUN npm install --omit=dev

# server.js imports metricsWriter.js via a relative path
# ('../../../packages/core/src/lib/metricsWriter.js') rather than the
# @letshare/core package name, so this has to be copied explicitly —
# npm install alone won't pull it in. Without this, the container crashes
# on startup: "Cannot find module '../../../packages/core/...'".
COPY packages/core ./packages/core
COPY apps/internet/backend/server.js ./apps/internet/backend/server.js

# Run as non-root for security — prevents container breakout escalation
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["npm", "run", "start", "-w", "apps/internet/backend"]