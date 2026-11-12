/**
 * Berjalan di browser sebelum aplikasi interaktif (konvensi Next.js), tidak pernah di server.
 * Mode mock: nyalakan MSW di sini, bukan di React tree, supaya shell aplikasi tetap bisa
 * di-prerender. API client menunggu janji ini sebelum mengirim request (lib/api/mockReady.ts).
 */
import { config } from "@/lib/config";

if (config.apiMode === "mock") {
  window.__kosmosMockReady = import("@/mocks/browser").then(({ startMockApi }) => startMockApi());
}
