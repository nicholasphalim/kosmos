"use client";

import { clsx } from "clsx";
import { LogOut, type IkonKosmos } from "@/components/icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AstronotAvatar } from "@/components/brand/AstronotAvatar";
import { Logo } from "@/components/brand/Logo";
import { useLogout } from "@/lib/api/hooks";
import type { Pengguna } from "@/lib/api/types";

export type NavItem = { href: string; label: string; icon: IkonKosmos; match?: (path: string) => boolean };

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
    <header className="sticky top-0 z-20 px-3 pt-3 sm:px-6">
      <div className="glass-night mx-auto flex min-h-16 max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 sm:px-5">
        <Link href={homeHref} aria-label="Kosmos, beranda" className="text-white no-underline">
          <Logo tone="light" />
        </Link>

        <nav aria-label={`Navigasi ${pengguna.role}`} className="order-last flex basis-full flex-wrap gap-1 sm:order-none sm:flex-1 sm:basis-0">
          {nav.map((item) => {
            const aktif = item.match ? item.match(pathname) : pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={aktif ? "page" : undefined}
                className={clsx(
                  "flex h-11 items-center gap-2 rounded-full px-4 text-[15px] no-underline transition-colors duration-200",
                  aktif ? "bg-lavender font-bold text-navy" : "font-semibold text-hero-sub hover:bg-white/10 hover:text-white",
                )}
              >
                <Icon className="size-4.5" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          {actions}
          <div className="flex items-center gap-2.5 rounded-full bg-white/10 p-1 sm:pr-3.5">
            <AstronotAvatar suasana={pengguna.role === "pemilik" ? "pemilik" : "senang"} className="size-9 shrink-0" />
            <span className="hidden flex-col leading-tight sm:flex">
              <span className="text-sm font-bold">{pengguna.nama}</span>
              <span className="text-xs text-hero-sub capitalize">{pengguna.role}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={logout}
            aria-label="Keluar"
            title="Keluar"
            className="flex size-11 cursor-pointer items-center justify-center rounded-full text-hero-sub transition-colors duration-200 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="size-5" aria-hidden />
          </button>
        </div>
      </div>
    </header>
  );
}
