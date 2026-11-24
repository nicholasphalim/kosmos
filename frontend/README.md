# Kosmos Frontend — Complaint Handling, Repair Verification, Billing & Commission

Prototype Deliverable 2 (Next.js + TypeScript + Tailwind). Desain mengikuti mockup desain kelompok.
Rencana lengkap: [../docs/IMPLEMENTATION_PLAN.md](../docs/IMPLEMENTATION_PLAN.md).

## Menjalankan

```bash
npm install
npm run dev                  # http://localhost:3000
```

Mode mock tidak butuh backend: request API dicegat MSW (service worker) dan dijawab oleh `src/mocks`.
Data demo disimpan di localStorage browser. Untuk mengembalikan data awal, pilih salah satu:

- Terminal: `npm run demo:reset`, lalu refresh halaman Kosmos di browser.
- Tombol **Reset data demo** di bawah daftar akun pada halaman login.

## Script

| Script | Fungsi |
|---|---|
| `npm run dev` | Server development |
| `npm run build` / `npm start` | Build dan jalankan versi produksi |
| `npm run gen:api` | Generate tipe TypeScript dari `../contracts/openapi.yaml` |
| `npm run typecheck` | Cek tipe (dipakai juga untuk mendeteksi kontrak yang bergeser) |
| `npm run lint` | ESLint |
| `npm run demo:reset` | Kembalikan data demo ke kondisi awal (refresh browser setelahnya) |
| `npm run test:e2e` | Playwright: 12 skenario (build dulu dengan `npm run build`) |

## Struktur

```
src/
├─ app/                      Halaman (App Router)
│  ├─ login/                 Pilih akun demo
│  ├─ penghuni/lapor/        Layanan Pengajuan Keluhan (+ hasil ditolak)
│  ├─ penghuni/tiket/        Tiket saya, detail tiket (+ jadwal, progres, konfirmasi selesai)
│  ├─ penghuni/tagihan/      Daftar invoice, bayar via payment gateway (mock)
│  ├─ pemilik/               Dashboard tiket + WhatsApp Outbox
│  ├─ pemilik/tiket/[id]     Estimasi biaya otomatis, setujui/tolak, pantau work order
│  ├─ pemilik/keuangan/      Laporan kas + daftar invoice
│  └─ teknisi/               Daftar work order, catat log servis, unggah bukti
├─ components/               UI per domain: keluhan, tiket, pemilik, notifikasi, layout, ui
├─ lib/
│  ├─ api/schema.d.ts        GENERATED dari openapi.yaml, jangan diedit
│  ├─ api/client.ts          openapi-fetch + header Authorization: Bearer
│  ├─ api/hooks.ts           TanStack Query (semua akses data lewat sini)
│  ├─ session.ts             Sesi demo (localStorage)
│  ├─ klasifikasi.ts         Aturan keyword MockClassifier (harus sama dengan backend)
│  └─ format.ts, tiketFilter.ts
└─ mocks/                    Backend palsu, disusun per layer SOA
   ├─ db.ts                  Tabel + seed (mengikuti skema Postgres di plan §4)
   ├─ micro.ts               Microservice stateless: matching teknisi, estimasi, verifikasi bukti, komisi
   ├─ services.ts            Task HMR + CSM, Entity, Utility
   └─ handlers.ts            Satu handler per endpoint kontrak
```

## Pindah ke backend sungguhan

1. Jalankan FastAPI yang mengimplementasikan `contracts/openapi.yaml`.
2. Set `NEXT_PUBLIC_API_MODE=live` dan `NEXT_PUBLIC_API_BASE_URL`.
3. Tidak ada komponen yang perlu diubah. Jika kontrak backend berbeda, `npm run gen:api` lalu `npm run typecheck` akan menunjukkan bagian yang harus disesuaikan.

## Akun dan skenario demo

| Akun | Skenario |
|---|---|
| Dea (sewa aktif) | Lapor → tiket dibuat → diklasifikasi AI → WhatsApp ke Dea dan Pak Derren |
| Qiqa (sewa berakhir) | Lapor → ditolak, tidak ada tiket |
| Pak Derren (pemilik) | Filter prioritas tinggi, klasifikasi ulang, batalkan. Buka TKT-0057 → Tinjau estimasi → setujui. Menu Keuangan: laporan kas |
| Fredo (penghuni) | Pilih jadwal kunjungan TKT-0057, konfirmasi selesai TKT-0051 setelah bukti diunggah, lalu bayar |
| Pak Slamet (teknisi) | WO-0012 (sedang dikerjakan): unggah foto sebelum/sesudah. Pekerjaan TKT-0057 muncul setelah estimasi disetujui |
| Dea (penghuni) | Menu Tagihan: INV-0003 belum dibayar. Centang "simulasikan pembayaran gagal" untuk demo gagal lalu bayar ulang |

Alur lengkap tiga proses: Dea/Fredo lapor → Pak Derren cari teknisi dan setujui estimasi → penghuni pilih jadwal → teknisi catat tiba, mulai, unggah bukti (diverifikasi Evidence Verification) → penghuni konfirmasi selesai → invoice terbit (komisi 10% dipotong dari bagian teknisi) → penghuni bayar → laporan kas pemilik bertambah.

Bukti dengan dua foto identik (nama dan ukuran sama) atau foto < 1 KB ditolak Evidence Verification.

Simulasi AI gagal: tulis `#gagal-ai` di deskripsi. Tiket tetap dibuat berstatus "dibuat" dan bisa diklasifikasi ulang oleh pemilik.
