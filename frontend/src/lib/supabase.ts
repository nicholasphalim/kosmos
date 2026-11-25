"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "@/lib/config";

/**
 * Klien Supabase HANYA untuk login Google (Supabase Auth).
 * Data tidak pernah dibaca/ditulis dari sini: semua lewat FastAPI (plan §1.2, §7.2).
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Login Google hanya tersedia di mode live dan bila env Supabase diisi. */
export const loginGoogleTersedia = config.apiMode === "live" && Boolean(url && key);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!loginGoogleTersedia) throw new Error("Login Google tidak tersedia di mode ini.");
  client ??= createClient(url!, key!, {
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

/** Access token Supabase terbaru (supabase-js memperbaruinya otomatis sebelum kedaluwarsa). */
export async function tokenGoogle(): Promise<string | null> {
  if (!loginGoogleTersedia) return null;
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}

export async function keluarGoogle(): Promise<void> {
  if (!loginGoogleTersedia) return;
  try {
    await supabase().auth.signOut();
  } catch {
    /* sesi lokal tetap dihapus oleh pemanggil */
  }
}

export function mulaiLoginGoogle() {
  return supabase().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback`, queryParams: { prompt: "select_account" } },
  });
}
