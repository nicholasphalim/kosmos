import { expect, test, type Page } from "@playwright/test";

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

test("Skenario 5: pemilik memanggil teknisi, penghuni konfirmasi selesai, pemilik membayar tagihan", async ({ page }) => {
  // Pemilik: tinjau tiket -> panggil teknisi -> estimasi -> setujui.
  await masukSebagai(page, "Pak Derren");
  const baris = page.getByRole("main").getByRole("listitem").filter({ hasText: "TKT-0057" });
  await baris.getByRole("link", { name: "Tinjau" }).click();
  await expect(page).toHaveURL(/\/pemilik\/tiket\/57/);
  await page.getByRole("button", { name: "Panggil teknisi" }).click();
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

  // Penghuni: konfirmasi selesai. Penghuni tidak menerima tagihan.
  await masukSebagai(page, "Fredo");
  await page.goto("/penghuni/tiket/57");
  await page.getByRole("button", { name: "Ya, sudah beres" }).click();
  await expect(page.getByText("Terima kasih sudah mengonfirmasi. Menunggu pemilik menerima hasil perbaikan.")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Biaya perbaikan ditanggung pemilik kos.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Tagihan" })).toHaveCount(0);
  await keluar(page);

  // Pemilik: terima hasil -> tagihan terbit ke pemilik -> bayar -> tercatat di laporan kas.
  await masukSebagai(page, "Pak Derren");
  await page.goto("/pemilik/tiket/57");
  await expect(page.getByText("Fredo sudah mengonfirmasi beres")).toBeVisible();
  await expect(page.getByRole("link", { name: "Bayar tagihan" })).toHaveCount(0);
  await page.getByRole("button", { name: /^Terima hasil/ }).click();
  await page.getByRole("link", { name: "Bayar tagihan" }).click();
  await expect(page).toHaveURL(/\/pemilik\/tagihan\/\d+/);
  await expect(page.getByText("Ditagihkan ke")).toBeVisible();
  await page.getByRole("button", { name: /^Bayar Rp/ }).click();
  await expect(page.getByRole("heading", { name: "Lunas" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Berhasil · direkonsiliasi")).toBeVisible();
  await page.getByRole("link", { name: "Keuangan" }).click();
  await expect(page.getByText("Biaya perbaikan B-201, ke Pak Slamet").first()).toBeVisible();
});

test("Skenario 5b: pemilik menilai tidak perlu teknisi, tiket ditutup tanpa tagihan", async ({ page }) => {
  await masukSebagai(page, "Pak Derren");
  await page.goto("/pemilik/tiket/57");
  await page.getByRole("button", { name: "Tangani sendiri" }).click();
  await page.getByLabel("Catatan untuk penghuni (opsional)").fill("Stop kontak sudah saya ganti sendiri.");
  await page.getByRole("button", { name: "Tandai sudah ditangani" }).click();
  await expect(page.getByText("Kamu menangani tiket ini tanpa teknisi. Tidak ada tagihan.")).toBeVisible({ timeout: 10_000 });
  await keluar(page);

  // Penghuni melihat catatan pemilik, lalu membuka ulang karena masih bermasalah.
  await masukSebagai(page, "Fredo");
  await page.goto("/penghuni/tiket/57");
  await expect(page.getByText("Pemilik sudah menangani laporan ini tanpa memanggil teknisi.")).toBeVisible();
  await expect(page.getByText(/Catatan pemilik: “Stop kontak sudah saya ganti sendiri.”/)).toBeVisible();
  await page.getByRole("button", { name: "Masih bermasalah" }).click();
  await page.getByLabel("Apa yang masih bermasalah?").fill("Masih ada bau gosong dari stop kontak.");
  await page.getByRole("button", { name: "Buka ulang tiket" }).click();
  await expect(page.getByText(/Pemilik sedang meninjau laporanmu/)).toBeVisible({ timeout: 10_000 });
  await keluar(page);

  // Pemilik melihat alasan dibuka ulang dan bisa memutuskan lagi.
  await masukSebagai(page, "Pak Derren");
  await page.goto("/pemilik/tiket/57");
  await expect(page.getByText(/Dibuka ulang oleh Fredo/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Panggil teknisi" })).toBeVisible();
});

test("Skenario 5c: estimasi ditolak, tiket tetap terbuka dan teknisi lain dicarikan", async ({ page }) => {
  await masukSebagai(page, "Pak Derren");
  await page.goto("/pemilik/tiket/57");
  await page.getByRole("button", { name: "Panggil teknisi" }).click();
  await expect(page.getByText("Teknisi terpilih")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Tolak" }).click();
  await expect(page.getByText(/kamu tolak\. Kamu bisa mencari teknisi lain/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Tangani sendiri" })).toBeVisible();
  await page.getByRole("button", { name: "Cari teknisi lain" }).click();
  // Pak Slamet (estimasinya ditolak) dikecualikan: ada teknisi lain atau pesan tidak ada teknisi lain.
  await expect(page.getByText("Teknisi terpilih").or(page.getByText(/Tidak ada teknisi lain/))).toBeVisible({ timeout: 10_000 });
});

test("Skenario 8: teknisi mengajukan biaya tambahan, pemilik menyetujui sebelum menerima hasil", async ({ page }) => {
  await masukSebagai(page, "Pak Slamet");
  await page.getByRole("link", { name: /Lampu kamar mandi mati total/ }).click();
  await page.getByText("Biaya tambahan di luar estimasi").click();
  await page.getByLabel("Alasan").fill("Fitting lampu ikut meleleh, perlu diganti");
  await page.getByLabel("Jumlah (Rp)").fill("40000");
  await page.getByRole("button", { name: /^Ajukan Rp/ }).click();
  await expect(page.getByText("Menunggu keputusan pemilik.")).toBeVisible({ timeout: 10_000 });
  await keluar(page);

  await masukSebagai(page, "Pak Derren");
  await page.goto("/pemilik/tiket/51");
  await expect(page.getByText("Fitting lampu ikut meleleh, perlu diganti").first()).toBeVisible();
  await page.getByRole("button", { name: "Setujui tambahan" }).click();
  await expect(page.getByText("Disetujui", { exact: true })).toBeVisible({ timeout: 10_000 });
});

test("Skenario 8b: tiket dibatalkan setelah teknisi tiba, biaya kunjungan ditagihkan ke pemilik", async ({ page }) => {
  await masukSebagai(page, "Pak Derren");
  await page.goto("/pemilik/tiket/51");
  page.once("dialog", (d) => {
    expect(d.message()).toContain("biaya kunjungan");
    void d.accept();
  });
  await page.getByRole("button", { name: "Batalkan tiket" }).click();
  await expect(page.getByText(/Biaya kunjungan/).first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole("link", { name: "Bayar tagihan" }).click();
  await expect(page.getByRole("heading", { name: "Tagihan biaya kunjungan" })).toBeVisible();
  await expect(page.getByText("Biaya pengecekan (perbaikan dibatalkan)")).toBeVisible();
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

test("Skenario 7: pemilik gagal membayar lalu berhasil dicoba ulang", async ({ page }) => {
  await masukSebagai(page, "Pak Derren");
  await page.getByRole("link", { name: "Keuangan" }).click();
  await page.getByRole("button", { name: "Invoice" }).click();
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

/* ----- Rent Billing + bayar sekaligus ----- */

const bulanIni = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date());

test("Skenario 9: penghuni membayar sewa bulan ini, tercatat sebagai pemasukan pemilik", async ({ page }) => {
  await masukSebagai(page, "Dea");
  await page.getByRole("link", { name: "Sewa", exact: true }).click();
  await page.getByRole("link", { name: new RegExp(`Sewa ${bulanIni}`) }).click();
  await expect(page.getByRole("heading", { name: `Sewa ${bulanIni}` })).toBeVisible();
  await page.getByRole("button", { name: /^Bayar Rp/ }).click();
  await expect(page.getByRole("heading", { name: "Lunas" })).toBeVisible();
  await keluar(page);

  await masukSebagai(page, "Pak Derren");
  await page.getByRole("link", { name: "Keuangan" }).click();
  await expect(page.getByText(`Sewa A-101 ${bulanIni} · Dea`)).toBeVisible();
  await expect(page.getByText("Pemasukan sewa")).toBeVisible();
});

test("Skenario 10: pemilik menerbitkan tagihan sewa bulan ini untuk penghuni yang belum ditagih", async ({ page }) => {
  await masukSebagai(page, "Pak Derren");
  await page.getByRole("link", { name: "Keuangan" }).click();
  await page.getByRole("button", { name: "Sewa", exact: true }).click();
  await page.getByRole("button", { name: "Terbitkan tagihan bulan ini" }).click();
  await expect(page.getByText(/1 tagihan sewa .* diterbitkan: A-104 \(Putra\)/)).toBeVisible();
  // Idempoten: menerbitkan lagi tidak membuat tagihan ganda.
  await page.getByRole("button", { name: "Terbitkan tagihan bulan ini" }).click();
  await expect(page.getByText(/Semua sewa aktif sudah ditagih/)).toBeVisible();
});

test("Skenario 11: pemilik membayar beberapa invoice perbaikan sekaligus", async ({ page }) => {
  await masukSebagai(page, "Pak Derren");
  await page.getByRole("link", { name: "Keuangan" }).click();
  await page.getByRole("button", { name: "Invoice", exact: true }).click();
  await page.getByRole("button", { name: "Pilih semua" }).click();
  await page.getByRole("link", { name: "Bayar sekaligus" }).click();
  await expect(page.getByRole("heading", { name: "2 invoice perbaikan" })).toBeVisible();
  await page.getByRole("button", { name: /^Bayar Rp/ }).click();
  await expect(page.getByRole("heading", { name: "Lunas" })).toBeVisible();
  await expect(page.getByRole("listitem").getByText("Lunas", { exact: true })).toHaveCount(2);
});
