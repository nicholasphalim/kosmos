import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * E2E mode live: frontend memanggil FastAPI sungguhan. Jalankan: npm run test:e2e:live
 *
 * Backend memakai DATABASE_URL dari backend/.env (project Supabase kosmos-dev) dan me-reset
 * database itu sebelum setiap tes. Jangan arahkan ke kosmos-demo.
 * Port 8001/3101 dipakai agar tidak mengganggu server pengembangan di port 8000/3000.
 */
const API = "http://localhost:8001/api/v1";
const WEB = "http://localhost:3101";

// Diwarisi proses tes: fixture reset (e2e/fixtures.ts) dan scripts/reset-demo.mjs.
process.env.E2E_API_URL = API;
process.env.NEXT_PUBLIC_API_BASE_URL = API;

// Billing dan Rent Billing di backend menyusul di fase P6: skenario pembayaran belum dijalankan.
process.env.E2E_TANPA_PEMBAYARAN = "1";
const SPEC_LIVE = ["complaint-handling.spec.ts", "repair-billing.spec.ts"];
const BELUM_LIVE = /Skenario (7|9|10|11):/;

export default defineConfig({
  ...base,
  testMatch: SPEC_LIVE,
  grepInvert: BELUM_LIVE,
  use: { ...base.use, baseURL: WEB },
  webServer: [
    {
      command: "uv run uvicorn app.main:app --port 8001",
      cwd: "../backend",
      url: "http://localhost:8001/health",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        STORAGE_PROVIDER: "local",
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
      // Supabase dikosongkan: tes memakai demo login, tombol Google tidak ditampilkan.
      env: {
        NEXT_PUBLIC_API_MODE: "live",
        NEXT_PUBLIC_API_BASE_URL: API,
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
        NEXT_DIST_DIR: ".next-live",
      },
    },
  ],
});
