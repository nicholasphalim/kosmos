import { TeknisiShell } from "@/components/layout/RoleShells";

/** Area wajib login, lihat catatan di app/penghuni/layout.tsx. */
export const instant = false;

export default function TeknisiLayout({ children }: LayoutProps<"/teknisi">) {
  return <TeknisiShell>{children}</TeknisiShell>;
}
