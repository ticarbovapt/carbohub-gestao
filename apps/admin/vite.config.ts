import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8082,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@carbo/chat": path.resolve(__dirname, "../../packages/chat/src"),
    },
    dedupe: ["react", "react-dom", "@tanstack/react-query", "@supabase/supabase-js", "lucide-react", "sonner"],
  },
});
