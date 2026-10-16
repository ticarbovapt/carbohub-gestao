import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
const app = path.resolve(__dirname, "..");
export default defineConfig({
  root: app,
  server: { port: 8099, strictPort: true },
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\/integrations\/supabase\/client$/, replacement: path.resolve(__dirname, "mockClient.ts") },
      { find: "@carbo/chat", replacement: path.resolve(app, "../../packages/chat/src") },
      { find: "@carbo/demandas", replacement: path.resolve(app, "../../packages/demandas/src") },
      { find: "@carbo/shell", replacement: path.resolve(app, "../../packages/shell/src") },
      { find: "@carbo/call", replacement: path.resolve(app, "../../packages/call/src") },
      { find: "livekit-client", replacement: path.resolve(app, "node_modules/livekit-client") },
      { find: "react-easy-crop", replacement: path.resolve(app, "node_modules/react-easy-crop") },
      { find: "@", replacement: path.resolve(app, "src") },
    ],
    dedupe: ["react", "react-dom", "react-router-dom", "@tanstack/react-query", "@supabase/supabase-js", "lucide-react", "sonner", "@radix-ui/react-alert-dialog"],
  },
});
