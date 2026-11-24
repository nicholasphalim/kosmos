/**
 * Handler MSW: satu handler per endpoint di contracts/openapi.yaml.
 * Peran file ini sama dengan router.py di FastAPI: parsing request -> panggil service -> response.
 */
import { http, HttpResponse } from "msw";
import type { ErrorResponse, LogRequest, MetodePembayaran, UbahStatusRequest } from "@/lib/api/types";
import {
  aiClassification,
  auth,
  complaintTicket,
  csm,
  hmr,
  invoice,
  mediaStorage,
  notification,
  ServiceError,
  tenantLease,
  workOrder,
} from "./services";

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

  /* ----- Task: HMR, bagian Repair Verification ----- */
  http.get(
    `${BASE}/hmr/tiket/:id_tiket/estimasi`,
    handle(({ request, params }) => HttpResponse.json(hmr.getEstimasi(user(request), idParam(params.id_tiket)))),
  ),

  http.post(
    `${BASE}/hmr/tiket/:id_tiket/estimasi`,
    handle(async ({ request, params }) =>
      HttpResponse.json(await hmr.buatEstimasi(user(request), idParam(params.id_tiket)), { status: 201 }),
    ),
  ),

  http.post(
    `${BASE}/hmr/estimasi/:id_estimasi/persetujuan`,
    handle(async ({ request, params }) => {
      const body = (await request.json()) as { disetujui: boolean };
      return HttpResponse.json(await hmr.setPersetujuan(user(request), idParam(params.id_estimasi), Boolean(body.disetujui)));
    }),
  ),

  http.post(
    `${BASE}/hmr/work-order/:id_work_order/jadwal`,
    handle(async ({ request, params }) => {
      const body = (await request.json()) as { jadwal: string };
      return HttpResponse.json(await hmr.konfirmasiJadwal(user(request), idParam(params.id_work_order), body.jadwal));
    }),
  ),

  /* ----- Task: Complete and Settle Maintenance ----- */
  http.post(
    `${BASE}/csm/work-order/:id_work_order/log`,
    handle(async ({ request, params }) => {
      const body = (await request.json()) as LogRequest;
      return HttpResponse.json(await csm.catatLog(user(request), idParam(params.id_work_order), body.aktivitas, body.catatan));
    }),
  ),

  http.post(
    `${BASE}/csm/work-order/:id_work_order/bukti`,
    handle(async ({ request, params }) => {
      const u = user(request);
      const form = await request.formData();
      const file = (k: string) => {
        const v = form.get(k);
        return v instanceof File && v.size > 0 ? v : null;
      };
      return HttpResponse.json(await csm.unggahBukti(u, idParam(params.id_work_order), file("sebelum"), file("sesudah")));
    }),
  ),

  http.post(
    `${BASE}/csm/work-order/:id_work_order/konfirmasi`,
    handle(async ({ request, params }) => {
      const body = (await request.json()) as { selesai: boolean; catatan?: string };
      return HttpResponse.json(await csm.konfirmasi(user(request), idParam(params.id_work_order), Boolean(body.selesai), body.catatan));
    }),
  ),

  http.post(
    `${BASE}/csm/invoice/:id_invoice/bayar`,
    handle(async ({ request, params }) => {
      const body = (await request.json()) as { metode: MetodePembayaran; simulasi_gagal?: boolean };
      return HttpResponse.json(await csm.bayar(user(request), idParam(params.id_invoice), body.metode, Boolean(body.simulasi_gagal)));
    }),
  ),

  /* ----- Entity: Work Order, Invoice, Financial Ledger ----- */
  http.get(
    `${BASE}/work-order`,
    handle(({ request }) => {
      const q = new URL(request.url).searchParams.get("id_tiket");
      return HttpResponse.json(workOrder.list(user(request), q ? Number(q) : undefined));
    }),
  ),

  http.get(
    `${BASE}/work-order/:id_work_order`,
    handle(({ request, params }) => HttpResponse.json(workOrder.detail(user(request), idParam(params.id_work_order)))),
  ),

  http.get(`${BASE}/invoice`, handle(({ request }) => HttpResponse.json(invoice.list(user(request))))),

  http.get(
    `${BASE}/invoice/:id_invoice`,
    handle(({ request, params }) => HttpResponse.json(invoice.detail(user(request), idParam(params.id_invoice)))),
  ),

  http.get(`${BASE}/laporan-kas`, handle(({ request }) => HttpResponse.json(csm.laporanKas(user(request))))),

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
