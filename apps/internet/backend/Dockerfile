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
COPY apps/internet/backend/package.json ./apps/internet/backend/package.json
RUN npm install --omit=dev

COPY apps/internet/backend/server.js ./apps/internet/backend/server.js

# Run as non-root for security — prevents container breakout escalation
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["npm", "run", "start", "-w", "apps/internet/backend"]