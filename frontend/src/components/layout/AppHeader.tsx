"use client";

import { clsx } from "clsx";
import { LogOut, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { useLogout } from "@/lib/api/hooks";
import type { Pengguna } from "@/lib/api/types";
import { inisial } from "@/lib/format";

export type NavItem = { href: string; label: string; icon: LucideIcon; match?: (path: string) => boolean };

export function AppHeader({
  pengguna,
  nav,
  homeHref,
  actions,
}: {
  pengguna: Pengguna;
  nav: NavItem[];
  homeHref: string;
  actions?: ReactNode;
}) {
  const pathname = usePathname();
  const logout = useLogout();

  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex min-h-18 max-w-[1240px] flex-wrap items-center gap-x-7 gap-y-3 px-6 py-3">
        <Link href={homeHref} aria-label="Kosmos, beranda" className="text-navy no-underline">
          <Logo />
        </Link>

        <nav aria-label={`Navigasi ${pengguna.role}`} className="flex flex-1 flex-wrap gap-1">
          {nav.map((item) => {
            const aktif = item.match ? item.match(pathname) : pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={aktif ? "page" : undefined}
                className={clsx(
                  "flex h-11 items-center gap-2 rounded-xl px-3.5 text-[15px] no-underline",
                  aktif ? "bg-lilac-100 font-bold text-navy" : "font-semibold text-muted hover:text-navy",
                )}
              >
                <Icon className="size-4.5" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2.5">
          {actions}
          <div className="flex items-center gap-2.5 rounded-full bg-lilac-50 py-1 pr-3.5 pl-1">
            <span
              aria-hidden
              className={clsx(
                "flex size-9 items-center justify-center rounded-full font-display text-[15px] font-extrabold",
                pengguna.role === "pemilik" ? "bg-navy text-lavender" : "bg-lavender text-navy",
              )}
            >
              {inisial(pengguna.nama)}
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-bold">{pengguna.nama}</span>
              <span className="text-xs text-muted capitalize">{pengguna.role}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={logout}
            aria-label="Keluar"
            title="Keluar"
            className="flex size-11 cursor-pointer items-center justify-center rounded-xl text-muted hover:bg-lilac-100 hover:text-navy"
          >
            <LogOut className="size-5" aria-hidden />
          </button>
        </div>
      </div>
    </header>
  );
}
