"""Data demo (plan §4.1), sama dengan seed mode mock di frontend/src/mocks/db.ts.

Nama diambil dari anggota kelompok dan cukup diganti di tabel PENGGUNA. Email memakai domain
kosmos.test yang tidak bisa menerima email, jadi persona seed hanya bisa masuk lewat demo login.

    uv run python -m app.seed          isi data bila database masih kosong
    POST /api/v1/dev/reset             kosongkan semua tabel lalu isi ulang (hanya DEMO_MODE)

Tabel proses lain (tiket, work order, invoice, ...) ditambahkan ke seed di fase P4-P6.
"""

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.models import metadata
from app.core.waktu import tanggal_geser
from app.services.entity.technician.models import Teknisi
from app.services.entity.tenant_lease.models import Pengguna, Properti, Sewa, Unit

PENGGUNA = [
    (1, "Dea", "penghuni", "0812-xxxx-0101", "dea@kosmos.test"),
    (2, "Qiqa", "penghuni", "0813-xxxx-0102", "qiqa@kosmos.test"),
    (3, "Fredo", "penghuni", "0815-xxxx-0201", "fredo@kosmos.test"),
    (4, "Pak Derren", "pemilik", "0812-xxxx-1101", "derren@kosmos.test"),
    (5, "Halim", "penghuni", "0817-xxxx-0202", "halim@kosmos.test"),
    (6, "Nicholas", "penghuni", "0819-xxxx-0103", "nicholas@kosmos.test"),
    (7, "Putra", "penghuni", "0821-xxxx-0104", "putra@kosmos.test"),
    (8, "Pak Slamet", "teknisi", "0838-xxxx-2201", "slamet@kosmos.test"),
    (9, "Mas Bayu", "teknisi", "0857-xxxx-2202", "bayu@kosmos.test"),
    (10, "Bang Ucok", "teknisi", "0878-xxxx-2203", "ucok@kosmos.test"),
    (11, "Mas Andi", "teknisi", "0896-xxxx-2204", "andi@kosmos.test"),
    (12, "Pak Joko", "teknisi", "0811-xxxx-2205", "joko@kosmos.test"),
]

PROPERTI = [
    (1, "Kos Melati", 4, -6.879, 107.6105),
    (2, "Kos Kenanga", 4, -6.8865, 107.615),
]

UNIT = [
    (7, 1, "A-101", 1_200_000),
    (8, 1, "A-102", 1_200_000),
    (9, 1, "A-103", 1_250_000),
    (10, 1, "A-104", 1_250_000),
    (11, 2, "B-201", 1_500_000),
    (12, 2, "B-202", 1_500_000),
]

# (id, id_unit, id_penghuni, mulai, selesai) dalam hari relatif terhadap hari ini (WIB).
SEWA = [
    (1, 7, 1, -135, 230),
    (2, 8, 2, -378, -13),  # Qiqa: sewa sudah berakhir
    (3, 11, 3, -60, 300),
    (4, 12, 5, -90, 270),
    (5, 9, 6, -200, 160),
    (6, 10, 7, -30, 330),
]

TEKNISI = [
    (8, ["listrik"], True, "SKK-LST-0412", True, 4.8, -6.892, 107.613),
    (9, ["AC"], True, "SKK-AC-1187", True, 4.7, -6.8975, 107.619),
    (10, ["air", "lainnya"], True, "SKK-PLB-0750", True, 4.6, -6.885, 107.608),
    (11, ["listrik", "AC"], False, None, True, 4.9, -6.8812, 107.6135),  # belum terverifikasi
    (12, ["listrik", "air", "lainnya"], True, "SKK-UMM-0033", False, 4.5, -6.87, 107.6),  # tidak tersedia
]


def isi_data(db: Session) -> None:
    db.add_all(Pengguna(id=i, nama=n, role=r, no_wa=w, email=e) for i, n, r, w, e in PENGGUNA)
    db.flush()
    db.add_all(Properti(id=i, nama=n, id_pemilik=p, lat=la, lng=lo) for i, n, p, la, lo in PROPERTI)
    db.flush()
    db.add_all(Unit(id=i, id_properti=p, nomor_unit=n, harga_bulanan=h) for i, p, n, h in UNIT)
    db.flush()
    db.add_all(
        Sewa(id=i, id_unit=u, id_penghuni=p, tanggal_mulai=tanggal_geser(m), tanggal_selesai=tanggal_geser(s))
        for i, u, p, m, s in SEWA
    )
    db.add_all(
        Teknisi(
            id_pengguna=i,
            keahlian=k,
            terverifikasi=v,
            no_sertifikat=c,
            tersedia=t,
            rating=r,
            lat=la,
            lng=lo,
        )
        for i, k, v, c, t, r, la, lo in TEKNISI
    )
    db.flush()
    _setel_sequence(db)


def _setel_sequence(db: Session) -> None:
    """Seed memakai ID eksplisit, jadi sequence ID dimajukan supaya insert berikutnya tidak bentrok."""
    for tabel in metadata.sorted_tables:
        kolom = tabel.c.get("id")
        if kolom is None or not kolom.autoincrement:
            continue
        db.execute(
            text(
                f"SELECT setval(pg_get_serial_sequence('{tabel.name}', 'id'), "
                f'COALESCE((SELECT MAX(id) FROM "{tabel.name}"), 1), '
                f'(SELECT MAX(id) IS NOT NULL FROM "{tabel.name}"))'
            )
        )


def reset_semua(db: Session) -> None:
    """Kosongkan semua tabel milik aplikasi lalu isi ulang data demo."""
    nama = ", ".join(f'"{t.name}"' for t in metadata.sorted_tables)
    db.execute(text(f"TRUNCATE {nama} RESTART IDENTITY CASCADE"))
    isi_data(db)
    db.commit()


def seed_jika_kosong(db: Session) -> bool:
    """Isi data demo bila tabel pengguna masih kosong. Mengembalikan True bila seed dijalankan."""
    if db.scalar(select(func.count()).select_from(Pengguna)):
        return False
    isi_data(db)
    db.commit()
    return True


if __name__ == "__main__":
    from app.core.db import get_db

    sesi = next(get_db())
    try:
        print("Data demo diisi." if seed_jika_kosong(sesi) else "Database sudah berisi data, seed dilewati.")
    finally:
        sesi.close()
