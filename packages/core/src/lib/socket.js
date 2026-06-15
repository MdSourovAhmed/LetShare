import { io } from "socket.io-client";

/**
 * Create a socket.io connection.
 *
 * Dev:  Vite proxies /socket.io → backend (see vite.config.js)
 * Prod: VITE_BACKEND_URL is baked in at build time, or falls back to
 *       same-origin (if nginx proxies /socket.io on the same host)
 */
export function createSocket() {
  const url = import.meta.env.VITE_BACKEND_URL ?? "";
  return io(url, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
  });
}