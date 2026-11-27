import { test as base, expect } from "@playwright/test";

/**
 * Mode mock: satu konteks browser per tes = localStorage bersih = data seed baru.
 * Mode live (playwright.live.config.ts): database backend dikembalikan ke seed sebelum setiap tes.
 */
const API_LIVE = process.env.E2E_API_URL;

export const test = base.extend<{ resetBackend: void }>({
  resetBackend: [
    async ({ request }, use) => {
      if (API_LIVE) {
        const res = await request.post(`${API_LIVE}/dev/reset`, { timeout: 60_000 });
        expect(res.ok()).toBe(true);
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect };
