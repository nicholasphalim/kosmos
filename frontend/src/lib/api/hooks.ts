"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { sessionStore } from "@/lib/session";
import { api, unwrap } from "./client";
import type { LogRequest, MetodePembayaran, TiketDetail, UbahStatusRequest, WorkOrder } from "./types";

/** Semua query key di satu tempat supaya invalidasi konsisten. */
export const qk = {
  akunDemo: ["auth", "akun-demo"] as const,
  profil: ["penghuni", "me"] as const,
  tiketList: ["tiket"] as const,
  tiket: (id: number) => ["tiket", id] as const,
  notifikasi: ["notifikasi"] as const,
  estimasi: (idTiket: number) => ["estimasi", idTiket] as const,
  workOrderList: ["work-order"] as const,
  workOrderTiket: (idTiket: number) => ["work-order", "tiket", idTiket] as const,
  workOrder: (id: number) => ["work-order", id] as const,
  invoiceList: ["invoice"] as const,
  invoice: (id: number) => ["invoice", id] as const,
  laporanKas: ["laporan-kas"] as const,
  sewaList: ["tagihan-sewa"] as const,
  sewa: (id: number) => ["tagihan-sewa", id] as const,
};

/* ---------- Auth (demo) ---------- */

export function useAkunDemo() {
  return useQuery({
    queryKey: qk.akunDemo,
    queryFn: async () => unwrap(await api.GET("/auth/demo-accounts")),
  });
}

export function useDemoLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (idPengguna: number) =>
      unwrap(await api.POST("/auth/demo-login", { body: { id_pengguna: idPengguna } })),
    onSuccess: (res) => {
      queryClient.clear();
      sessionStore.set({ token: res.token, pengguna: res.pengguna });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return () => {
    sessionStore.clear();
    queryClient.clear();
    router.replace("/login");
  };
}

/* ---------- Entity: Tenant and Lease ---------- */

export function useProfilPenghuni() {
  return useQuery({
    queryKey: qk.profil,
    queryFn: async () => unwrap(await api.GET("/penghuni/me")),
  });
}

/* ---------- Entity: Complaint Ticket ---------- */

export function useTiketList() {
  return useQuery({
    queryKey: qk.tiketList,
    queryFn: async () => unwrap(await api.GET("/tiket")),
  });
}

export function useTiketDetail(idTiket: number) {
  return useQuery({
    queryKey: qk.tiket(idTiket),
    queryFn: async () =>
      unwrap(await api.GET("/tiket/{id_tiket}", { params: { path: { id_tiket: idTiket } } })),
    enabled: Number.isFinite(idTiket),
  });
}

/* ---------- Utility: Notification ---------- */

export function useNotifikasi() {
  return useQuery({
    queryKey: qk.notifikasi,
    queryFn: async () => unwrap(await api.GET("/notifikasi")),
    refetchInterval: 10_000,
  });
}

/* ---------- Task: Handle Maintenance Request ---------- */

export function useAjukanKeluhan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { deskripsi: string; lampiran: File[] }) =>
      unwrap(
        await api.POST("/hmr/keluhan", {
          // Body bertipe sesuai kontrak; serializer mengubahnya menjadi multipart/form-data.
          body: { deskripsi: input.deskripsi, lampiran: [] },
          bodySerializer: (body) => {
            const form = new FormData();
            form.append("deskripsi", body.deskripsi);
            for (const file of input.lampiran) form.append("lampiran", file);
            return form;
          },
        }),
      ),
    onSuccess: (res) => {
      if (res.tiket) {
        queryClient.setQueryData(qk.tiket(res.tiket.id), res.tiket);
      }
      void queryClient.invalidateQueries({ queryKey: qk.tiketList, exact: true });
      void queryClient.invalidateQueries({ queryKey: qk.notifikasi });
    },
  });
}

/** Mutasi Task yang mengembalikan TiketDetail: perbarui cache detail, daftar, dan outbox. */
function useTiketMutation<TVars>(call: (vars: TVars) => Promise<TiketDetail>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: call,
    onSuccess: (tiket) => {
      queryClient.setQueryData(qk.tiket(tiket.id), tiket);
      void queryClient.invalidateQueries({ queryKey: qk.tiketList, exact: true });
      void queryClient.invalidateQueries({ queryKey: qk.notifikasi });
      // Pembatalan bisa ikut membatalkan work order dan menerbitkan invoice biaya kunjungan.
      void queryClient.invalidateQueries({ queryKey: qk.workOrderTiket(tiket.id) });
      void queryClient.invalidateQueries({ queryKey: qk.estimasi(tiket.id) });
      for (const key of [qk.workOrderList, qk.invoiceList, qk.laporanKas]) void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useUbahStatusTiket() {
  return useTiketMutation(async (vars: { idTiket: number; status: UbahStatusRequest["status"]; catatan?: string }) =>
    unwrap(
      await api.POST("/hmr/tiket/{id_tiket}/status", {
        params: { path: { id_tiket: vars.idTiket } },
        body: { status: vars.status, catatan: vars.catatan },
      }),
    ),
  );
}

export function useBukaUlangTiket() {
  return useTiketMutation(async (vars: { idTiket: number; alasan: string }) =>
    unwrap(
      await api.POST("/hmr/tiket/{id_tiket}/buka-ulang", {
        params: { path: { id_tiket: vars.idTiket } },
        body: { alasan: vars.alasan },
      }),
    ),
  );
}

export function useKlasifikasiUlang() {
  return useTiketMutation(async (idTiket: number) =>
    unwrap(
      await api.POST("/hmr/tiket/{id_tiket}/klasifikasi-ulang", {
        params: { path: { id_tiket: idTiket } },
      }),
    ),
  );
}

/* ===================================================================== */
/* Repair Verification                                                    */
/* ===================================================================== */

export function useEstimasiTiket(idTiket: number) {
  return useQuery({
    queryKey: qk.estimasi(idTiket),
    queryFn: async () =>
      unwrap(await api.GET("/hmr/tiket/{id_tiket}/estimasi", { params: { path: { id_tiket: idTiket } } })),
    enabled: Number.isFinite(idTiket),
  });
}

/** Work order sebuah tiket (paling baru), atau null bila belum ada. */
export function useWorkOrderTiket(idTiket: number) {
  return useQuery({
    queryKey: qk.workOrderTiket(idTiket),
    queryFn: async () =>
      unwrap(await api.GET("/work-order", { params: { query: { id_tiket: idTiket } } }))[0] ?? null,
    enabled: Number.isFinite(idTiket),
    refetchInterval: 10_000,
  });
}

export function useWorkOrderList() {
  return useQuery({
    queryKey: qk.workOrderList,
    queryFn: async () => unwrap(await api.GET("/work-order")),
    refetchInterval: 10_000,
  });
}

export function useWorkOrder(id: number) {
  return useQuery({
    queryKey: qk.workOrder(id),
    queryFn: async () =>
      unwrap(await api.GET("/work-order/{id_work_order}", { params: { path: { id_work_order: id } } })),
    enabled: Number.isFinite(id),
  });
}

/** Setelah mutasi perbaikan: segarkan semua data yang ikut berubah lintas service. */
function useSegarkanPerbaikan() {
  const queryClient = useQueryClient();
  return (wo: WorkOrder | null, idTiket?: number) => {
    if (wo) {
      queryClient.setQueryData(qk.workOrder(wo.id), wo);
      queryClient.setQueryData(qk.workOrderTiket(wo.id_tiket), wo);
    }
    const tiket = idTiket ?? wo?.id_tiket;
    if (tiket !== undefined) {
      void queryClient.invalidateQueries({ queryKey: qk.tiket(tiket) });
      void queryClient.invalidateQueries({ queryKey: qk.estimasi(tiket) });
    }
    for (const key of [qk.tiketList, qk.workOrderList, qk.invoiceList, qk.notifikasi, qk.laporanKas]) {
      void queryClient.invalidateQueries({ queryKey: key, exact: key !== qk.workOrderList && key !== qk.invoiceList });
    }
  };
}

export function useBuatEstimasi() {
  const queryClient = useQueryClient();
  const segarkan = useSegarkanPerbaikan();
  return useMutation({
    mutationFn: async (idTiket: number) =>
      unwrap(await api.POST("/hmr/tiket/{id_tiket}/estimasi", { params: { path: { id_tiket: idTiket } } })),
    onSuccess: (res) => {
      queryClient.setQueryData(qk.estimasi(res.estimasi.id_tiket), res.estimasi);
      segarkan(null, res.estimasi.id_tiket);
    },
  });
}

export function usePersetujuanBiaya() {
  const queryClient = useQueryClient();
  const segarkan = useSegarkanPerbaikan();
  return useMutation({
    mutationFn: async (vars: { idEstimasi: number; disetujui: boolean }) =>
      unwrap(
        await api.POST("/hmr/estimasi/{id_estimasi}/persetujuan", {
          params: { path: { id_estimasi: vars.idEstimasi } },
          body: { disetujui: vars.disetujui },
        }),
      ),
    onSuccess: (res) => {
      queryClient.setQueryData(qk.estimasi(res.estimasi.id_tiket), res.estimasi);
      queryClient.setQueryData(qk.tiket(res.tiket.id), res.tiket);
      if (!res.work_order) queryClient.setQueryData(qk.workOrderTiket(res.tiket.id), null);
      segarkan(res.work_order, res.tiket.id);
    },
  });
}

export function useKonfirmasiJadwal() {
  const segarkan = useSegarkanPerbaikan();
  return useMutation({
    mutationFn: async (vars: { idWo: number; jadwal: string }) =>
      unwrap(
        await api.POST("/hmr/work-order/{id_work_order}/jadwal", {
          params: { path: { id_work_order: vars.idWo } },
          body: { jadwal: vars.jadwal },
        }),
      ),
    onSuccess: (wo) => segarkan(wo),
  });
}

export function useCatatLog() {
  const segarkan = useSegarkanPerbaikan();
  return useMutation({
    mutationFn: async (vars: { idWo: number } & LogRequest) =>
      unwrap(
        await api.POST("/csm/work-order/{id_work_order}/log", {
          params: { path: { id_work_order: vars.idWo } },
          body: { aktivitas: vars.aktivitas, catatan: vars.catatan },
        }),
      ),
    onSuccess: (wo) => segarkan(wo),
  });
}

export function useUnggahBukti() {
  const segarkan = useSegarkanPerbaikan();
  return useMutation({
    mutationFn: async (vars: { idWo: number; sebelum: File; sesudah: File }) =>
      unwrap(
        await api.POST("/csm/work-order/{id_work_order}/bukti", {
          params: { path: { id_work_order: vars.idWo } },
          body: { sebelum: "", sesudah: "" },
          bodySerializer: () => {
            const form = new FormData();
            form.append("sebelum", vars.sebelum);
            form.append("sesudah", vars.sesudah);
            return form;
          },
        }),
      ),
    onSuccess: (res) => {
      segarkan(res.work_order);
    },
  });
}

export function useKonfirmasiSelesai() {
  const queryClient = useQueryClient();
  const segarkan = useSegarkanPerbaikan();
  return useMutation({
    mutationFn: async (vars: { idWo: number; selesai: boolean; catatan?: string }) =>
      unwrap(
        await api.POST("/csm/work-order/{id_work_order}/konfirmasi", {
          params: { path: { id_work_order: vars.idWo } },
          body: { selesai: vars.selesai, catatan: vars.catatan },
        }),
      ),
    onSuccess: (res) => {
      queryClient.setQueryData(qk.tiket(res.tiket.id), res.tiket);
      if (res.invoice) queryClient.setQueryData(qk.invoice(res.invoice.id), res.invoice);
      segarkan(res.work_order);
    },
  });
}

/** Pemilik menerima hasil perbaikan (invoice terbit) atau meminta perbaikan ulang. */
export function usePenerimaanPemilik() {
  const queryClient = useQueryClient();
  const segarkan = useSegarkanPerbaikan();
  return useMutation({
    mutationFn: async (vars: { idWo: number; diterima: boolean; catatan?: string }) =>
      unwrap(
        await api.POST("/csm/work-order/{id_work_order}/terima", {
          params: { path: { id_work_order: vars.idWo } },
          body: { diterima: vars.diterima, catatan: vars.catatan },
        }),
      ),
    onSuccess: (res) => {
      queryClient.setQueryData(qk.tiket(res.tiket.id), res.tiket);
      if (res.invoice) queryClient.setQueryData(qk.invoice(res.invoice.id), res.invoice);
      segarkan(res.work_order);
    },
  });
}

export function useAjukanBiayaTambahan() {
  const segarkan = useSegarkanPerbaikan();
  return useMutation({
    mutationFn: async (vars: { idWo: number; alasan: string; jumlah: number }) =>
      unwrap(
        await api.POST("/csm/work-order/{id_work_order}/biaya-tambahan", {
          params: { path: { id_work_order: vars.idWo } },
          body: { alasan: vars.alasan, jumlah: vars.jumlah },
        }),
      ),
    onSuccess: (wo) => segarkan(wo),
  });
}

export function usePersetujuanBiayaTambahan() {
  const segarkan = useSegarkanPerbaikan();
  return useMutation({
    mutationFn: async (vars: { idWo: number; idTambahan: number; disetujui: boolean }) =>
      unwrap(
        await api.POST("/hmr/work-order/{id_work_order}/biaya-tambahan/{id_tambahan}/persetujuan", {
          params: { path: { id_work_order: vars.idWo, id_tambahan: vars.idTambahan } },
          body: { disetujui: vars.disetujui },
        }),
      ),
    onSuccess: (wo) => segarkan(wo),
  });
}

/* ===================================================================== */
/* Billing & Commission                                                   */
/* ===================================================================== */

export function useInvoiceList() {
  return useQuery({
    queryKey: qk.invoiceList,
    queryFn: async () => unwrap(await api.GET("/invoice")),
  });
}

export function useInvoice(id: number) {
  return useQuery({
    queryKey: qk.invoice(id),
    queryFn: async () =>
      unwrap(await api.GET("/invoice/{id_invoice}", { params: { path: { id_invoice: id } } })),
    enabled: Number.isFinite(id),
  });
}

export function useBayarInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { idInvoice: number; metode: MetodePembayaran; simulasiGagal: boolean }) =>
      unwrap(
        await api.POST("/csm/invoice/{id_invoice}/bayar", {
          params: { path: { id_invoice: vars.idInvoice } },
          body: { metode: vars.metode, simulasi_gagal: vars.simulasiGagal },
        }),
      ),
    onSuccess: (res) => {
      queryClient.setQueryData(qk.invoice(res.invoice.id), res.invoice);
      void queryClient.invalidateQueries({ queryKey: qk.invoiceList, exact: true });
      void queryClient.invalidateQueries({ queryKey: qk.workOrderTiket(res.invoice.id_tiket) });
      void queryClient.invalidateQueries({ queryKey: qk.notifikasi });
      void queryClient.invalidateQueries({ queryKey: qk.laporanKas });
    },
  });
}

export function useLaporanKas() {
  return useQuery({
    queryKey: qk.laporanKas,
    queryFn: async () => unwrap(await api.GET("/laporan-kas")),
  });
}

/** Bayar beberapa invoice perbaikan dalam satu transaksi gateway. */
export function useBayarSekaligus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { ids: number[]; metode: MetodePembayaran; simulasiGagal: boolean }) =>
      unwrap(
        await api.POST("/csm/invoice/bayar-sekaligus", {
          body: { id_invoice: vars.ids, metode: vars.metode, simulasi_gagal: vars.simulasiGagal },
        }),
      ),
    onSuccess: (res) => {
      for (const inv of res.invoice) {
        queryClient.setQueryData(qk.invoice(inv.id), inv);
        void queryClient.invalidateQueries({ queryKey: qk.workOrderTiket(inv.id_tiket) });
      }
      void queryClient.invalidateQueries({ queryKey: qk.invoiceList, exact: true });
      void queryClient.invalidateQueries({ queryKey: qk.notifikasi });
      void queryClient.invalidateQueries({ queryKey: qk.laporanKas });
    },
  });
}

/* ===================================================================== */
/* Rent Billing                                                           */
/* ===================================================================== */

export function useTagihanSewaList() {
  return useQuery({
    queryKey: qk.sewaList,
    queryFn: async () => unwrap(await api.GET("/tagihan-sewa")),
  });
}

export function useTagihanSewa(id: number) {
  return useQuery({
    queryKey: qk.sewa(id),
    queryFn: async () => unwrap(await api.GET("/tagihan-sewa/{id_tagihan}", { params: { path: { id_tagihan: id } } })),
    enabled: Number.isFinite(id),
  });
}

export function useTerbitkanSewa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await api.POST("/rb/tagihan-sewa/terbitkan")),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.sewaList, exact: true });
      void queryClient.invalidateQueries({ queryKey: qk.laporanKas });
      void queryClient.invalidateQueries({ queryKey: qk.notifikasi });
    },
  });
}

export function useBayarSewa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; metode: MetodePembayaran; simulasiGagal: boolean }) =>
      unwrap(
        await api.POST("/rb/tagihan-sewa/{id_tagihan}/bayar", {
          params: { path: { id_tagihan: vars.id } },
          body: { metode: vars.metode, simulasi_gagal: vars.simulasiGagal },
        }),
      ),
    onSuccess: (res) => {
      queryClient.setQueryData(qk.sewa(res.tagihan.id), res.tagihan);
      void queryClient.invalidateQueries({ queryKey: qk.sewaList, exact: true });
      void queryClient.invalidateQueries({ queryKey: qk.notifikasi });
      void queryClient.invalidateQueries({ queryKey: qk.laporanKas });
    },
  });
}
