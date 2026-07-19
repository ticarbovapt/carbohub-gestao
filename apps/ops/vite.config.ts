import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8083,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@carbo/chat": path.resolve(__dirname, "../../packages/chat/src"),
      "@carbo/shell": path.resolve(__dirname, "../../packages/shell/src"),
      "@carbo/call": path.resolve(__dirname, "../../packages/call/src"),
      "livekit-client": path.resolve(__dirname, "node_modules/livekit-client"),
    },
    dedupe: ["react", "react-dom", "@tanstack/react-query", "@supabase/supabase-js", "lucide-react", "sonner"],
  },
});
