import { defineConfig, loadEnv } from 'vite'
import react        from '@vitejs/plugin-react'
import tailwindcss  from '@tailwindcss/vite'

// loadEnv lets us read .env variables inside vite.config.js itself
// (process.env is not populated by Vite in config files by default)
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react({ jsxRuntime: 'automatic' }),  // automatic JSX transform — no `import React` needed
      tailwindcss(),                        // Tailwind v4 Vite plugin — no tailwind.config.js needed
    ],

    server: {
      host: '0.0.0.0',   // bind to all interfaces — required for Docker and LAN access
      port: 5173,
      proxy: {
        // In dev, forward all /socket.io requests to the backend.
        // The browser talks to Vite, Vite proxies to the backend — no CORS issues.
        '/socket.io': {
          target:       env.VITE_BACKEND_URL || 'http://localhost:3001',
          ws:           true,   // proxy WebSocket upgrades (required for socket.io)
          changeOrigin: true,
        },
        // Forward the metrics beacon (VITE_METRICS_ENDPOINT=/api/metrics) to the
        // backend too — sendBeacon() resolves relative URLs against the page's
        // own origin (Vite here), so without this proxy the POST silently hits
        // Vite instead of the backend and writeMetrics() never runs.
        '/api': {
          target:       env.VITE_BACKEND_URL || 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },

    preview: {
      host: '0.0.0.0',
      port: 4173,
    },

    // build: {
    //   outDir:    'dist',
    //   sourcemap: false,
    //   // Split vendor chunks for better browser caching
    //   rollupOptions: {
    //     output: {
    //       manualChunks: {
    //         react:    ['react', 'react-dom'],
    //         router:   ['react-router-dom'],
    //         socketio: ['socket.io-client'],
    //       },
    //     },
    //   },
    // },
    build: {
      outDir:    'dist',
      sourcemap: false,
      // Split vendor chunks for better browser caching using function syntax for Rolldown
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react-router-dom')) {
                return 'router';
              }
              if (id.includes('react') || id.includes('react-dom')) {
                return 'react';
              }
              if (id.includes('socket.io-client')) {
                return 'socketio';
              }
            }
          },
        },
      },
    },
  }
})