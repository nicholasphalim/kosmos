"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { FullPageLoader } from "@/components/ui/FullPageLoader";
import type { Pengguna, Role } from "@/lib/api/types";
import { sessionStore, useSession } from "@/lib/session";

export const BERANDA_ROLE: Record<Role, string> = {
  penghuni: "/penghuni/lapor",
  pemilik: "/pemilik",
  teknisi: "/teknisi",
};

/**
 * Melindungi area per role. Tanpa sesi -> /login; role lain -> berandanya sendiri.
 * Catatan: ini hanya kenyamanan UI. Otorisasi sesungguhnya tetap di backend (401/403).
 */
export function RoleGuard({ role, children }: { role: Role; children: (pengguna: Pengguna) => ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const salahRole = session && session.pengguna.role !== role;

  useEffect(() => {
    // Baca store langsung: saat hydration, `session` masih snapshot server (null)
    // walau sesi ada di localStorage. Tanpa ini, reload halaman mana pun terlempar ke beranda.
    const aktif = sessionStore.get();
    if (!aktif) router.replace("/login");
    else if (aktif.pengguna.role !== role) router.replace(BERANDA_ROLE[aktif.pengguna.role]);
  }, [session, role, router]);

  if (!session || salahRole) return <FullPageLoader />;
  return children(session.pengguna);
}
