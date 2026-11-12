/**
 * Konfigurasi dari environment variable.
 *
 * NEXT_PUBLIC_API_MODE=mock -> request dicegat MSW (backend palsu di browser).
 * NEXT_PUBLIC_API_MODE=live -> request dikirim ke FastAPI di NEXT_PUBLIC_API_BASE_URL.
 */
export type ApiMode = "mock" | "live";

const mode = process.env.NEXT_PUBLIC_API_MODE === "live" ? "live" : "mock";

export const config = {
  apiMode: mode as ApiMode,
  apiBaseUrl:
    mode === "live" ? (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1") : "/api/v1",
} as const;
