"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { sessionStore } from "@/lib/session";
import { api, unwrap } from "./client";
import type { TiketDetail, TraceStep, UbahStatusRequest } from "./types";

/** Semua query key di satu tempat supaya invalidasi konsisten. */
export const qk = {
  akunDemo: ["auth", "akun-demo"] as const,
  profil: ["penghuni", "me"] as const,
  tiketList: ["tiket"] as const,
  tiket: (id: number) => ["tiket", id] as const,
  notifikasi: ["notifikasi"] as const,
  trace: (idTiket: number) => ["trace", idTiket] as const,
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

/** Trace hanya ada di response ajukanKeluhan, jadi disimpan di cache setelah submit. */
export function useTraceTiket(idTiket: number) {
  return useQuery<TraceStep[] | null>({
    queryKey: qk.trace(idTiket),
    queryFn: () => null,
    staleTime: Infinity,
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
        queryClient.setQueryData(qk.trace(res.tiket.id), res.trace);
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
    },
  });
}

export function useUbahStatusTiket() {
  return useTiketMutation(async (vars: { idTiket: number; status: UbahStatusRequest["status"] }) =>
    unwrap(
      await api.POST("/hmr/tiket/{id_tiket}/status", {
        params: { path: { id_tiket: vars.idTiket } },
        body: { status: vars.status },
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
