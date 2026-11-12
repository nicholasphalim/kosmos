# Kosmos Frontend — Complaint Handling

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
| `npm run test:e2e` | Playwright: 8 skenario (build dulu dengan `npm run build`) |

## Struktur

```
src/
├─ app/                      Halaman (App Router)
│  ├─ login/                 Pilih akun demo
│  ├─ penghuni/lapor/        Layanan Pengajuan Keluhan (+ hasil ditolak)
│  ├─ penghuni/tiket/        Tiket saya, detail tiket (+ jejak layanan)
│  └─ pemilik/               Dashboard tiket + WhatsApp Outbox
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
   ├─ services.ts            Task HMR, Entity, Utility
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
| Pak Derren (pemilik) | Filter prioritas tinggi, tandai diproses, batalkan, klasifikasi ulang |

Simulasi AI gagal: tulis `#gagal-ai` di deskripsi. Tiket tetap dibuat berstatus "dibuat" dan bisa diklasifikasi ulang oleh pemilik.
