"""Data demo awal, meniru frontend/src/mocks/db.ts. Tanggal dihitung relatif terhadap waktu seed.

Jalankan manual: `uv run python -m app.seed` (menghapus semua data lalu mengisi ulang).
Tabel Repair Verification dan Billing ditambahkan di fase B2/B3.
"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.db import SessionLocal, buat_tabel, hapus_tabel
from app.core.waktu import menit_lalu, now_utc, tanggal_geser
from app.services.entity.complaint_ticket.models import Keluhan, Tiket, TiketRiwayat
from app.services.entity.technician.models import Teknisi
from app.services.entity.tenant_lease.models import Pengguna, Properti, Sewa, Unit

PENGGUNA = [
    (1, "Dea", "penghuni", "0812-xxxx-0101"),
    (2, "Qiqa", "penghuni", "0813-xxxx-0102"),
    (3, "Fredo", "penghuni", "0815-xxxx-0201"),
    (4, "Pak Derren", "pemilik", "0812-xxxx-1101"),
    (5, "Halim", "penghuni", "0817-xxxx-0202"),
    (6, "Nicholas", "penghuni", "0819-xxxx-0103"),
    (7, "Putra", "penghuni", "0821-xxxx-0104"),
    (8, "Pak Slamet", "teknisi", "0838-xxxx-2201"),
    (9, "Mas Bayu", "teknisi", "0857-xxxx-2202"),
    (10, "Bang Ucok", "teknisi", "0878-xxxx-2203"),
    (11, "Mas Andi", "teknisi", "0896-xxxx-2204"),
    (12, "Pak Joko", "teknisi", "0811-xxxx-2205"),
]

PROPERTI = [(1, "Kos Melati", 4, -6.879, 107.6105), (2, "Kos Kenanga", 4, -6.8865, 107.615)]

UNIT = [(7, 1, "A-101"), (8, 1, "A-102"), (9, 1, "A-103"), (10, 1, "A-104"), (11, 2, "B-201"), (12, 2, "B-202")]

# (id, id_unit, id_penghuni, mulai: hari dari sekarang, selesai: hari dari sekarang)
SEWA = [(1, 7, 1, -135, 230), (2, 8, 2, -378, -13), (3, 11, 3, -60, 300), (4, 12, 5, -90, 270), (5, 9, 6, -200, 160), (6, 10, 7, -30, 330)]

TEKNISI = [
    (8, ["listrik"], True, "SKK-LST-0412", True, 4.8, -6.892, 107.613),
    (9, ["AC"], True, "SKK-AC-1187", True, 4.7, -6.8975, 107.619),
    (10, ["air", "lainnya"], True, "SKK-PLB-0750", True, 4.6, -6.885, 107.608),
    (11, ["listrik", "AC"], False, None, True, 4.9, -6.8812, 107.6135),
    (12, ["listrik", "air", "lainnya"], True, "SKK-UMM-0033", False, 4.5, -6.87, 107.6),
]


@dataclass
class TiketAwal:
    id_tiket: int
    id_keluhan: int
    penghuni: int
    unit: int
    menit: int
    deskripsi: str
    judul: str
    status: str
    kategori: str | None
    urgensi: str | None
    alasan: str | None
    confidence: float | None


HARI = 24 * 60

TIKET_AWAL = [
    TiketAwal(48, 92, 1, 7, 12 * HARI, "AC kamar kurang dingin, cuma keluar angin walau sudah disetel 16 derajat.",
              "AC kamar kurang dingin", "selesai", "AC", "sedang", "AC tidak dingin mengganggu kenyamanan, tidak berbahaya.", 0.9),
    TiketAwal(49, 93, 3, 11, 6 * HARI, "Wastafel kamar mandi mampet, airnya menggenang lama baru turun.",
              "Wastafel kamar mandi mampet", "selesai", "air", "sedang", "Saluran mampet mengganggu penggunaan kamar mandi.", 0.86),
    TiketAwal(52, 96, 1, 7, 3 * HARI, "Lampu depan kamar berkedip terus kalau malam, kadang mati sendiri.",
              "Lampu depan kamar berkedip", "selesai", "listrik", "rendah", "Lampu berkedip belum membahayakan, perlu dicek saat sempat.", 0.85),
    TiketAwal(51, 95, 3, 11, 26 * 60, "Lampu kamar mandi mati total, sudah ganti bohlam tetap tidak menyala. Saklarnya longgar.",
              "Lampu kamar mandi mati total", "diproses", "listrik", "sedang", "Lampu mati total kemungkinan masalah instalasi, bukan bohlam.", 0.88),
    TiketAwal(54, 98, 6, 9, 15 * 60, "Engsel pintu lemari lepas, pintunya miring dan susah ditutup.",
              "Engsel pintu lemari lepas", "diklasifikasi", "lainnya", "rendah", "Kerusakan furnitur ringan, tidak mendesak.", 0.81),
    TiketAwal(56, 100, 5, 12, 110, "Keran kamar mandi tidak bisa ditutup rapat, air terus mengalir pelan.",
              "Keran kamar mandi tidak menutup", "dibuat", None, None, None, None),
    TiketAwal(57, 101, 3, 11, 18, "Stop kontak dekat meja memercikkan api waktu charger dicolok, ada bau gosong.",
              "Stop kontak memercikkan api", "diklasifikasi", "listrik", "tinggi", "Percikan api dan bau gosong adalah tanda korsleting yang berisiko kebakaran.", 0.94),
]


def isi_data(db: Session, now: datetime | None = None) -> None:
    now = now or now_utc()
    db.add_all(Pengguna(id=i, nama=n, role=r, no_wa=w) for i, n, r, w in PENGGUNA)
    db.flush()
    db.add_all(Properti(id=i, nama=n, id_pemilik=p, lat=la, lng=lo) for i, n, p, la, lo in PROPERTI)
    db.flush()
    db.add_all(Unit(id=i, id_properti=p, nomor_unit=n) for i, p, n in UNIT)
    db.flush()
    db.add_all(
        Sewa(id=i, id_unit=u, id_penghuni=p, tanggal_mulai=tanggal_geser(m), tanggal_selesai=tanggal_geser(s))
        for i, u, p, m, s in SEWA
    )
    db.add_all(
        Teknisi(id_pengguna=i, keahlian=k, terverifikasi=v, no_sertifikat=c, tersedia=t, rating=r, lat=la, lng=lo)
        for i, k, v, c, t, r, la, lo in TEKNISI
    )

    for a in TIKET_AWAL:
        dibuat = menit_lalu(a.menit, now)
        db.add(Keluhan(id=a.id_keluhan, id_penghuni=a.penghuni, id_unit=a.unit, deskripsi=a.deskripsi,
                       status="diterima", alasan_penolakan=None, created_at=dibuat))
        db.flush()
        db.add(Tiket(id=a.id_tiket, id_keluhan=a.id_keluhan, judul=a.judul, status=a.status, kategori=a.kategori,
                     urgensi=a.urgensi, perlu_review=a.urgensi is None, ai_confidence=a.confidence, ai_alasan=a.alasan,
                     created_at=dibuat, updated_at=dibuat))
        db.flush()
        db.add(TiketRiwayat(id_tiket=a.id_tiket, dari=None, ke="dibuat", waktu=dibuat, oleh="sistem"))
        if a.status != "dibuat":
            db.add(TiketRiwayat(id_tiket=a.id_tiket, dari="dibuat", ke="diklasifikasi", waktu=dibuat, oleh="AI Classification"))
        # Riwayat diproses/selesai beserta estimasi, work order, invoice, dan kas menyusul di B2/B3.
    db.commit()


def reset_semua() -> None:
    """Hapus semua tabel, buat ulang, lalu isi data demo."""
    hapus_tabel()
    buat_tabel()
    with SessionLocal() as db:
        isi_data(db)


def seed_jika_kosong() -> bool:
    buat_tabel()
    with SessionLocal() as db:
        if db.get(Pengguna, 1) is not None:
            return False
        isi_data(db)
        return True


if __name__ == "__main__":
    reset_semua()
    print("Data demo diisi ulang.")
