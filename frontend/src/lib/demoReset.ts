/**
 * Reset data demo (mode mock): menghapus database mock, sesi login, dan status outbox
 * dari localStorage. Dipakai oleh tombol di halaman login, sinyal `npm run demo:reset`,
 * dan fungsi console kosmosResetDemo().
 */
const KEY_TOKEN = "kosmos.demo-reset-token";

function kunciDemo(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith("kosmos.") && k !== KEY_TOKEN) keys.push(k);
  }
  return keys;
}

/** Menghapus data demo. Mengembalikan true bila ada data yang dihapus. */
export function hapusDataDemo(): boolean {
  try {
    const keys = kunciDemo();
    for (const k of keys) localStorage.removeItem(k);
    return keys.length > 0;
  } catch {
    return false;
  }
}

/** Hapus data demo lalu kembali ke halaman login dengan data seed baru. */
export function resetDemo() {
  hapusDataDemo();
  location.replace("/login");
}

/**
 * Membaca token dari /api/demo-reset (diisi oleh `npm run demo:reset`).
 * Token baru = reset data. Bila ada data yang dihapus, halaman dimuat ulang
 * supaya tidak ada state lama yang masih tersimpan di memori.
 */
export async function terapkanSinyalReset(): Promise<void> {
  try {
    const res = await fetch("/api/demo-reset", { cache: "no-store" });
    const { token } = (await res.json()) as { token: string | null };
    if (!token || localStorage.getItem(KEY_TOKEN) === token) return;
    localStorage.setItem(KEY_TOKEN, token);
    if (hapusDataDemo()) {
      location.replace("/login");
      // Tahan request lain sampai halaman baru dimuat.
      await new Promise(() => {});
    }
  } catch {
    /* tanpa sinyal: lanjut seperti biasa */
  }
}
