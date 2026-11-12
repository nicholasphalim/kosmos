import { PenghuniShell } from "@/components/layout/RoleShells";

/**
 * Area wajib login: isinya baru bisa dirender di browser setelah sesi (localStorage) dibaca,
 * jadi tidak divalidasi untuk instant navigation. Halaman /login tetap divalidasi.
 */
export const instant = false;

export default function PenghuniLayout({ children }: LayoutProps<"/penghuni">) {
  return <PenghuniShell>{children}</PenghuniShell>;
}
