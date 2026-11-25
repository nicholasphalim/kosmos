import { expect, test, type Page } from "@playwright/test";

/**
 * Pendaftaran penghuni oleh pemilik (pengganti sign up, plan §11b #9) di mode mock.
 * Login Google tidak tersedia di mode mock; alur Google dites manual/live (plan §11 skenario 12).
 */

async function masukPemilik(page: Page) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Pemilik" }).click();
  await page.getByRole("button", { name: /Pak Derren/ }).click();
  await expect(page).toHaveURL(/\/pemilik/);
  await page.getByRole("link", { name: "Penghuni", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Daftar penghuni" })).toBeVisible();
}

test("Skenario 12: pemilik mendaftarkan penghuni baru di unit kosong", async ({ page }) => {
  await masukPemilik(page);
  await page.getByRole("button", { name: "Tambah penghuni" }).click();
  await page.getByLabel("Nama").fill("Anggota Baru");
  await page.getByLabel("Email Google").fill("Anggota.Baru@gmail.com");
  await page.getByLabel("Nomor WhatsApp").fill("0812-0000-1111");
  const unit = page.getByLabel("Unit");
  await expect(unit.locator("option", { hasText: /A-102.*kosong/ })).toHaveCount(1);
  await unit.selectOption("8"); // A-102, kosong sejak sewa Qiqa berakhir
  await page.getByRole("button", { name: "Daftarkan penghuni" }).click();

  await expect(page.getByRole("status")).toContainText("Anggota Baru terdaftar di A-102");
  await expect(page.getByText("anggota.baru@gmail.com · 0812-0000-1111")).toBeVisible();
});

test("Pendaftaran ditolak bila email sudah terdaftar", async ({ page }) => {
  await masukPemilik(page);
  await page.getByRole("button", { name: "Tambah penghuni" }).click();
  await page.getByLabel("Nama").fill("Dea Lagi");
  await page.getByLabel("Email Google").fill("dea@kosmos.test");
  await page.getByLabel("Nomor WhatsApp").fill("0812-0000-1111");
  await page.getByLabel("Unit").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Daftarkan penghuni" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Email ini sudah terdaftar." })).toBeVisible();
});

test("Sewa lagi: penghuni dengan sewa berakhir kembali aktif", async ({ page }) => {
  await masukPemilik(page);
  const qiqa = page.getByRole("listitem").filter({ hasText: "Qiqa" });
  await expect(qiqa.getByText("Sewa tidak aktif")).toBeVisible();
  await qiqa.getByRole("button", { name: "Sewa lagi" }).click();
  await qiqa.getByRole("button", { name: "Buat sewa" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Qiqa" }).getByText("Sewa aktif")).toBeVisible();
});
