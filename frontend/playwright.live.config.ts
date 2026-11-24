import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * E2E mode live: frontend memanggil FastAPI sungguhan. Jalankan: npm run test:e2e:live
 * Port 8001/3101 dan database sementara dipakai agar tidak mengganggu demo di port 8000/3000.
 */
const API = "http://localhost:8001/api/v1";
const WEB = "http://localhost:3101";

// Diwarisi proses tes: fixture reset (e2e/fixtures.ts) dan scripts/reset-demo.mjs.
process.env.E2E_API_URL = API;
process.env.NEXT_PUBLIC_API_BASE_URL = API;

// Repair Verification dan Billing di backend menyusul (fase B2/B3).
const SPEC_LIVE = ["complaint-handling.spec.ts"];

export default defineConfig({
  ...base,
  testMatch: SPEC_LIVE,
  use: { ...base.use, baseURL: WEB },
  webServer: [
    {
      command: "uv run uvicorn app.main:app --port 8001",
      cwd: "../backend",
      url: "http://localhost:8001/docs",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: `sqlite:///${join(tmpdir(), "kosmos-e2e.db").replaceAll("\\", "/")}`,
        UPLOAD_DIR: join(tmpdir(), "kosmos-e2e-uploads"),
        PUBLIC_BASE_URL: "http://localhost:8001",
        CORS_ORIGINS: WEB,
        DEMO_MODE: "true",
      },
    },
    {
      command: "npm run build && npm run start -- --port 3101",
      url: `${WEB}/login`,
      reuseExistingServer: false,
      timeout: 300_000,
      env: { NEXT_PUBLIC_API_MODE: "live", NEXT_PUBLIC_API_BASE_URL: API, NEXT_DIST_DIR: ".next-live" },
    },
  ],
});
