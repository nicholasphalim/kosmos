/**
 * Handler MSW: satu handler per endpoint di contracts/openapi.yaml.
 * Peran file ini sama dengan router.py di FastAPI: parsing request -> panggil service -> response.
 */
import { http, HttpResponse } from "msw";
import type {
  ErrorResponse,
  LogRequest,
  MetodePembayaran,
  PenghuniBaruRequest,
  SewaBaruRequest,
  UbahPenghuniRequest,
  UbahStatusRequest,
} from "@/lib/api/types";
import { resetDb } from "./db";
import {
  aiClassification,
  auth,
  complaintTicket,
  csm,
  hmr,
  invoice,
  mediaStorage,
  notification,
  rb,
  rentInvoice,
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

  /* ----- Auth ----- */
  http.get(`${BASE}/auth/me`, handle(({ request }) => HttpResponse.json(auth.me(user(request))))),

  /* ----- Dev (demo) ----- */
  http.post(
    `${BASE}/dev/reset`,
    handle(() => {
      resetDb();
      return new HttpResponse(null, { status: 204 });
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
      return HttpResponse.json(await hmr.ubahStatus(u, idParam(params.id_tiket), body.status, body.catatan));
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
    `${BASE}/hmr/tiket/:id_tiket/buka-ulang`,
    handle(async ({ request, params }) => {
      const body = (await request.json()) as { alasan?: string };
      return HttpResponse.json(await hmr.bukaUlang(user(request), idParam(params.id_tiket), body.alasan ?? ""));
    }),
  ),

  http.post(
    `${BASE}/hmr/work-order/:id_work_order/biaya-tambahan/:id_tambahan/persetujuan`,
    handle(async ({ request, params }) => {
      const body = (await request.json()) as { disetujui?: boolean };
      return HttpResponse.json(
        await hmr.putuskanBiayaTambahan(user(request), idParam(params.id_work_order), idParam(params.id_tambahan), Boolean(body.disetujui)),
      );
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
    `${BASE}/csm/work-order/:id_work_order/terima`,
    handle(async ({ request, params }) => {
      const body = (await request.json()) as { diterima: boolean; catatan?: string };
      return HttpResponse.json(await csm.terima(user(request), idParam(params.id_work_order), Boolean(body.diterima), body.catatan));
    }),
  ),

  http.post(
    `${BASE}/csm/work-order/:id_work_order/biaya-tambahan`,
    handle(async ({ request, params }) => {
      const body = (await request.json()) as { alasan?: string; jumlah?: number };
      return HttpResponse.json(
        await csm.ajukanBiayaTambahan(user(request), idParam(params.id_work_order), body.alasan ?? "", Number(body.jumlah)),
        { status: 201 },
      );
    }),
  ),

  http.post(
    `${BASE}/csm/invoice/bayar-sekaligus`,
    handle(async ({ request }) => {
      const body = (await request.json()) as { id_invoice?: number[]; metode: MetodePembayaran; simulasi_gagal?: boolean };
      const ids = Array.isArray(body.id_invoice) ? body.id_invoice.map(Number) : [];
      return HttpResponse.json(await csm.bayarSekaligus(user(request), ids, body.metode, Boolean(body.simulasi_gagal)));
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

  /* ----- Task: Rent Billing + Entity: Rent Invoice ----- */
  http.post(
    `${BASE}/rb/tagihan-sewa/terbitkan`,
    handle(async ({ request }) => HttpResponse.json(await rb.terbitkan(user(request)), { status: 201 })),
  ),

  http.post(
    `${BASE}/rb/tagihan-sewa/:id_tagihan/bayar`,
    handle(async ({ request, params }) => {
      const body = (await request.json()) as { metode: MetodePembayaran; simulasi_gagal?: boolean };
      return HttpResponse.json(await rb.bayar(user(request), idParam(params.id_tagihan), body.metode, Boolean(body.simulasi_gagal)));
    }),
  ),

  http.get(`${BASE}/tagihan-sewa`, handle(({ request }) => HttpResponse.json(rentInvoice.list(user(request))))),

  http.get(
    `${BASE}/tagihan-sewa/:id_tagihan`,
    handle(({ request, params }) => HttpResponse.json(rentInvoice.detail(user(request), idParam(params.id_tagihan)))),
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

  http.get(`${BASE}/pemilik/unit`, handle(({ request }) => HttpResponse.json(tenantLease.listUnitPemilik(user(request))))),

  http.get(`${BASE}/pemilik/penghuni`, handle(({ request }) => HttpResponse.json(tenantLease.listPenghuni(user(request))))),

  http.post(
    `${BASE}/pemilik/penghuni`,
    handle(async ({ request }) => {
      const u = user(request);
      const body = (await request.json()) as PenghuniBaruRequest;
      return HttpResponse.json(tenantLease.addPenghuni(u, body), { status: 201 });
    }),
  ),

  http.patch(
    `${BASE}/pemilik/penghuni/:id_pengguna`,
    handle(async ({ request, params }) => {
      const u = user(request);
      const body = (await request.json()) as UbahPenghuniRequest;
      return HttpResponse.json(tenantLease.ubahPenghuni(u, idParam(params.id_pengguna), body));
    }),
  ),

  http.post(
    `${BASE}/pemilik/penghuni/:id_pengguna/sewa`,
    handle(async ({ request, params }) => {
      const u = user(request);
      const body = (await request.json()) as SewaBaruRequest;
      return HttpResponse.json(tenantLease.addSewa(u, idParam(params.id_pengguna), body), { status: 201 });
    }),
  ),

  http.get(
    `${BASE}/unit/:id_unit/sewa`,
    handle(({ request, params }) =>
      HttpResponse.json(tenantLease.statusSewaUntuk(user(request), idParam(params.id_unit))),
    ),
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
