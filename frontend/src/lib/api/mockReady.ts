declare global {
  interface Window {
    /** Diisi src/instrumentation-client.ts saat NEXT_PUBLIC_API_MODE=mock. */
    __kosmosMockReady?: Promise<void>;
  }
}

/** Selesai saat service worker MSW aktif. Di mode live atau di server langsung selesai. */
export function waitForMockApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return window.__kosmosMockReady ?? Promise.resolve();
}
