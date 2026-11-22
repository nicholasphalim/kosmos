import { LogoMark } from "@/components/brand/Logo";

export function FullPageLoader() {
  return (
    <div role="status" className="flex min-h-screen flex-col items-center justify-center gap-4">
      <span className="animate-pulse">
        <LogoMark size={56} tone="light" />
      </span>
      <span className="text-sm font-semibold text-hero-sub">Menyiapkan Kosmos…</span>
    </div>
  );
}
