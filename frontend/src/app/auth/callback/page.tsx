"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { BERANDA_ROLE } from "@/components/layout/RoleGuard";
import { FullPageLoader } from "@/components/ui/FullPageLoader";
import { api, unwrap, ApiError } from "@/lib/api/client";
import { sessionStore } from "@/lib/session";
import { keluarGoogle, loginGoogleTersedia, supabase } from "@/lib/supabase";

/**
 * Tujuan redirect setelah login Google (plan §7.2):
 * tukar kode PKCE menjadi sesi Supabase -> GET /auth/me -> simpan sesi -> beranda sesuai role.
 * Email yang belum didaftarkan pemilik ditolak backend (403) dan dikembalikan ke /login dengan pesan.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const sudah = useRef(false);

  useEffect(() => {
    if (sudah.current) return; // StrictMode menjalankan efek dua kali; kode PKCE hanya bisa ditukar sekali.
    sudah.current = true;

    async function selesaikan() {
      if (!loginGoogleTersedia) return router.replace("/login");
      const code = new URLSearchParams(window.location.search).get("code");
      if (!code) return router.replace("/login?galat=gagal");

      const { data, error } = await supabase().auth.exchangeCodeForSession(code);
      if (error || !data.session) return router.replace("/login?galat=gagal");

      try {
        const token = data.session.access_token;
        const pengguna = unwrap(await api.GET("/auth/me", { headers: { Authorization: `Bearer ${token}` } }));
        queryClient.clear();
        sessionStore.set({ token, pengguna: { id: pengguna.id, nama: pengguna.nama, role: pengguna.role }, sumber: "google" });
        router.replace(BERANDA_ROLE[pengguna.role]);
      } catch (e) {
        await keluarGoogle();
        const kode = e instanceof ApiError && e.kode === "EMAIL_BELUM_TERDAFTAR" ? "belum-terdaftar" : "gagal";
        router.replace(`/login?galat=${kode}`);
      }
    }

    void selesaikan();
  }, [router, queryClient]);

  return (
    <div className="night min-h-screen">
      <FullPageLoader />
    </div>
  );
}
