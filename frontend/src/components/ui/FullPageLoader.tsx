import { LogoMark } from "@/components/brand/Logo";

export function FullPageLoader() {
  return (
    <div role="status" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-lilac-50">
      <span className="animate-pulse">
        <LogoMark size={56} />
      </span>
      <span className="text-sm font-semibold text-muted">Menyiapkan Kosmos…</span>
    </div>
  );
}
