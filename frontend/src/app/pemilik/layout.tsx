import { PemilikShell } from "@/components/layout/RoleShells";

/** Area wajib login, lihat catatan di app/penghuni/layout.tsx. */
export const instant = false;

export default function PemilikLayout({ children }: LayoutProps<"/pemilik">) {
  return <PemilikShell>{children}</PemilikShell>;
}
