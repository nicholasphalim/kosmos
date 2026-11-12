"use client";

import { useSyncExternalStore } from "react";
import type { Pengguna } from "./api/types";

/**
 * Sesi demo: token + data pengguna, disimpan di localStorage.
 * Store kecil berbasis subscribe/getSnapshot agar bisa dibaca oleh komponen React
 * (lewat useSession) maupun oleh API client (lewat getToken) tanpa prop drilling.
 */
export type Session = { token: string; pengguna: Pengguna };

const KEY = "kosmos.session";
const listeners = new Set<() => void>();
let cache: Session | null | undefined;

function read(): Session | null {
  if (cache !== undefined) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    cache = null;
  }
  return cache;
}

function emit() {
  for (const l of listeners) l();
}

export const sessionStore = {
  get: read,
  getToken: () => read()?.token ?? null,
  set(session: Session) {
    cache = session;
    try {
      localStorage.setItem(KEY, JSON.stringify(session));
    } catch {
      /* mode privat: sesi tetap hidup di memori */
    }
    emit();
  },
  clear() {
    cache = null;
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* abaikan */
    }
    emit();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useSession(): Session | null {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.get, () => null);
}
