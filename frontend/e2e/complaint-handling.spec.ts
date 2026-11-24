import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** Satu konteks browser per tes = localStorage bersih = data seed baru. */

async function masukSebagai(page: Page, nama: string) {
  await page.goto("/login");
  if (nama === "Pak Derren") await page.getByRole("tab", { name: "Pemilik" }).click();
  await page.getByRole("button", { name: new RegExp(nama) }).click();
}

test("Skenario 1: Dea (sewa aktif) melapor, tiket dibuat dan diklasifikasi AI", async ({ page }) => {
  await masukSebagai(page, "Dea");
  await expect(page).toHaveURL(/\/penghuni\/lapor/);
  await expect(page.getByRole("main").getByText("Sewa aktif", { exact: true })).toBeVisible();

  await page.getByLabel("Apa masalahnya?").fill("AC kamar tidak dingin sejak kemarin malam, dan ada air menetes dari unit indoor.");
  await expect(page.getByText("Terdeteksi: AC")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "ac_indoor.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Kirim laporan" }).click();

  await expect(page).toHaveURL(/\/penghuni\/tiket\/\d+\?baru=1/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Laporan diterima" })).toBeVisible();
  await expect(page.getByText("Kategori: AC")).toBeVisible();
  await expect(page.getByText("Prioritas sedang", { exact: true })).toBeVisible();


  // Outbox WhatsApp penghuni berisi notifikasi baru.
  await page.getByRole("button", { name: /Pesan WhatsApp, \d+ baru/ }).click();
  await expect(page.getByRole("dialog").getByText(/Laporanmu dikategorikan AC/)).toBeVisible();
});

test("Skenario 2: Qiqa (sewa berakhir) melapor, keluhan ditolak tanpa tiket", async ({ page }) => {
  await masukSebagai(page, "Qiqa");
  await expect(page.getByRole("main").getByText("Sewa berakhir", { exact: true })).toBeVisible();
  await page.getByLabel("Apa masalahnya?").fill("Lampu kamar mandi mati sejak pagi.");
  await page.getByRole("button", { name: "Kirim laporan" }).click();

  await expect(page.getByRole("heading", { name: "Sewa kamu sudah berakhir" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Tidak ada tiket yang dibuat.")).toBeVisible();
});

test("Validasi form: deskripsi terlalu pendek tidak dikirim", async ({ page }) => {
  await masukSebagai(page, "Dea");
  await page.getByLabel("Apa masalahnya?").fill("rusak");
  await page.getByRole("button", { name: "Kirim laporan" }).click();
  await expect(page.getByText("Ceritakan masalahnya minimal 10 karakter.")).toBeVisible();
});

test("Skenario 3: Pak Derren memfilter prioritas tinggi lalu membatalkan tiket", async ({ page }) => {
  await masukSebagai(page, "Pak Derren");
  await expect(page).toHaveURL(/\/pemilik/);
  await expect(page.getByRole("heading", { name: "Halo, Pak Derren" })).toBeVisible();

  await page.getByRole("button", { name: /1 prioritas tinggi/ }).click();
  const daftar = page.getByRole("main");
  const baris = daftar.getByRole("listitem").filter({ hasText: "Stop kontak memercikkan api" });
  await expect(baris.getByRole("link", { name: "Tinjau estimasi" })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await baris.getByRole("button", { name: "Batalkan TKT-0057" }).click();

  // Notifikasi status baru muncul di outbox WhatsApp pemilik.
  await expect(page.getByText("Tiket B-201 dibatalkan.")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("group", { name: "Saring status" }).getByRole("button", { name: /Dibatalkan/ }).click();
  await page.getByRole("group", { name: "Saring prioritas" }).getByRole("button", { name: "Semua" }).click();
  await expect(daftar.getByRole("listitem").filter({ hasText: "Stop kontak memercikkan api" })).toBeVisible();
});

test("Skenario 4: tiket tanpa klasifikasi bisa diklasifikasi ulang oleh pemilik", async ({ page }) => {
  await masukSebagai(page, "Pak Derren");
  // Judul tiket ikut diperbarui AI setelah klasifikasi, jadi baris dicari dengan kode tiket.
  const baris = page.getByRole("main").getByRole("listitem").filter({ hasText: "TKT-0056" });
  await expect(baris.getByText("Perlu review")).toBeVisible();
  await baris.getByRole("button", { name: "Klasifikasi ulang" }).click();
  await expect(baris.getByRole("link", { name: "Tinjau estimasi" })).toBeVisible({ timeout: 10_000 });
  await expect(baris.getByText("Perlu review")).toBeHidden();
});

test("Guard: penghuni tidak bisa membuka dashboard pemilik", async ({ page }) => {
  await masukSebagai(page, "Dea");
  await expect(page).toHaveURL(/\/penghuni\/lapor/);
  await page.goto("/pemilik");
  await expect(page).toHaveURL(/\/penghuni\/lapor/);
});

test("Reset data demo lewat tombol di halaman login", async ({ page }) => {
  await masukSebagai(page, "Pak Derren");
  const baris = page.getByRole("main").getByRole("listitem").filter({ hasText: "TKT-0057" });
  page.once("dialog", (d) => d.accept());
  await baris.getByRole("button", { name: "Batalkan TKT-0057" }).click();
  await expect(baris).toBeHidden({ timeout: 10_000 });

  await page.getByRole("button", { name: "Keluar" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Reset data demo" }).click();

  await masukSebagai(page, "Pak Derren");
  await expect(
    page.getByRole("main").getByRole("listitem").filter({ hasText: "TKT-0057" }).getByRole("link", { name: "Tinjau estimasi" }),
  ).toBeVisible();
});

test("Reset data demo lewat terminal (npm run demo:reset)", async ({ page }) => {
  await masukSebagai(page, "Dea");
  await expect(page).toHaveURL(/\/penghuni\/lapor/);

  execSync("node scripts/reset-demo.mjs");
  try {
    await page.reload();
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "Masuk sebagai" })).toBeVisible();
    // Sinyal yang sama tidak me-reset dua kali.
    await masukSebagai(page, "Dea");
    await page.reload();
    await expect(page).toHaveURL(/\/penghuni\/lapor/);
  } finally {
    rmSync(".demo-reset", { force: true });
  }
});
