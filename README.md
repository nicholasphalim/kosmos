# Kosmos

**A Smart Platform to Streamline Boarding House Management and Repair Services**

Kosmos adalah platform manajemen kos berbasis web yang membantu pemilik kos mengelola keluhan kerusakan, perbaikan oleh teknisi, tagihan, dan laporan keuangan dalam satu dashboard.

## Latar Belakang

Banyak pemilik kos, terutama yang memiliki 20 sampai 50 kamar, masih mengelola usahanya secara manual. Tagihan dicatat di buku atau spreadsheet, keluhan penghuni masuk lewat chat WhatsApp pribadi dan sering tenggelam, dan teknisi dicari lewat kenalan. Akibatnya pembayaran tidak tercatat rapi, keluhan lama ditangani, dan pemilik kos tidak memiliki gambaran yang jelas tentang pemasukan dan pengeluarannya.

Kosmos dirancang untuk menjawab masalah tersebut dengan mengotomatisasi alur dari keluhan masuk sampai pembayaran tercatat.

## Proses Bisnis Utama

| Proses | Ringkasan |
|---|---|
| **Complaint Handling** | Penghuni mengajukan keluhan beserta foto/video. Sistem memvalidasi sewa aktif, membuat tiket, mengklasifikasi kategori dan urgensi dengan AI, lalu mengabari penghuni dan pemilik lewat WhatsApp. |
| **Repair Verification** | Sistem mencari teknisi terverifikasi, tersedia, dan terdekat, menghitung estimasi biaya untuk disetujui pemilik, mencatat progres servis, dan memverifikasi foto bukti perbaikan. |
| **Billing & Commission** | Sistem menghitung komisi, membuat invoice, memproses pembayaran lewat payment gateway, merekonsiliasi transaksi, dan mencatatnya ke laporan kas pemilik. |

## Arsitektur Layanan

Layanan dirancang dengan pendekatan *Service-Oriented Architecture* (SOA) dan dikelompokkan ke empat lapisan:

| Lapisan | Layanan |
|---|---|
| Task | Handle Maintenance Request, Complete and Settle Maintenance |
| Micro | Technician Matching, Cost Estimation, Evidence Verification, Commission Calculation |
| Entity | Tenant and Lease, Complaint Ticket, Technician, Work Order, Invoice, Payment, Financial Ledger |
| Utility | Notification, Media Storage, AI Classification |

## Prototype

Prototype mengimplementasikan Complaint Handling, Repair Verification, Billing & Commission, dan tagihan sewa bulanan.

| Bagian | Teknologi |
|---|---|
| Frontend | Next.js, TypeScript, Tailwind CSS (Vercel) |
| Backend | FastAPI, SQLAlchemy, Alembic (Railway) |
| Database, storage, login Google | PostgreSQL, Storage, dan Auth di Supabase |
| Kontrak API | OpenAPI ([`contracts/openapi.yaml`](contracts/openapi.yaml)) |

Frontend bisa dicoba tanpa backend (mode mock, data disimpan di browser):

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Buka http://localhost:3000 lalu pilih akun demo. Detail lebih lanjut ada di [`frontend/README.md`](frontend/README.md).

Menjalankan backend (butuh Python 3.13 via [uv](https://docs.astral.sh/uv/) dan project Supabase):

```bash
cd backend
cp .env.example .env              # isi DATABASE_URL, SUPABASE_URL, DEMO_JWT_SECRET, dst.
uv sync
uv run python -m app.predeploy    # migrasi database + data demo
uv run uvicorn app.main:app --reload --port 8000   # Swagger: http://localhost:8000/docs
uv run pytest
```

Lalu set `NEXT_PUBLIC_API_MODE=live` di `frontend/.env.local`. Rencana lengkap ada di [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).

## Struktur Repository

```
kosmos/
├─ backend/     Service SOA (FastAPI)
├─ contracts/   Kontrak API (OpenAPI)
├─ docs/        Rencana implementasi
└─ frontend/    Aplikasi web (Next.js)
```

## Tim

II3120 Layanan Sistem dan Teknologi Informasi

| Nama | NIM |
|---|---|
| Indanna Halwah Raqiqah M. | 18224014 |
| Christian Wilfredo P. | 18224038 |
| Derren Christopher Boenardi | 18224040 |
| Rafeyfa Dea Putri Ramadhani | 18224044 |
| Nicholas Putra Halim | 18224098 |
