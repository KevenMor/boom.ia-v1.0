import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

/**
 * Frontend chama `/api/*` e `/api/supabase-proxy/*` (nexus-client).
 * Isso só funciona se o processo Fastify existir na porta 3001 (ex.: `cd server && npm run dev`).
 * Em `vite preview` não havia proxy — todas as chamadas `/api` viravam 404 até adicionarmos preview.proxy igual ao dev.
 */
const apiDevProxy = {
  "/api": {
    target: "http://127.0.0.1:3001",
    changeOrigin: true,
  },
} as const;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: { ...apiDevProxy },
    hmr: {
      overlay: false,
    },
  },
  preview: {
    host: "::",
    port: 8080,
    proxy: { ...apiDevProxy },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
