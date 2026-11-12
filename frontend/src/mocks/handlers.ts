/**
 * Handler MSW: satu handler per endpoint di contracts/openapi.yaml.
 * Peran file ini sama dengan router.py di FastAPI: parsing request -> panggil service -> response.
 */
import { http, HttpResponse } from "msw";
import type { ErrorResponse, UbahStatusRequest } from "@/lib/api/types";
import { auth, complaintTicket, hmr, mediaStorage, notification, ServiceError, tenantLease, aiClassification } from "./services";

const BASE = "/api/v1";

type Ctx = { request: Request; params: Record<string, string | readonly string[] | undefined> };

/** Membungkus resolver: ServiceError -> response error seragam dari kontrak. */
function handle(fn: (ctx: Ctx) => Promise<Response> | Response) {
  return async (ctx: Ctx) => {
    try {
      return await fn(ctx);
    } catch (e) {
      if (e instanceof ServiceError) {
        return HttpResponse.json<ErrorResponse>({ error: { kode: e.kode, pesan: e.message } }, { status: e.status });
      }
      console.error("[mock api]", e);
      return HttpResponse.json<ErrorResponse>(
        { error: { kode: "INTERNAL", pesan: "Terjadi kesalahan pada mock API." } },
        { status: 500 },
      );
    }
  };
}

const user = (req: Request) => auth.currentUser(req.headers.get("Authorization"));
const idParam = (v: Ctx["params"][string]) => Number(Array.isArray(v) ? v[0] : v);

export const handlers = [
  /* ----- Auth (demo) ----- */
  http.get(`${BASE}/auth/demo-accounts`, handle(() => HttpResponse.json(auth.akunDemo()))),

  http.post(
    `${BASE}/auth/demo-login`,
    handle(async ({ request }) => {
      const body = (await request.json()) as { id_pengguna: number };
      return HttpResponse.json(auth.login(body.id_pengguna));
    }),
  ),

  /* ----- Task: Handle Maintenance Request ----- */
  http.post(
    `${BASE}/hmr/keluhan`,
    handle(async ({ request }) => {
      const u = user(request);
      const form = await request.formData();
      const deskripsi = String(form.get("deskripsi") ?? "");
      const files = form.getAll("lampiran").filter((x): x is File => x instanceof File);
      const res = await hmr.ajukanKeluhan(u, deskripsi, files);
      return HttpResponse.json(res.body, { status: res.status });
    }),
  ),

  http.post(
    `${BASE}/hmr/tiket/:id_tiket/status`,
    handle(async ({ request, params }) => {
      const u = user(request);
      const body = (await request.json()) as UbahStatusRequest;
      return HttpResponse.json(await hmr.ubahStatus(u, idParam(params.id_tiket), body.status));
    }),
  ),

  http.post(
    `${BASE}/hmr/tiket/:id_tiket/klasifikasi-ulang`,
    handle(async ({ request, params }) =>
      HttpResponse.json(await hmr.klasifikasiUlang(user(request), idParam(params.id_tiket))),
    ),
  ),

  /* ----- Entity: Tenant and Lease ----- */
  http.get(
    `${BASE}/penghuni/me`,
    handle(({ request }) => {
      const u = user(request);
      auth.requireRole(u, "penghuni");
      return HttpResponse.json(tenantLease.profil(u.id));
    }),
  ),

  http.get(
    `${BASE}/unit/:id_unit/sewa`,
    handle(({ request, params }) => {
      user(request);
      return HttpResponse.json(tenantLease.getStatusSewa(idParam(params.id_unit)));
    }),
  ),

  /* ----- Entity: Complaint Ticket ----- */
  http.get(`${BASE}/tiket`, handle(({ request }) => HttpResponse.json(complaintTicket.list(user(request))))),

  http.get(
    `${BASE}/tiket/:id_tiket`,
    handle(({ request, params }) =>
      HttpResponse.json(complaintTicket.detail(user(request), idParam(params.id_tiket))),
    ),
  ),

  http.get(
    `${BASE}/keluhan/:id_keluhan`,
    handle(({ request, params }) => {
      user(request);
      return HttpResponse.json(complaintTicket.toKeluhan(complaintTicket.getKeluhanRow(idParam(params.id_keluhan))));
    }),
  ),

  /* ----- Utility (endpoint agnostic, untuk dipakai ulang proses lain) ----- */
  http.post(
    `${BASE}/media`,
    handle(async ({ request }) => {
      user(request);
      const file = (await request.formData()).get("file");
      if (!(file instanceof File)) throw new ServiceError(422, "FILE_KOSONG", "Field file wajib diisi.");
      mediaStorage.validasi([file]);
      return HttpResponse.json(mediaStorage.simpan(file, null), { status: 201 });
    }),
  ),

  http.post(
    `${BASE}/klasifikasi`,
    handle(async ({ request }) => {
      user(request);
      const body = (await request.json()) as { teks: string; media_url?: string[] };
      return HttpResponse.json(aiClassification.classify(body.teks, body.media_url?.length ?? 0));
    }),
  ),

  http.get(`${BASE}/notifikasi`, handle(({ request }) => HttpResponse.json(notification.list(user(request))))),
];
