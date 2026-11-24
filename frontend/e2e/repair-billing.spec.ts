import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * Repair Verification + Billing & Commission di mode mock.
 * Satu konteks browser per tes = localStorage bersih = data seed baru.
 */

const TAB_ROLE: Record<string, string> = { "Pak Derren": "Pemilik", "Pak Slamet": "Teknisi" };

async function masukSebagai(page: Page, nama: string) {
  await page.goto("/login");
  if (TAB_ROLE[nama]) await page.getByRole("tab", { name: TAB_ROLE[nama] }).click();
  await page.getByRole("button", { name: new RegExp(nama) }).click();
  await expect(page).toHaveURL(/\/(penghuni|pemilik|teknisi)/);
}

async function keluar(page: Page) {
  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page.getByRole("heading", { name: "Masuk sebagai" })).toBeVisible();
}

/** File gambar palsu ≥ 1 KB (mock Evidence Verification hanya memeriksa metadata). */
const foto = (name: string, isi: number) => ({ name, mimeType: "image/png", buffer: Buffer.alloc(4096, isi) });

test("Skenario 5: estimasi disetujui, teknisi memperbaiki, penghuni konfirmasi lalu membayar", async ({ page }) => {
  // Pemilik: estimasi sudah dibuat otomatis setelah klasifikasi -> setujui.
  await masukSebagai(page, "Pak Derren");
  const baris = page.getByRole("main").getByRole("listitem").filter({ hasText: "TKT-0057" });
  await baris.getByRole("link", { name: "Tinjau estimasi" }).click();
  await expect(page).toHaveURL(/\/pemilik\/tiket\/57/);
  await expect(page.getByText("Teknisi terpilih")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Pak Slamet").first()).toBeVisible();
  await page.getByText(/Hasil pencocokan teknisi/).click();
  await expect(page.getByText("Belum terverifikasi").first()).toBeVisible();
  await expect(page.getByText("Penanganan prioritas (< 4 jam)")).toBeVisible();
  await page.getByRole("button", { name: /^Setujui Rp/ }).click();
  await expect(page.getByText("Menunggu jadwal").first()).toBeVisible({ timeout: 10_000 });
  await keluar(page);

  // Penghuni: pilih jadwal.
  await masukSebagai(page, "Fredo");
  await page.goto("/penghuni/tiket/57");
  await expect(page.getByText("Kapan teknisi boleh datang?")).toBeVisible();
  await page.getByRole("button", { name: "Konfirmasi jadwal" }).click();
  await expect(page.getByText(/Teknisi datang/)).toBeVisible({ timeout: 10_000 });
  await keluar(page);

  // Teknisi: tiba, mulai, unggah bukti.
  await masukSebagai(page, "Pak Slamet");
  await expect(page).toHaveURL(/\/teknisi/);
  await page.getByRole("link", { name: /Stop kontak memercikkan api/ }).click();
  await page.getByRole("button", { name: "Saya sudah tiba" }).click();
  await page.getByRole("button", { name: "Mulai perbaikan" }).click();
  await expect(page.getByText("Perbaikan dimulai")).toBeVisible({ timeout: 10_000 });
  await page.getByLabel("Foto sebelum").setInputFiles(foto("sebelum.png", 1));
  await page.getByLabel("Foto sesudah").setInputFiles(foto("sesudah.png", 2));
  await page.getByRole("button", { name: "Kirim bukti" }).click();
  await expect(page.getByText(/Bukti terverifikasi\. Menunggu Fredo/)).toBeVisible({ timeout: 10_000 });
  await keluar(page);

  // Penghuni: konfirmasi selesai -> invoice -> bayar.
  await masukSebagai(page, "Fredo");
  await page.goto("/penghuni/tiket/57");
  await page.getByRole("button", { name: "Ya, sudah beres" }).click();
  await expect(page).toHaveURL(/\/penghuni\/tagihan\/\d+\?baru=1/, { timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Perbaikan selesai" })).toBeVisible();
  await page.getByRole("button", { name: /^Bayar Rp/ }).click();
  await expect(page.getByRole("heading", { name: "Lunas" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Berhasil · direkonsiliasi")).toBeVisible();
  await keluar(page);

  // Pemilik: transaksi tercatat di laporan kas.
  await masukSebagai(page, "Pak Derren");
  await page.getByRole("link", { name: "Keuangan" }).click();
  await expect(page.getByText("Pembayaran perbaikan B-201 oleh Fredo").first()).toBeVisible();
});

test("Skenario 6: bukti dengan foto yang sama ditolak Evidence Verification", async ({ page }) => {
  await masukSebagai(page, "Pak Slamet");
  await page.getByRole("link", { name: /Lampu kamar mandi mati total/ }).click();
  await page.getByLabel("Foto sebelum").setInputFiles(foto("sama.png", 7));
  await page.getByLabel("Foto sesudah").setInputFiles(foto("sama.png", 7));
  await page.getByRole("button", { name: "Kirim bukti" }).click();
  await expect(page.getByText("Bukti sebelumnya ditolak. Unggah ulang:")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("alert").getByText("Bukan foto yang sama")).toBeVisible();
});

test("Skenario 7: pembayaran gagal lalu berhasil dicoba ulang", async ({ page }) => {
  await masukSebagai(page, "Dea");
  await page.getByRole("link", { name: "Tagihan" }).click();
  await page.getByRole("link", { name: /Lampu depan kamar berkedip/ }).click();
  await page.getByLabel("GoPay").check();
  await page.getByLabel(/simulasikan pembayaran gagal/).check();
  await page.getByRole("button", { name: /^Bayar Rp/ }).click();
  await expect(page.getByText(/Pembayaran gagal: Saldo e-wallet tidak cukup/)).toBeVisible({ timeout: 10_000 });

  await page.getByLabel(/simulasikan pembayaran gagal/).uncheck();
  await page.getByLabel("QRIS").check();
  await page.getByRole("button", { name: /^Bayar Rp/ }).click();
  await expect(page.getByRole("heading", { name: "Lunas" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Riwayat pembayaran")).toBeVisible();
});

test("Guard: teknisi tidak bisa membuka dashboard pemilik", async ({ page }) => {
  await masukSebagai(page, "Pak Slamet");
  await expect(page).toHaveURL(/\/teknisi/);
  await page.goto("/pemilik");
  await expect(page).toHaveURL(/\/teknisi/);
});
