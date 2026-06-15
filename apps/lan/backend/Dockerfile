# ╔══════════════════════════════════════════════════════════════════╗
# ║  LAN Backend — PRODUCTION image                                  ║
# ║                                                                  ║
# ║  Production deps only, non-root user, health check.              ║
# ║                                                                  ║
# ║  mDNS / network_mode note — same as dev image above.            ║
# ║  For production on a Linux server, set network_mode: host in     ║
# ║  docker-compose so the container shares the host network stack   ║
# ║  and multicast packets reach the LAN.                            ║
# ║                                                                  ║
# ║  Port: 3002                                                      ║
# ╚══════════════════════════════════════════════════════════════════╝

FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/lan/backend/package.json ./apps/lan/backend/package.json
RUN npm install --omit=dev

COPY apps/lan/backend/server.js ./apps/lan/backend/server.js

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3002

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3002/health || exit 1

CMD ["npm", "run", "start", "-w", "apps/lan/backend"]