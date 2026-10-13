import { defineConfig, devices } from "@playwright/test";

// Browser tests: `npm run test:e2e`. The API is stubbed in e2e/fixtures.ts, so no server,
// password or GitHub is needed - only the web UI (Vite dev server) runs.
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:5199" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } }, // 412 px wide, device pixel ratio 2.625, touch
  ],
  webServer: { command: "npx vite --port 5199 --strictPort --host 127.0.0.1", url: "http://127.0.0.1:5199", reuseExistingServer: false },
});
