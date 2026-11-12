import createClient, { type Middleware } from "openapi-fetch";
import { config } from "@/lib/config";
import { sessionStore } from "@/lib/session";
import { waitForMockApi } from "./mockReady";
import type { paths } from "./schema";
import type { ErrorResponse } from "./types";

/** Error API dengan bentuk seragam { error: { kode, pesan } } dari kontrak. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly kode: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    // Mode mock: tahan request sampai MSW siap mencegatnya.
    await waitForMockApi();
    const token = sessionStore.getToken();
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  },
  onResponse({ response }) {
    // Token tidak valid: keluarkan sesi supaya guard mengarahkan ke /login.
    if (response.status === 401) sessionStore.clear();
    return response;
  },
};

export const api = createClient<paths>({ baseUrl: config.apiBaseUrl });
api.use(authMiddleware);

/**
 * Mengubah hasil openapi-fetch ({ data, error, response }) menjadi data atau throw ApiError.
 * Dipakai oleh semua hook di hooks.ts.
 */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.error !== undefined || result.data === undefined) {
    const body = result.error as Partial<ErrorResponse> | undefined;
    throw new ApiError(
      result.response.status,
      body?.error?.kode ?? "UNKNOWN",
      body?.error?.pesan ?? `Permintaan gagal (HTTP ${result.response.status})`,
    );
  }
  return result.data;
}
