import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// loadEnv lets us read .env variables inside vite.config.js itself — plain
// process.env.VITE_BACKEND_URL does NOT work here, since Vite's config file
// runs in a bare Node process that never sees .env unless you load it
// yourself. Without this, the proxy target below was silently always the
// hardcoded fallback, regardless of what .env said.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react({
        jsxRuntime: "automatic", // ← eliminates the need for `import React` in every file
      }),
      tailwindcss(),
    ],

    server: {
      allowedHosts: ["letshare.home", "letshare.local"],
      host: "0.0.0.0",
      port: 5174,
      proxy: {
        "/socket.io": {
          target:       env.VITE_BACKEND_URL || "http://localhost:3002",
          ws:           true,
          changeOrigin: true,
        },
        // Forward the metrics beacon (VITE_METRICS_ENDPOINT=/api/metrics) to the
        // backend too — otherwise sendBeacon() posts to Vite's own origin and
        // writeMetrics() on the backend never runs.
        "/api": {
          target:       env.VITE_BACKEND_URL || "http://localhost:3002",
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: "0.0.0.0",
      port: 4173,
    },
    build: {
      outDir: "dist",
      sourcemap: false,
    },
  };
});
