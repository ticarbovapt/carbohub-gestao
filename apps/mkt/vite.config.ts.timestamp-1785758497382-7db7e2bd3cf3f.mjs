// vite.config.ts
import { defineConfig } from "file:///home/user/carbohub-gestao/apps/mkt/node_modules/vite/dist/node/index.js";
import react from "file:///home/user/carbohub-gestao/apps/mkt/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
var __vite_injected_original_dirname = "/home/user/carbohub-gestao/apps/mkt";
var vite_config_default = defineConfig({
  server: {
    host: "::",
    port: 8085
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src"),
      "@carbo/chat": path.resolve(__vite_injected_original_dirname, "../../packages/chat/src"),
      "@carbo/demandas": path.resolve(__vite_injected_original_dirname, "../../packages/demandas/src"),
      "@carbo/shell": path.resolve(__vite_injected_original_dirname, "../../packages/shell/src"),
      "@carbo/call": path.resolve(__vite_injected_original_dirname, "../../packages/call/src"),
      "livekit-client": path.resolve(__vite_injected_original_dirname, "node_modules/livekit-client"),
      // @carbo/chat é source fora do app e importa react-easy-crop no
      // visualizador de imagem. Sem o alias a resolução sobe de
      // packages/chat e não acha nada — não há node_modules na raiz.
      "react-easy-crop": path.resolve(__vite_injected_original_dirname, "node_modules/react-easy-crop")
    },
    dedupe: ["react", "react-dom", "react-router-dom", "@tanstack/react-query", "@supabase/supabase-js", "lucide-react", "sonner"]
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS91c2VyL2NhcmJvaHViLWdlc3Rhby9hcHBzL21rdFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL2hvbWUvdXNlci9jYXJib2h1Yi1nZXN0YW8vYXBwcy9ta3Qvdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL2hvbWUvdXNlci9jYXJib2h1Yi1nZXN0YW8vYXBwcy9ta3Qvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZVwiO1xuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdC1zd2NcIjtcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XG5cbi8vIGh0dHBzOi8vdml0ZWpzLmRldi9jb25maWcvXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBzZXJ2ZXI6IHtcbiAgICBob3N0OiBcIjo6XCIsXG4gICAgcG9ydDogODA4NSxcbiAgfSxcbiAgcGx1Z2luczogW3JlYWN0KCldLFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgIFwiQFwiOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcIi4vc3JjXCIpLFxuICAgICAgXCJAY2FyYm8vY2hhdFwiOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcIi4uLy4uL3BhY2thZ2VzL2NoYXQvc3JjXCIpLFxuICAgICAgXCJAY2FyYm8vZGVtYW5kYXNcIjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuLi8uLi9wYWNrYWdlcy9kZW1hbmRhcy9zcmNcIiksXG4gICAgICBcIkBjYXJiby9zaGVsbFwiOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcIi4uLy4uL3BhY2thZ2VzL3NoZWxsL3NyY1wiKSxcbiAgICAgIFwiQGNhcmJvL2NhbGxcIjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuLi8uLi9wYWNrYWdlcy9jYWxsL3NyY1wiKSxcbiAgICAgIFwibGl2ZWtpdC1jbGllbnRcIjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCJub2RlX21vZHVsZXMvbGl2ZWtpdC1jbGllbnRcIiksXG4gICAgICAvLyBAY2FyYm8vY2hhdCBcdTAwRTkgc291cmNlIGZvcmEgZG8gYXBwIGUgaW1wb3J0YSByZWFjdC1lYXN5LWNyb3Agbm9cbiAgICAgIC8vIHZpc3VhbGl6YWRvciBkZSBpbWFnZW0uIFNlbSBvIGFsaWFzIGEgcmVzb2x1XHUwMEU3XHUwMEUzbyBzb2JlIGRlXG4gICAgICAvLyBwYWNrYWdlcy9jaGF0IGUgblx1MDBFM28gYWNoYSBuYWRhIFx1MjAxNCBuXHUwMEUzbyBoXHUwMEUxIG5vZGVfbW9kdWxlcyBuYSByYWl6LlxuICAgICAgXCJyZWFjdC1lYXN5LWNyb3BcIjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCJub2RlX21vZHVsZXMvcmVhY3QtZWFzeS1jcm9wXCIpLFxuICAgIH0sXG4gICAgZGVkdXBlOiBbXCJyZWFjdFwiLCBcInJlYWN0LWRvbVwiLCBcInJlYWN0LXJvdXRlci1kb21cIiwgXCJAdGFuc3RhY2svcmVhY3QtcXVlcnlcIiwgXCJAc3VwYWJhc2Uvc3VwYWJhc2UtanNcIiwgXCJsdWNpZGUtcmVhY3RcIiwgXCJzb25uZXJcIl0sXG4gIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBMlIsU0FBUyxvQkFBb0I7QUFDeFQsT0FBTyxXQUFXO0FBQ2xCLE9BQU8sVUFBVTtBQUZqQixJQUFNLG1DQUFtQztBQUt6QyxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixNQUFNO0FBQUEsRUFDUjtBQUFBLEVBQ0EsU0FBUyxDQUFDLE1BQU0sQ0FBQztBQUFBLEVBQ2pCLFNBQVM7QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNMLEtBQUssS0FBSyxRQUFRLGtDQUFXLE9BQU87QUFBQSxNQUNwQyxlQUFlLEtBQUssUUFBUSxrQ0FBVyx5QkFBeUI7QUFBQSxNQUNoRSxtQkFBbUIsS0FBSyxRQUFRLGtDQUFXLDZCQUE2QjtBQUFBLE1BQ3hFLGdCQUFnQixLQUFLLFFBQVEsa0NBQVcsMEJBQTBCO0FBQUEsTUFDbEUsZUFBZSxLQUFLLFFBQVEsa0NBQVcseUJBQXlCO0FBQUEsTUFDaEUsa0JBQWtCLEtBQUssUUFBUSxrQ0FBVyw2QkFBNkI7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQUl2RSxtQkFBbUIsS0FBSyxRQUFRLGtDQUFXLDhCQUE4QjtBQUFBLElBQzNFO0FBQUEsSUFDQSxRQUFRLENBQUMsU0FBUyxhQUFhLG9CQUFvQix5QkFBeUIseUJBQXlCLGdCQUFnQixRQUFRO0FBQUEsRUFDL0g7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
