import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8081,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@carbo/chat": path.resolve(__dirname, "../../packages/chat/src"),
      "@carbo/demandas": path.resolve(__dirname, "../../packages/demandas/src"),
      "@carbo/shell": path.resolve(__dirname, "../../packages/shell/src"),
      "@carbo/call": path.resolve(__dirname, "../../packages/call/src"),
      "@carbo/posvenda": path.resolve(__dirname, "../../packages/posvenda/src"),
      "livekit-client": path.resolve(__dirname, "node_modules/livekit-client"),
      // @carbo/chat é source fora do app e importa react-easy-crop no
      // visualizador de imagem. Sem o alias a resolução sobe de
      // packages/chat e não acha nada — não há node_modules na raiz.
      "react-easy-crop": path.resolve(__dirname, "node_modules/react-easy-crop"),
    },
    // pacote compartilhado é código-fonte fora do app: força os deps a resolverem
    // a partir do node_modules DESTE app (evita cópias duplicadas de react etc.).
    dedupe: ["react", "react-dom", "react-router-dom", "@tanstack/react-query", "@supabase/supabase-js", "lucide-react", "sonner"],
  },
});
