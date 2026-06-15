# ╔══════════════════════════════════════════════════════════════════╗
# ║  LAN Frontend — PRODUCTION image                                 ║
# ║                                                                  ║
# ║  Same two-stage build as internet frontend.                      ║
# ║                                                                  ║
# ║  Key difference from internet app:                               ║
# ║  No VITE_BACKEND_URL needed. In production the frontend is       ║
# ║  served BY the LAN backend from the same origin (letshare.local  ║
# ║  :3002), so socket.io connects to same-origin automatically.     ║
# ║  The nginx image here is only used if you want to run the        ║
# ║  frontend separately from the backend.                           ║
# ║                                                                  ║
# ║  Port: 80                                                        ║
# ╚══════════════════════════════════════════════════════════════════╝

FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/core/package.json ./packages/core/package.json
COPY apps/lan/frontend/package.json ./apps/lan/frontend/package.json
RUN npm install

COPY packages/core ./packages/core
COPY apps/lan/frontend ./apps/lan/frontend

RUN npm run build -w apps/lan/frontend

# ── Serve ──────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/apps/lan/frontend/dist /usr/share/nginx/html
COPY apps/lan/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]