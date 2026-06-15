# ╔══════════════════════════════════════════════════════════════════╗
# ║  Internet Frontend — PRODUCTION image                            ║
# ║                                                                  ║
# ║  Two-stage build:                                                ║
# ║  Stage 1 (builder): Node 22 runs `vite build` → /app/dist       ║
# ║  Stage 2 (runtime): nginx serves the static dist/ files          ║
# ║                                                                  ║
# ║  Why two stages?                                                 ║
# ║  The final image contains ONLY nginx + static HTML/JS/CSS.       ║
# ║  Node.js, npm, and all source files are discarded, keeping the   ║
# ║  image small and the attack surface minimal.                     ║
# ║                                                                  ║
# ║  VITE_BACKEND_URL is baked into the JS bundle at build time.     ║
# ║  Pass it as a build arg: --build-arg VITE_BACKEND_URL=https://…  ║
# ║                                                                  ║
# ║  Port: 80                                                        ║
# ╚══════════════════════════════════════════════════════════════════╝

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install deps (monorepo-aware)
COPY package.json package-lock.json* ./
COPY packages/core/package.json ./packages/core/package.json
COPY apps/internet/frontend/package.json ./apps/internet/frontend/package.json
RUN npm install

# Copy source
COPY packages/core ./packages/core
COPY apps/internet/frontend ./apps/internet/frontend

# VITE_BACKEND_URL is a build-time variable — it gets embedded in the JS bundle.
# The browser uses this URL to connect its socket to the backend.
# Example: --build-arg VITE_BACKEND_URL=https://share.yourdomain.com
ARG VITE_BACKEND_URL=""
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL

RUN npm run build -w apps/internet/frontend

# ── Stage 2: Serve ────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

# Remove the default nginx welcome page
RUN rm -rf /usr/share/nginx/html/*

# Copy only the compiled assets from the builder stage
COPY --from=builder /app/apps/internet/frontend/dist /usr/share/nginx/html

# Custom nginx config: SPA routing + gzip + cache headers
COPY apps/internet/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]