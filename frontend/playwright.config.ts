import { defineConfig, devices } from "@playwright/test";

/** E2E skenario demo di mode mock (plan §8, §11). Jalankan: npm run test:e2e */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  // Satu worker: tes "reset lewat terminal" memakai sinyal global yang menghapus sesi di semua tab.
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
