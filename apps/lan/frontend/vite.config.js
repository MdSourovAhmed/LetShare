// import { defineConfig } from 'vite'
// import react from '@vitejs/plugin-react'
// import tailwindcss from '@tailwindcss/vite'
// // https://vite.dev/config/
// export default defineConfig({
//   plugins: [react(),tailwindcss()],
// })





import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: "automatic", // ← eliminates the need for `import React` in every file
    }),
    tailwindcss(),
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/socket.io": {
        target: process.env.VITE_BACKEND_URL || "http://localhost:3002",
        ws: true,
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
});