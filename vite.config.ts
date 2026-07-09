import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { createRequire } from "node:module";

// Criar require para ler package.json
const require = createRequire(import.meta.url);
const pkg = require("./package.json");

export default defineConfig({
  plugins: [
    tanstackStart({
      server: {
        entry: "src/server.ts",
      },
      prerender: {
        enabled: false,
      },
    }),
    nitro({ preset: "vercel" }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    port: 8081,
    strictPort: true,
  },
  preview: {
    port: 8081,
    strictPort: true,
  },
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version || "1.0.0"),
  },
});
