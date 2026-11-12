"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { FullPageLoader } from "@/components/ui/FullPageLoader";
import type { Pengguna, Role } from "@/lib/api/types";
import { useSession } from "@/lib/session";

export const BERANDA_ROLE: Record<Role, string> = {
  penghuni: "/penghuni/lapor",
  pemilik: "/pemilik",
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
    if (!session) router.replace("/login");
    else if (salahRole) router.replace(BERANDA_ROLE[session.pengguna.role]);
  }, [session, salahRole, router]);

  if (!session || salahRole) return <FullPageLoader />;
  return children(session.pengguna);
}
