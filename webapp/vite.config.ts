import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The web UI lives in src/web and is built into dist/web, which the Node server serves.
export default defineConfig({
  root: "src/web",
  plugins: [react()],
  // assetsInlineLimit 0: never inline fonts as data: URLs (the CSP only allows files from this server)
  build: { outDir: "../../dist/web", emptyOutDir: true, sourcemap: false, assetsInlineLimit: 0 },
  server: { port: 5173, proxy: {"/api/": { target: "http://127.0.0.1:8080", changeOrigin: false, }, }, },
});
