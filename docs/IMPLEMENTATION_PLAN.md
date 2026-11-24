# Kosmos — Implementation Plan Prototype (Deliverable 2)

Layanan yang diprototype: **Complaint Handling** (Pengajuan Keluhan, Validasi Sewa Aktif, Manajemen & Klasifikasi Tiket, Notifikasi Status Tiket).
Deadline: minggu ke-2/3 Desember 2026. Fokus saat ini: **frontend dengan mock**, backend menyusul.

---

## 0. Ringkasan keputusan

| Area | Keputusan | Alasan singkat |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind + shadcn/ui | Standar industri, deploy gratis di Vercel |
| Backend | FastAPI (Python 3.12/3.13 via `uv`) | Mapping SOAML ke kode paling jelas, Swagger otomatis |
| Database | SQLite (satu file, tanpa Docker). Jika deploy: Postgres (Neon/Supabase) | Kode sama persis, hanya `DATABASE_URL` yang beda |
| File storage | Folder `backend/uploads`, disajikan lewat `/media-files` | Cukup untuk prototype |
| Akses DB | Hanya backend. Frontend tidak pernah menyentuh DB/Supabase | Syarat SOA: logika bisnis ada di service layer |
| Auth | Demo login (pilih akun) yang menerbitkan JWT asli | Bentuk `Authorization: Bearer` sesuai draf API, tanpa kerumitan registrasi |
| AI Classifier | Sekarang mock (aturan keyword). Akhir: LLM API multimodal (teks + gambar) | Adapter pattern, ganti via env var |
| WhatsApp | Mock sampai akhir, tampil sebagai panel "WhatsApp Outbox" | Provider eksternal, bukan fokus PoC |
| Kontrak | Contract-first: `contracts/openapi.yaml` ditulis dulu | Frontend dan backend dikerjakan terpisah tanpa saling menunggu |

---

## 1. Arsitektur sistem

### 1.1 Gambaran besar

```
┌──────────────────────────── Browser ────────────────────────────┐
│  Next.js (UI)                                                   │
│   pages Penghuni / Pemilik  ─►  lib/api (typed client)          │
│                                   │                             │
│              API_MODE=mock ──► MSW (backend palsu di browser)   │
│              API_MODE=live ──► HTTP ke FastAPI                  │
└───────────────────────────────────┼─────────────────────────────┘
                                    ▼
┌──────────────────────── FastAPI (service layer) ────────────────┐
│  TASK     Handle Maintenance Request (orkestrator)              │
│              │ memanggil, tidak pernah sebaliknya               │
│  ENTITY   Tenant and Lease   │   Complaint Ticket               │
│  UTILITY  Media Storage  │  AI Classification  │  Notification  │
└──────┬───────────────────────────┬───────────────────┬──────────┘
       ▼                           ▼                   ▼
   PostgreSQL               Storage (disk/Supabase)   Adapter eksternal
                                                      (LLM API, WA mock)
```

Analogi untuk pitch deck:
- **Next.js = etalase.** Hanya menampilkan dan mengirim permintaan.
- **FastAPI = layanan.** Semua aturan bisnis ada di sini.
- **Postgres = gudang.** Hanya bisa diakses oleh layanan.

### 1.2 Aturan layering (ini inti SOA-nya)

1. **Task** boleh memanggil Entity dan Utility. Hanya Task yang mengorkestrasi alur.
2. **Entity** hanya mengelola datanya sendiri. Entity tidak memanggil Task, Entity lain, atau Utility.
3. **Utility** tidak tahu domain bisnis (tidak tahu apa itu "tiket").
4. Setiap service **memiliki tabelnya sendiri**. Service lain tidak boleh query tabel itu langsung, harus lewat fungsi publik service pemiliknya.
5. Frontend hanya bicara dengan endpoint HTTP, tidak pernah ke DB.

Ini sekaligus memperbaiki inkonsistensi D2: slide 5/7/20 menjadikan Complaint Ticket (Entity) consumer Notification. Di implementasi, **HMR** yang memanggil Notification setelah status tiket berubah.

### 1.3 Modular monolith

Semua service berjalan dalam satu proses FastAPI, tetapi dipisah per folder dengan batas yang tegas. Antar-service dipanggil lewat fungsi Python (in-process), bukan HTTP.

Alasannya: satu deploy, mudah di-debug, dan tetap SOA karena kontrak dan batasnya jelas. Kalimat untuk dosen: *"Setiap service punya router, skema, dan tabel sendiri, sehingga bisa dipecah menjadi deployment terpisah tanpa mengubah kontraknya."*

---

## 2. Keputusan desain yang menyimpang dari draf D2 (sinkronkan ke slide)

| # | Draf D2 | Implementasi | Alasan |
|---|---|---|---|
| 1 | `addKeluhan` dikirim ke Complaint Ticket | Operasi `ajukanKeluhan` milik **HMR** (sesuai D1: Add Keluhan non-agnostic di Task). Penyimpanan baris `keluhan` lewat Complaint Ticket | Konsisten dengan D1 |
| 2 | `addKeluhan(…, idUnit, …)` sebelum `getIdUnit` | Urutan: identifikasi penghuni → getIdUnit → getStatusSewa → simpan media → simpan keluhan → buat tiket | Sesuai BPMN, validasi dulu |
| 3 | Complaint Ticket → Notification | HMR → Notification | Entity tidak mengorkestrasi |
| 4 | `getIdPenerima` di Tenant and Lease | `getIdPenerima` milik Notification, yang menerima data penerima dari HMR | Sesuai D1 slide 20 |
| 5 | `POST /keluhan/{id}/klasifikasi` | `POST /klasifikasi` (Utility, agnostic) | AI Classification agnostic menurut D1 |
| 6 | Upload `/media` lalu `/keluhan` terpisah | Frontend memanggil satu endpoint Task (multipart). `/media` tetap ada sebagai endpoint Utility | Validasi sewa terjadi sebelum file disimpan |
| 7 | Status tiket 4 nilai | Ditambah `dibatalkan`. Keluhan punya status sendiri `diterima` atau `ditolak` | State machine lengkap |
| 8 | Kategori AC/listrik/air | Ditambah `lainnya` | Fallback bila AI ragu |

---

## 3. Alur utama (Ajukan Keluhan)

```mermaid
sequenceDiagram
    actor P as Penghuni (Next.js)
    participant H as HMR (Task)
    participant T as Tenant and Lease
    participant M as Media Storage
    participant C as Complaint Ticket
    participant A as AI Classification
    participant N as Notification

    P->>H: POST /hmr/keluhan (deskripsi, files, Bearer JWT)
    H->>T: getIdPenghuni(token) dan getIdUnit(idPenghuni)
    H->>T: getStatusSewa(idUnit)
    alt sewa tidak aktif
        H->>C: addKeluhan(status=ditolak, alasan)
        H-->>P: 200 { hasil: "ditolak", alasan }
    else sewa aktif
        H->>M: addLampiranMedia(files)
        M-->>H: urlMedia[]
        H->>C: addKeluhan + addTiket (1 transaksi DB, status=dibuat)
        H->>N: kirim notif "tiket dibuat"
        H->>A: classifyKeluhan(teks, gambar)
        A-->>H: kategori, urgensi, confidence, alasan
        H->>C: setKategoriUrgensi + setStatusTiket(diklasifikasi)
        H->>N: kirim notif "tiket diklasifikasi"
        H-->>P: 201 { hasil: "diterima", keluhan, tiket, trace[] }
    end
```

### 3.1 Detail low-level yang penting

- **Batas transaksi.** Insert `keluhan` dan `tiket` dilakukan dalam satu transaksi DB. Panggilan AI dilakukan *di luar* transaksi, karena memanggil API eksternal yang lambat sambil menahan transaksi DB adalah anti-pattern.
- **AI gagal.** Tiket tetap dibuat dengan status `dibuat` dan `kategori = null`. Response tetap 201 dengan `warning`. Ada endpoint retry `POST /hmr/tiket/{id}/klasifikasi-ulang`.
- **Confidence rendah.** Jika `confidence < 0.6`, kategori menjadi `lainnya` dan ditandai `perlu_review`.
- **Notifikasi gagal** tidak membatalkan proses. Hasil pengiriman dicatat dengan `status_kirim = gagal`.
- **File yatim.** Jika upload berhasil tetapi insert DB gagal, file tertinggal tanpa pemilik. Ini diterima untuk prototype dan dicatat sebagai keterbatasan.
- **`trace[]`.** Response Task menyertakan daftar langkah service yang dipanggil beserta durasinya, misalnya `{service:"Tenant and Lease", operasi:"getStatusSewa", ok:true, ms:4}`. Frontend menampilkannya sebagai stepper. Ini alat peraga utama untuk menjelaskan SOA saat demo.

### 3.2 State machine

```
Keluhan:  diterima | ditolak                      (final, ditentukan oleh validasi sewa)

Tiket:    dibuat ──► diklasifikasi ──► diproses ──► selesai
             │              │              │
             └──────────────┴──────────────┴──► dibatalkan
```

Transisi divalidasi di service Complaint Ticket. Transisi ilegal (misalnya `selesai` ke `dibuat`) mendapat response `409 Conflict`.

Di prototype, Pemilik bisa menekan **"Tandai diproses"**. Tujuannya mendemokan aturan "notifikasi dikirim di setiap perubahan status". Transisi `selesai` milik Repair Verification (CSM), sehingga tidak masuk scope.

---

## 4. Model data (PostgreSQL)

Kepemilikan tabel per service ditandai `[pemilik]`.

```
[Tenant and Lease]
pengguna   id PK, nama, no_wa, role ('penghuni'|'pemilik')
properti   id PK, nama, alamat, id_pemilik FK→pengguna
unit       id PK, id_properti FK, nomor_unit
sewa       id PK, id_unit FK, id_penghuni FK, tanggal_mulai, tanggal_selesai
           -- status_sewa DIHITUNG: aktif jika today BETWEEN mulai AND selesai

[Complaint Ticket]
keluhan    id PK, id_penghuni, id_unit, deskripsi, status ('diterima'|'ditolak'),
           alasan_penolakan NULL, created_at
tiket      id PK, id_keluhan FK UNIQUE, status, kategori NULL, urgensi NULL,
           ai_confidence NULL, ai_alasan NULL, perlu_review bool, created_at, updated_at
tiket_riwayat  id PK, id_tiket FK, dari NULL, ke, oleh, waktu   -- untuk timeline UI

[Media Storage]   (agnostic: dipakai juga untuk bukti perbaikan nanti)
lampiran_media id PK, owner_type ('keluhan'|...), owner_id, url, mime, ukuran_byte, created_at

[Notification]
notifikasi id PK, ref_type, ref_id, id_penerima, kanal ('whatsapp'), no_tujuan,
           pesan, status_kirim ('terkirim'|'gagal'), provider ('mock'|...), created_at
```

Catatan:
- ID memakai integer agar mudah dibaca saat demo. Di UI ditampilkan sebagai kode, misalnya `KLH-0101` atau `TKT-0055`.
- Status sewa dihitung dari tanggal, tidak disimpan, agar tidak pernah basi.
- FK lintas service (misalnya `keluhan.id_penghuni`) cukup disimpan sebagai angka tanpa constraint FK. Ini menjaga batas service (prinsip *database per service* versi ringan).

### 4.1 Seed data demo

| Akun | Role | Kondisi | Dipakai untuk demo |
|---|---|---|---|
| Budi | penghuni | Unit A-101, sewa aktif | Happy path |
| Sari | penghuni | Unit A-102, sewa berakhir | Keluhan ditolak |
| Rina | penghuni | Unit B-201, sewa aktif | Data tiket tambahan |
| Pak Hendra | pemilik | Pemilik properti A dan B | Dashboard pemilik |

---

## 5. Kontrak API (`/api/v1`)

Sumber kebenaran: `contracts/openapi.yaml`. Nama skema mengikuti information model SOAML (`KeluhanRequest`, `KeluhanResponse`, dan seterusnya).

| Layer | Service | Method & path | Operasi SOAML |
|---|---|---|---|
| — | Auth (demo) | `GET /auth/demo-accounts`, `POST /auth/demo-login` | — |
| Task | HMR | `POST /hmr/keluhan` (multipart) | ajukanKeluhan (Add Keluhan) |
| Task | HMR | `POST /hmr/tiket/{id}/status` | ubah status + notifikasi |
| Task | HMR | `POST /hmr/tiket/{id}/klasifikasi-ulang` | retry klasifikasi |
| Entity | Tenant and Lease | `GET /penghuni/me` | getIdPenghuni, getIdUnit |
| Entity | Tenant and Lease | `GET /unit/{id_unit}/sewa` | getStatusSewa |
| Entity | Complaint Ticket | `GET /tiket`, `GET /tiket/{id}` | getTiket (+ riwayat) |
| Entity | Complaint Ticket | `GET /keluhan/{id}` | getKeluhan |
| Utility | Media Storage | `POST /media` | addLampiranMedia |
| Utility | AI Classification | `POST /klasifikasi` | classifyKeluhan |
| Utility | Notification | `GET /notifikasi?penerima=me` | outbox (baca) |

Aturan umum:
- **Format error seragam:** `{ "error": { "kode": "SEWA_TIDAK_AKTIF", "pesan": "…" } }`.
- **Kode status:** 401 untuk token tidak ada atau salah, 403 untuk role salah (misalnya Pemilik memanggil `/hmr/keluhan`), 409 untuk transisi status ilegal, 422 untuk validasi gagal.
- **Otorisasi data:** `GET /tiket` otomatis difilter. Penghuni hanya melihat tiketnya sendiri, Pemilik hanya tiket dari properti miliknya.
- **Batas lampiran (generik, belum ada di D1, konfirmasi ke kelompok):** maksimal 3 file. Gambar jpg/png/webp maksimal 5 MB. Video mp4 maksimal 20 MB. Hanya gambar yang dikirim ke AI.

---

## 6. Frontend (fokus sekarang)

### 6.1 Stack

| Kebutuhan | Library | Peran |
|---|---|---|
| Framework | Next.js App Router + TypeScript | Routing, build |
| Styling/UI | Tailwind + shadcn/ui + lucide-react | Komponen siap pakai, gampang dikustom ke warna Kosmos |
| Server state | TanStack Query | Cache, loading/error state, refetch setelah mutasi |
| Form | React Hook Form + Zod | Validasi form, sejalan dengan aturan kontrak |
| API client | `openapi-typescript` + `openapi-fetch` | Tipe di-generate dari `openapi.yaml`, typo endpoint jadi error compile |
| Mock backend | MSW (Mock Service Worker) | Mencegat `fetch` di browser dan membalas sesuai kontrak |
| Test | Vitest + Testing Library, Playwright (1-2 E2E) | — |

Gunakan versi stabil terbaru saat inisialisasi (`create-next-app@latest`).

**Catatan implementasi (13 Nov 2026).** Frontend Fase 0-2 sudah diimplementasikan di `frontend/`. Versi terpasang: Next.js 16.4, React 19.3, Tailwind 4, MSW 3. Perbedaan dari rencana awal:
- shadcn/ui tidak dipakai. Komponen UI dibuat sendiri dengan Tailwind dan design token dari mockup (`globals.css`), karena kebutuhan komponennya sedikit.
- MSW 3 tidak tersedia di server, jadi dinyalakan di `src/instrumentation-client.ts` (hanya berjalan di browser). API client menunggu MSW siap sebelum request (`src/lib/api/mockReady.ts`). `use(browser())` dan `next/dynamic({ ssr: false })` sengaja tidak dipakai karena menggagalkan validasi instant navigation Next 16.
- Validasi instant navigation diset `manual-warning` di `next.config.ts`, karena area penghuni/pemilik baru bisa dirender setelah sesi di localStorage dibaca.
- Kontrak menambah field `judul` di hasil klasifikasi AI (ringkasan singkat keluhan untuk judul tiket).
- Jejak layanan (`trace`) ditampilkan sebagai panel lipat di halaman detail tiket, sesuai desain final yang tidak menaruhnya di layar utama.

### 6.2 Kenapa data di-fetch di client component

MSW di browser hanya bisa mencegat request dari browser. Fetch di Server Component berjalan di server Next.js dan akan lolos dari MSW. Karena ini aplikasi dashboard yang membutuhkan login, halaman data dibuat sebagai client component yang memakai TanStack Query. Layout dan shell tetap boleh berupa server component.

### 6.3 Halaman

```
/login                       Pilih akun demo (kartu Budi, Sari, Rina, Pak Hendra)
/penghuni                    Ringkasan sewa + daftar tiket saya
/penghuni/keluhan/baru       Form: deskripsi, upload foto/video (preview), submit
                             → panel hasil: diterima/ditolak + stepper trace service
/penghuni/tiket/[id]         Detail tiket: kategori, urgensi, lampiran, timeline status
/pemilik                     Tabel tiket semua unit; filter status/kategori/urgensi; badge urgensi
/pemilik/tiket/[id]          Detail + tombol "Tandai diproses" / "Batalkan"
(global) WhatsApp Outbox     Drawer bergaya layar HP; pesan untuk user yang sedang login
(global) Role badge + ganti akun
```

Setiap halaman wajib menangani empat state: **loading** (skeleton), **kosong**, **error** (pesan + tombol coba lagi), dan **sukses**.

### 6.4 Struktur folder

```
kosmos/
├─ docs/IMPLEMENTATION_PLAN.md
├─ contracts/openapi.yaml           ← ditulis manual di Fase 0
├─ frontend/
│  ├─ src/app/
│  │  ├─ login/page.tsx
│  │  ├─ penghuni/ (page.tsx, keluhan/baru/page.tsx, tiket/[id]/page.tsx, layout.tsx)
│  │  ├─ pemilik/  (page.tsx, tiket/[id]/page.tsx, layout.tsx)
│  │  └─ providers.tsx              ← QueryClient, Session, MSW bootstrap
│  ├─ src/components/
│  │  ├─ ui/                        ← shadcn
│  │  ├─ keluhan/ (KeluhanForm, MediaPicker, HasilPengajuan, ServiceTrace)
│  │  ├─ tiket/   (TiketTable, TiketCard, StatusBadge, UrgensiBadge, StatusTimeline)
│  │  └─ notifikasi/WhatsAppOutbox.tsx
│  ├─ src/lib/
│  │  ├─ api/schema.d.ts            ← GENERATED, jangan diedit
│  │  ├─ api/client.ts              ← openapi-fetch + inject Bearer token
│  │  ├─ api/hooks.ts               ← useTiketList, useAjukanKeluhan, dst.
│  │  ├─ session.tsx                ← token + user di localStorage
│  │  └─ format.ts                  ← kode KLH-/TKT-, tanggal, label status
│  └─ src/mocks/
│     ├─ db.ts                      ← data seed in-memory (+ simpan ke localStorage)
│     ├─ classifier.ts              ← aturan keyword (SAMA dengan MockClassifier backend)
│     ├─ handlers.ts                ← satu handler per endpoint kontrak
│     └─ browser.ts
└─ backend/                         ← Fase 3
```

### 6.5 Mekanisme mock lalu live

```
.env.local
NEXT_PUBLIC_API_MODE=mock          # atau live
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
```

- **Mode mock:** `providers.tsx` menjalankan `worker.start()` sebelum render. Handler MSW mensimulasikan latensi 600-1500 ms, menjalankan logika HMR versi sederhana (cek sewa, buat tiket, klasifikasi keyword, tulis outbox), dan mengembalikan `trace[]`.
- **Mode live:** MSW tidak dijalankan. Request menuju FastAPI.
- **Komponen tidak tahu mode apa yang sedang aktif.** Itulah ukuran keberhasilan arsitektur ini.

Aturan mock classifier (dipakai di frontend mock dan backend `MockClassifier`):
- `ac|dingin|freon|remote ac` → AC
- `listrik|lampu|stop kontak|mcb|korslet` → listrik
- `air|bocor|keran|pipa|wc|toilet` → air
- selain itu → lainnya

Urgensi: `korslet|percikan|banjir|bau gosong` → tinggi; `bocor|mati total` → sedang; selain itu → rendah.

### 6.6 Alur satu klik, dari UI sampai DB (mode live)

1. Penghuni menekan **Kirim**. React Hook Form menjalankan skema Zod (deskripsi minimal 10 karakter, maksimal 3 file, cek ukuran dan tipe file).
2. `useAjukanKeluhan` (useMutation) membangun `FormData` dan memanggil `client.POST("/hmr/keluhan")`. Client menambahkan header `Authorization: Bearer <jwt>`.
3. FastAPI mencocokkan router HMR. Dependency `get_current_user` men-decode JWT. Jika gagal, response 401. Jika role bukan penghuni, response 403.
4. FastAPI memvalidasi form multipart. Jika tidak valid, response 422.
5. `hmr.service.ajukan_keluhan()` mengorkestrasi langkah-langkah di §3 dan mengisi `trace`.
6. Response 201 diterima frontend. `onSuccess` memanggil `invalidateQueries(["tiket"])` dan `["notifikasi"]`. Panel hasil menampilkan stepper trace. Outbox WhatsApp bertambah.

---

## 7. Backend

Keputusan (24 Nov 2026):
- **Cakupan:** ketiga proses (Complaint Handling, Repair Verification, Billing & Commission), semua 26 endpoint di `contracts/openapi.yaml`, ditambah `POST /dev/reset`. Billing dikerjakan paling akhir, tetapi tetap masuk backend. Mode campuran (sebagian mock, sebagian live) tidak dipakai karena data di localStorage dan di database akan terpecah.
- **AI Classification:** tetap mock keyword (aturan sama dengan `frontend/src/lib/klasifikasi.ts`). Adapter tetap disiapkan agar bisa diganti.
- **Hosting:** lokal dulu. Keputusan deploy ditunda ke fase B4.
- **Pencarian teknisi dan estimasi dipicu otomatis** setelah tiket diklasifikasi, sesuai BPMN Repair Verification. Pemilik tinggal menyetujui atau menolak. Mock frontend dan UI pemilik diubah lebih dulu, karena mock adalah cetak biru backend.
- **Prinsip:** sesederhana mungkin untuk dijalankan. Prasyarat hanya Node dan `uv`, tanpa Docker.

### 7.1 Stack

| Komponen | Pilihan | Catatan |
|---|---|---|
| Bahasa + environment | Python 3.13 lewat `uv` (`uv python pin 3.13`) | `uv` meng-install Python dan dependensi sekaligus |
| Framework | FastAPI | Swagger `/docs` otomatis |
| Skema request/response | Pydantic v2, ditulis tangan per service (`schemas.py`) | Nama dan bentuk mengikuti `openapi.yaml` |
| Database | SQLite (`backend/kosmos.db`) lewat SQLAlchemy 2.0 (`Mapped[]`) | Data tetap tersimpan walaupun backend dimatikan. Untuk deploy cukup ganti `DATABASE_URL` ke Postgres |
| Pembuatan tabel | `Base.metadata.create_all()` + `seed.py` | Tanpa Alembic. Jika struktur tabel berubah: hapus `kosmos.db`, lalu jalankan lagi |
| Auth | PyJWT (demo login yang menerbitkan JWT asli) | |
| Upload | python-multipart + `StaticFiles` | |
| Test | pytest | |

Yang sengaja **tidak** dipakai: Docker, Alembic, generator kode Pydantic, dan repository layer. Semuanya menambah alat atau lapisan tanpa menambah nilai untuk prototype ini.

### 7.2 Mock frontend sebagai cetak biru

Mock di `frontend/src/mocks` sudah berisi seluruh aturan bisnis. Backend memindahkannya 1:1:

| Mock (TypeScript) | Backend (Python) |
|---|---|
| `db.ts` (tipe tabel + seed) | `models.py` per service + `seed.py` |
| `services.ts` (per layer) | `service.py` per service |
| `micro.ts` | `services/micro/*.py`, fungsi murni tanpa database |
| `handlers.ts` | `router.py` per service |
| Tipe dari `openapi.yaml` | `schemas.py` per service (ditulis tangan) |
| `ServiceError(status, kode, pesan)` | `core/errors.py`, bentuk response identik |

### 7.3 Struktur folder

```
backend/
├─ pyproject.toml · .env.example
├─ kosmos.db                 ← dibuat otomatis (gitignored)
├─ uploads/                  ← file lampiran (gitignored)
└─ app/
   ├─ main.py                ← router, CORS, error handler, StaticFiles
   ├─ core/                  config, db, security (JWT demo), errors, trace, waktu
   ├─ services/
   │  ├─ task/               hmr/, csm/
   │  ├─ micro/              technician_matching, cost_estimation, evidence_verification, commission_calculation
   │  ├─ entity/             tenant_lease, complaint_ticket, technician, work_order, invoice, payment, financial_ledger
   │  └─ utility/            media_storage, ai_classification, notification
   ├─ views/                 read model: merakit response dari beberapa service + otorisasi data
   ├─ dev/                   router /dev/reset
   ├─ seed.py
   └─ tests/
```

Isi tiap service: `router.py`, `service.py`, `models.py` (tabel milik service itu). Adapter (`adapters/`) hanya untuk AI, WhatsApp, dan payment.

`app/views/` setara fungsi `view*()` di mock: menggabungkan data beberapa Entity untuk response (misalnya tiket + nama unit + nama penghuni) dan memeriksa siapa boleh melihat data apa. Isinya bukan logika bisnis. Dengan begitu Entity tidak perlu saling meng-import.

Aturan:
- Alur pemanggilan `router → service`. Service Entity langsung memakai `Session` SQLAlchemy dan menjadi satu-satunya pemilik tabelnya.
- Hanya Task yang boleh memanggil service lain. Entity tidak memanggil Entity lain. Micro tidak membaca database. Utility tidak tahu domain bisnis.
- Setiap router diberi tag Swagger per layer, misalnya `Task: HMR`, `Entity: Complaint Ticket`, `Utility: Notification`. Halaman `/docs` dipakai untuk slide API Documentation.
- Adapter dipilih lewat env: `AI_PROVIDER=mock`, `WA_PROVIDER=mock`, `PAYMENT_PROVIDER=mock`.

### 7.4 Detail teknis yang wajib

| Topik | Aturan | Alasan |
|---|---|---|
| Transaksi | Commit pertama: keluhan + tiket. Lalu klasifikasi, pencarian teknisi, dan estimasi di commit kedua. Notifikasi dikirim setelah commit. Tanpa `BackgroundTasks` | Tiket tetap ada walaupun AI gagal (sesuai §3.1), dan `trace` tetap kembali di response |
| Waktu | Satu `TypeDecorator` `UTCDateTime`: disimpan sebagai UTC, dikirim sebagai ISO dengan akhiran `Z` | Tanpa `Z`, browser membaca jam sebagai waktu lokal dan bergeser 7 jam |
| Tanggal | Satu fungsi `today()` berzona `Asia/Jakarta` untuk status sewa. Seed memakai tanggal relatif terhadap waktu reset | Sama dengan mock, dan status sewa tidak berubah tergantung jam |
| Uang | Integer rupiah. Pembulatan memakai helper `round_half_up` | `round()` Python berbeda dari `Math.round` JavaScript, bisa selisih Rp1 |
| SQLite | `PRAGMA foreign_keys=ON`, `check_same_thread=False`, uvicorn satu worker | Foreign key ditegakkan, aman untuk akses bersamaan skala demo |
| File upload | Disimpan di `backend/uploads/`, disajikan di `/media-files`. URL dibentuk dari `PUBLIC_BASE_URL` | Browser bisa membuka foto lampiran dan bukti |
| CORS | `allow_origins` dari env (default `http://localhost:3000`), header `Authorization` diizinkan | Dikerjakan di B0 |
| Trace | `core/trace.py` dengan `trace.step(service, layer, operasi)`. Field `layer` harus benar. Tanpa latensi buatan. Setiap langkah juga dicetak satu baris di log terminal | Panel trace sudah tidak ada di UI. Trace terlihat di Swagger dan log saat demo |
| Reset | `POST /dev/reset` (aktif hanya saat `DEMO_MODE=true`) menjalankan `drop_all`, `create_all`, `seed`, dan mengosongkan `uploads/`. Endpoint ditambahkan ke `openapi.yaml`. `resetDemo()` di frontend memanggilnya di mode live | Tombol "Reset data demo" dan `npm run demo:reset` tetap berfungsi |

### 7.5 Cara menjalankan

Prasyarat: Node dan `uv`.

```bash
npm run dev:all     # di root: backend (port 8000) + frontend mode live (port 3000)
```

- Script memakai `concurrently --kill-others` dan `cross-env NEXT_PUBLIC_API_MODE=live`, sehingga jalan juga di Windows.
- Perintah backend: `uv run --directory backend uvicorn app.main:app --port 8000`. Saat start, tabel dan seed dibuat otomatis jika `kosmos.db` belum ada.
- Mode ditentukan saat `next dev` dimulai. Ganti mode berarti restart.
- Cadangan saat demo: `npm run dev` di `frontend/` (mode mock) tetap berfungsi tanpa backend.
- Akses dari HP di WiFi yang sama: jalankan backend dengan `--host 0.0.0.0`, lalu isi `PUBLIC_BASE_URL` dan `CORS_ORIGINS` dengan IP laptop.

### 7.6 Jadwal backend

| Fase | Tanggal | Hasil |
|---|---|---|
| B0 | 24–25 Nov | Ubah mock + UI pemilik agar estimasi dibuat otomatis. Scaffold backend, config, db, model Tenant and Lease + Complaint Ticket, seed, auth demo, CORS, error handler, `/dev/reset`, tes rute vs `openapi.yaml` |
| B1 | 26–29 Nov | Complaint Handling penuh + pemicu otomatis pencarian teknisi dan estimasi, media + `/media-files`, notifikasi. Entity Work Order (model, seed, endpoint baca) ikut dikerjakan karena dashboard pemilik memanggil `GET /work-order`. Frontend mode live jalan untuk alur ini (`npm run test:e2e:live`) |
| Gate | 29 Nov | Jika alur Complaint Handling belum jalan di mode live, cakupan B2 dipangkas sebelum memakai buffer |
| B2 | 30 Nov – 3 Des | Repair Verification: persetujuan estimasi, jadwal, log servis, bukti, konfirmasi selesai |
| B3 | 4–6 Des | Billing & Commission (invoice, payment, kas). 12 tes E2E lulus di mode live |
| B4 | 7–9 Des | `npm run dev:all`, README (langkah `.env.local` dikembalikan), keputusan deploy |
| Buffer | 10–14 Des | Perbaikan dan gladi demo |

Model tabel ditambahkan per fase. Dengan `create_all`, cukup hapus `kosmos.db` lalu jalankan ulang.

### 7.7 Bukti kesesuaian

| Yang dibuktikan | Cara |
|---|---|
| Rute sesuai kontrak | pytest mencocokkan path + method di `app.openapi()` dengan `contracts/openapi.yaml` |
| Layering SOA | pytest memeriksa import: Entity dan Utility tidak meng-import `services.task`, Entity tidak meng-import Entity lain, Micro tidak meng-import `core.db` |
| Aturan bisnis | pytest untuk state machine tiket dan work order (termasuk 409), validasi sewa, komisi |
| Bentuk response | `response_model` FastAPI + 12 tes E2E Playwright di mode live (`npm run test:e2e:live`, backend port 8001 dengan database sementara). Validasi skema terhadap yaml untuk 3–4 endpoint kunci jika sempat |

---

## 8. Testing

| Level | Yang diuji |
|---|---|
| Frontend unit | Skema Zod form, `StatusBadge` dan label, `format.ts`, mock classifier |
| Frontend E2E (Playwright, mode mock) | (1) Budi mengajukan keluhan → tiket diklasifikasi → muncul di outbox. (2) Sari → ditolak |
| Backend unit | State machine tiket (transisi legal/ilegal), perhitungan status sewa |
| Backend integrasi | `POST /hmr/keluhan` dengan adapter mock: kasus diterima, ditolak, dan AI gagal |
| Kontrak | Rute FastAPI dicocokkan dengan `contracts/openapi.yaml`, ditambah 12 E2E di mode live (lihat §7.7) |

---

## 9. Deployment

| Komponen | Platform | Catatan |
|---|---|---|
| Frontend | Vercel | Set `NEXT_PUBLIC_API_MODE=live` dan base URL |
| Backend | Render atau Railway | Free tier bisa "tidur". Buka URL backend 1-2 menit sebelum presentasi |
| DB | Postgres gratis (Neon atau Supabase) lewat `DATABASE_URL` | Project free bisa di-pause jika lama tidak aktif. Cek H-1 presentasi |
| File upload | Disk server | Filesystem Render free tidak permanen, file hilang saat redeploy. Diterima untuk demo |
| CORS | FastAPI `allow_origins` | Hanya domain Vercel + localhost |

Rencana cadangan demo: deploy frontend kedua dengan `API_MODE=mock`. Demo tetap jalan walaupun backend mati.

QR code untuk slide 44 mengarah ke URL Vercel.

---

## 10. Jadwal

| Fase | Tanggal | Output | Definition of done |
|---|---|---|---|
| 0. Fondasi | 13–15 Nov | Keputusan §2 disetujui kelompok; `openapi.yaml`; scaffold Next.js + shadcn + MSW | `npm run dev` jalan, 1 endpoint mock bisa dipanggil dengan tipe ter-generate |
| 1. Frontend inti | 16–22 Nov | Login demo, form keluhan, hasil + trace, dashboard penghuni | Happy path dan kasus ditolak jalan di mode mock |
| 2. Frontend lengkap | 23–29 Nov | Dashboard + detail pemilik, ubah status, outbox WA, timeline, empty/error state, responsif | Semua skenario demo jalan di mode mock; E2E hijau. **Milestone frontend selesai** |
| 3. Backend | 24 Nov–9 Des | Lihat jadwal B0–B4 di §7.6 | Swagger `/docs` lengkap, pytest hijau, 12 E2E lulus di mode live |
| 4. Buffer | 10–14 Des | Bug fix, naskah demo, screenshot Swagger untuk slide 41-43, QR | Gladi demo 2x tanpa error |

## 11. Skenario demo

1. **Budi** (sewa aktif) mengirim "AC kamar tidak dingin dan menetes air" + foto. Hasil: tiket `diklasifikasi`, kategori AC, urgensi sedang. Stepper menampilkan 7 langkah service. Outbox WA berisi pesan ke Budi dan Pak Hendra.
2. **Sari** (sewa berakhir) mengirim keluhan. Hasil: ditolak dengan alasan sewa tidak aktif, dan tidak ada tiket yang dibuat.
3. **Pak Hendra** membuka dashboard, memfilter urgensi tinggi, lalu menekan "Tandai diproses". Status berubah dan notifikasi terkirim ke kedua pihak.
4. (Opsional) Simulasi AI gagal: tiket tetap dibuat, lalu klasifikasi ulang berhasil.

## 11b. Repair Verification dan Billing & Commission (frontend mock, 24 Nov 2026)

Dua proses lanjutan sudah diprototype di frontend mode mock dengan pola yang sama (kontrak OpenAPI → MSW → service per layer).

| Layer | Service | Operasi (D1) | Endpoint |
|---|---|---|---|
| Task | Handle Maintenance Request | Get Estimasi Biaya, Set Persetujuan Biaya, Set Jadwal Kunjungan | `GET/POST /hmr/tiket/{id}/estimasi`, `POST /hmr/estimasi/{id}/persetujuan`, `POST /hmr/work-order/{id}/jadwal` |
| Task | Complete and Settle Maintenance | Add Log Servis, unggah bukti, Set Konfirmasi Selesai, bayar | `POST /csm/work-order/{id}/log`, `/bukti`, `/konfirmasi`, `POST /csm/invoice/{id}/bayar` |
| Micro | Technician Matching, Cost Estimation, Evidence Verification, Commission Calculation | Match Teknisi, Estimate Biaya, Verify Bukti, Calculate Komisi | Tanpa endpoint (dipanggil in-process oleh Task), `frontend/src/mocks/micro.ts` |
| Entity | Technician, Work Order, Invoice, Payment, Financial Ledger | Get Teknisi Tersedia, Add Work Order, Add Invoice, Process Payment, Add Transaksi Kas, dst. | `GET /work-order`, `GET /invoice`, `GET /laporan-kas` |

Keputusan desain yang perlu disepakati kelompok:
1. **Tiket diproses lewat persetujuan estimasi.** Tombol "Tandai diproses" dihapus. `POST /hmr/tiket/{id}/status` kini hanya menerima `dibatalkan`, dan pembatalan ikut membatalkan work order yang berjalan.
2. **Catatan estimasi dimiliki Task HMR**, karena Get Estimasi Biaya dan Set Persetujuan Biaya non-agnostic menurut D1. Microservice Cost Estimation tetap stateless.
3. **Penghuni membayar biaya perbaikan** (sesuai BPMN Billing). Komisi Kosmos 10% dipotong dari bagian teknisi, bukan biaya tambahan. Laporan kas pemilik mencatat tiga baris per pembayaran: pemasukan, diteruskan ke teknisi, komisi. Ini sekaligus jawaban sementara untuk pertanyaan terbuka #3.
4. **Role teknisi** ditambahkan (`Role = penghuni | pemilik | teknisi`) karena teknisi adalah participant di SoaML Repair Verification.
5. **Work order** punya state machine sendiri: `menunggu_jadwal → dijadwalkan → dikerjakan → menunggu_konfirmasi → selesai`, dengan `menunggu_konfirmasi → dikerjakan` bila penghuni menandai belum beres.
6. Evidence Verification versi mock memeriksa metadata (dua foto, format gambar, tidak identik, ukuran ≥ 1 KB). Versi akhir bisa memakai LLM vision seperti AI Classification.
7. Payment gateway memakai adapter mock. Kegagalan bisa disimulasikan dari UI (checkbox demo) untuk menunjukkan cabang "Pembayaran berhasil? Tidak" di BPMN.

## 12. Pertanyaan terbuka untuk kelompok

1. Setujui penyimpangan desain di §2, lalu perbaiki slide D2 yang terkait:
   - Slide 5, 7, 12, 20: consumer Notifikasi diganti dari Complaint Ticket menjadi HMR (#3), dan `getIdPenerima` dipindah ke Notification (#4).
   - Slide 6: urutan validasi sewa dipindah sebelum `addKeluhan`, dan `addKeluhan` dijadikan operasi HMR (#1, #2).
   - Slide 11: tambah status `dibatalkan` dan kategori `lainnya` (#7, #8).
   - Slide 13: kolom Consumer untuk Notifikasi Status Tiket diganti menjadi HMR.
   - Slide 40: kolom Task untuk Notifikasi Status Tiket diisi HMR.
   - Slide 41-43: endpoint disesuaikan dengan §5 (#5, #6).
   - Di luar Complaint Handling, slide 19 dan 32 punya masalah layering yang sama (Utility memanggil Micro, `reconcilePembayaran` di Invoice). Prototype tidak terdampak, tetapi tetap perlu dibetulkan.
2. Batas lampiran (§5) dan daftar urgensi (`rendah | sedang | tinggi`).
3. Siapa yang membayar perbaikan (Pemilik menyetujui, tetapi Penghuni yang membayar)? Ini tidak memengaruhi prototype, tetapi akan ditanyakan dosen.
4. Nomor kelompok di cover (4 atau 11) dan sisa template di closing D1.
