"use client";

import { ChartNoAxesColumnIncreasing, CirclePlus, HardHat, Receipt, Ticket } from "@/components/icons";
import type { ReactNode } from "react";
import { OutboxButton } from "@/components/notifikasi/OutboxButton";
import { AppHeader, type NavItem } from "./AppHeader";
import { RoleGuard } from "./RoleGuard";

const NAV_PENGHUNI: NavItem[] = [
  { href: "/penghuni/lapor", label: "Lapor", icon: CirclePlus },
  { href: "/penghuni/tiket", label: "Tiket saya", icon: Ticket, match: (p) => p.startsWith("/penghuni/tiket") },
  { href: "/penghuni/tagihan", label: "Tagihan", icon: Receipt, match: (p) => p.startsWith("/penghuni/tagihan") },
];

const NAV_PEMILIK: NavItem[] = [
  { href: "/pemilik", label: "Tiket", icon: Ticket, match: (p) => p === "/pemilik" || p.startsWith("/pemilik/tiket") },
  { href: "/pemilik/keuangan", label: "Keuangan", icon: ChartNoAxesColumnIncreasing },
];

const NAV_TEKNISI: NavItem[] = [{ href: "/teknisi", label: "Pekerjaan", icon: HardHat, match: (p) => p.startsWith("/teknisi") }];

export function PenghuniShell({ children }: { children: ReactNode }) {
  return (
    <RoleGuard role="penghuni">
      {(pengguna) => (
        <div className="min-h-screen">
          <AppHeader
            pengguna={pengguna}
            nav={NAV_PENGHUNI}
            homeHref="/penghuni/lapor"
            actions={<OutboxButton pengguna={pengguna} />}
          />
          {children}
        </div>
      )}
    </RoleGuard>
  );
}

export function PemilikShell({ children }: { children: ReactNode }) {
  return (
    <RoleGuard role="pemilik">
      {(pengguna) => (
        <div className="min-h-screen">
          <AppHeader pengguna={pengguna} nav={NAV_PEMILIK} homeHref="/pemilik" />
          {children}
        </div>
      )}
    </RoleGuard>
  );
}

export function TeknisiShell({ children }: { children: ReactNode }) {
  return (
    <RoleGuard role="teknisi">
      {(pengguna) => (
        <div className="min-h-screen">
          <AppHeader pengguna={pengguna} nav={NAV_TEKNISI} homeHref="/teknisi" actions={<OutboxButton pengguna={pengguna} />} />
          {children}
        </div>
      )}
    </RoleGuard>
  );
}
