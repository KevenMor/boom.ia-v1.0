import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const frontPort = Number(env.VITE_DEV_PORT || "8080");
  const apiPort = env.VITE_DEV_API_PORT || "3001";

  /**
   * Frontend chama `/api/*` e `/api/supabase-proxy/*` (nexus-client).
   * Proxy aponta para o Fastify local (`server/.env` → PORT; alinhar com VITE_DEV_API_PORT).
   */
  const apiDevProxy = {
    "/api": {
      target: `http://127.0.0.1:${apiPort}`,
      changeOrigin: true,
    },
  } as const;

  return {
    server: {
      host: "::",
      port: frontPort,
      strictPort: true,
      proxy: { ...apiDevProxy },
      hmr: {
        overlay: false,
      },
    },
    preview: {
      host: "::",
      port: frontPort,
      strictPort: true,
      proxy: { ...apiDevProxy },
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
