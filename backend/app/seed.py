"""Data demo (plan §4.1), sama dengan seed mode mock di frontend/src/mocks/db.ts.

Nama diambil dari anggota kelompok dan cukup diganti di tabel PENGGUNA. Email memakai domain
kosmos.test yang tidak bisa menerima email, jadi persona seed hanya bisa masuk lewat demo login.

    uv run python -m app.seed          isi data bila database masih kosong
    POST /api/v1/dev/reset             kosongkan semua tabel lalu isi ulang (hanya DEMO_MODE)

Pembayaran, laporan kas, dan tagihan sewa (Billing dan Rent Billing) ditambahkan di fase P6.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.models import metadata
from app.core.waktu import WIB, menit_lalu, now_utc, tanggal_geser
from app.services.entity.complaint_ticket.models import Keluhan, Tiket, TiketRiwayat
from app.services.entity.invoice.models import Invoice
from app.services.entity.technician.models import Teknisi
from app.services.entity.tenant_lease.models import Pengguna, Properti, Sewa, Unit
from app.services.entity.work_order.models import LogServis, WorkOrder
from app.services.micro.commission_calculation import hitung_komisi
from app.services.micro.cost_estimation import estimasi_biaya
from app.services.micro.evidence_verification import Foto, verifikasi_bukti
from app.services.micro.technician_matching import Titik, jarak_km
from app.services.task.hmr.models import Estimasi
from app.services.utility.media_storage.models import Lampiran
from app.services.utility.notification.models import Notifikasi

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


@dataclass(frozen=True)
class Bayar:
    """Pembayaran invoice oleh pemilik. Baris Payment dan laporan kas diisi di fase P6."""

    menit: int
    metode: str
    gagal_dulu: str | None = None  # metode yang gagal sebelum pembayaran berhasil


@dataclass(frozen=True)
class Perbaikan:
    """Jejak perbaikan tiket yang sudah diproses/selesai. Menit dihitung mundur dari waktu seed."""

    teknisi: int
    disetujui: int
    wo: str
    jadwal: int
    tiba: int | None = None
    mulai: int | None = None
    selesai: int | None = None
    bayar: Bayar | None = None


@dataclass(frozen=True)
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
    perbaikan: Perbaikan | None = None


H = 24 * 60  # menit per hari

TIKET_AWAL = [
    TiketAwal(
        48,
        92,
        1,
        7,
        12 * H,
        "AC kamar kurang dingin, cuma keluar angin walau sudah disetel 16 derajat.",
        "AC kamar kurang dingin",
        "selesai",
        "AC",
        "sedang",
        "AC tidak dingin mengganggu kenyamanan, tidak berbahaya.",
        0.9,
        Perbaikan(
            9,
            12 * H - 40,
            "selesai",
            11 * H + 600,
            11 * H + 600,
            11 * H + 590,
            11 * H + 500,
            Bayar(11 * H + 420, "qris"),
        ),
    ),
    TiketAwal(
        49,
        93,
        3,
        11,
        6 * H,
        "Wastafel kamar mandi mampet, airnya menggenang lama baru turun.",
        "Wastafel kamar mandi mampet",
        "selesai",
        "air",
        "sedang",
        "Saluran mampet mengganggu penggunaan kamar mandi.",
        0.86,
        Perbaikan(
            10,
            6 * H - 30,
            "selesai",
            5 * H + 900,
            5 * H + 900,
            5 * H + 895,
            5 * H + 840,
            Bayar(5 * H + 600, "va_bca", gagal_dulu="gopay"),
        ),
    ),
    TiketAwal(
        52,
        96,
        1,
        7,
        3 * H,
        "Lampu depan kamar berkedip terus kalau malam, kadang mati sendiri.",
        "Lampu depan kamar berkedip",
        "selesai",
        "listrik",
        "rendah",
        "Lampu berkedip belum membahayakan, perlu dicek saat sempat.",
        0.85,
        Perbaikan(8, 3 * H - 60, "selesai", 2 * H + 300, 2 * H + 300, 2 * H + 295, 2 * H + 240),
    ),
    TiketAwal(
        51,
        95,
        3,
        11,
        26 * 60,
        "Lampu kamar mandi mati total, sudah ganti bohlam tetap tidak menyala. Saklarnya longgar.",
        "Lampu kamar mandi mati total",
        "diproses",
        "listrik",
        "sedang",
        "Lampu mati total kemungkinan masalah instalasi, bukan bohlam.",
        0.88,
        Perbaikan(8, 25 * 60, "dikerjakan", 75, 70, 62),
    ),
    TiketAwal(
        50,
        94,
        6,
        9,
        4 * H,
        "Pintu kamar mandi susah dikunci, engselnya turun jadi pintunya menyangkut.",
        "Pintu kamar mandi susah dikunci",
        "selesai",
        "lainnya",
        "rendah",
        "Pintu menyangkut mengganggu, tidak berbahaya.",
        0.83,
        Perbaikan(10, 4 * H - 50, "selesai", 3 * H + 600, 3 * H + 600, 3 * H + 595, 3 * H + 540),
    ),
    TiketAwal(
        54,
        98,
        6,
        9,
        15 * 60,
        "Engsel pintu lemari lepas, pintunya miring dan susah ditutup.",
        "Engsel pintu lemari lepas",
        "diklasifikasi",
        "lainnya",
        "rendah",
        "Kerusakan furnitur ringan, tidak mendesak.",
        0.81,
    ),
    TiketAwal(
        56,
        100,
        5,
        12,
        110,
        "Keran kamar mandi tidak bisa ditutup rapat, air terus mengalir pelan.",
        "Keran kamar mandi tidak menutup",
        "dibuat",
        None,
        None,
        None,
        None,
    ),
    TiketAwal(
        57,
        101,
        3,
        11,
        18,
        "Stop kontak dekat meja memercikkan api waktu charger dicolok, ada bau gosong.",
        "Stop kontak memercikkan api",
        "diklasifikasi",
        "listrik",
        "tinggi",
        "Percikan api dan bau gosong adalah tanda korsleting yang berisiko kebakaran.",
        0.94,
    ),
]


def _isi_tiket(db: Session, now: datetime) -> None:
    nama = {p[0]: p[1] for p in PENGGUNA}
    pemilik = nama[4]
    for a in TIKET_AWAL:
        dibuat = menit_lalu(a.menit, now)
        db.add(
            Keluhan(
                id=a.id_keluhan,
                id_penghuni=a.penghuni,
                id_unit=a.unit,
                deskripsi=a.deskripsi,
                status="diterima",
                alasan_penolakan=None,
                created_at=dibuat,
            )
        )
        db.flush()
        r = a.perbaikan
        selesai = menit_lalu(r.selesai - 30, now) if r and r.selesai is not None else None
        db.add(
            Tiket(
                id=a.id_tiket,
                id_keluhan=a.id_keluhan,
                judul=a.judul,
                status=a.status,
                kategori=a.kategori,
                urgensi=a.urgensi,
                perlu_review=a.urgensi is None,
                ai_confidence=a.confidence,
                ai_alasan=a.alasan,
                penanganan="teknisi" if a.status == "selesai" else None,
                catatan_penanganan=None,
                created_at=dibuat,
                updated_at=selesai or dibuat,
            )
        )
        db.flush()
        riwayat = [(None, "dibuat", dibuat, "sistem")]
        if a.status != "dibuat":
            riwayat.append(("dibuat", "diklasifikasi", dibuat, "AI Classification"))
        if r:
            riwayat.append(("diklasifikasi", "diproses", menit_lalu(r.disetujui, now), pemilik))
        if selesai:
            riwayat.append(("diproses", "selesai", selesai, pemilik))
        db.add_all(
            TiketRiwayat(id_tiket=a.id_tiket, dari=d, ke=k, waktu=w, oleh=o, catatan=None) for d, k, w, o in riwayat
        )
    db.flush()


# Nomor awal sama dengan mode mock: WO-0009 dst., sehingga tiket TKT-0051 dikerjakan lewat WO-0012.
ID_WO_AWAL = 9


def _isi_perbaikan(db: Session, now: datetime) -> None:
    """Repair Verification tiket awal: estimasi disetujui -> work order -> log servis -> bukti -> invoice."""
    nama = {p[0]: p[1] for p in PENGGUNA}
    pemilik = nama[4]
    lokasi_unit = {u[0]: next(Titik(p[3], p[4]) for p in PROPERTI if p[0] == u[1]) for u in UNIT}
    nomor_unit = {u[0]: u[2] for u in UNIT}
    lokasi_teknisi = {t[0]: Titik(t[6], t[7]) for t in TEKNISI}
    id_est = id_wo = id_inv = id_lampiran = 0
    for a in TIKET_AWAL:
        r = a.perbaikan
        if not r or not a.kategori or not a.urgensi:
            continue
        id_est += 1
        id_wo_ini = ID_WO_AWAL + id_wo
        id_wo += 1
        jarak = jarak_km(lokasi_unit[a.unit], lokasi_teknisi[r.teknisi])
        rincian, total = estimasi_biaya(a.kategori, a.urgensi, a.deskripsi, jarak)
        setuju = menit_lalu(r.disetujui, now)
        db.add(
            Estimasi(
                id=id_est,
                id_tiket=a.id_tiket,
                id_teknisi=r.teknisi,
                kandidat=[],
                rincian=rincian,
                total=total,
                status="disetujui",
                diputuskan_oleh=pemilik,
                diputuskan_at=setuju,
                created_at=menit_lalu(r.disetujui + 5, now),
            )
        )

        id_sebelum = id_sesudah = verifikasi = None
        if r.selesai is not None:
            u = nomor_unit[a.unit]
            foto = [
                (f"sebelum-{u}.jpg", "/bukti/sebelum.svg", 184_220),
                (f"sesudah-{u}.jpg", "/bukti/sesudah.svg", 201_904),
            ]
            for nama_file, path, ukuran in foto:
                id_lampiran += 1
                db.add(
                    Lampiran(
                        id=id_lampiran,
                        owner_type="bukti",
                        owner_id=id_wo_ini,
                        storage_path=path,
                        nama_file=nama_file,
                        mime="image/svg+xml",
                        ukuran_byte=ukuran,
                        created_at=menit_lalu(r.selesai + 10, now),
                    )
                )
            id_sebelum, id_sesudah = id_lampiran - 1, id_lampiran
            verifikasi = verifikasi_bukti(
                Foto("sebelum.jpg", "image/jpeg", 184_220), Foto("sesudah.jpg", "image/jpeg", 201_904)
            )
        jadwal = menit_lalu(r.jadwal, now)
        db.add(
            WorkOrder(
                id=id_wo_ini,
                id_tiket=a.id_tiket,
                id_teknisi=r.teknisi,
                id_estimasi=id_est,
                status=r.wo,
                biaya_final=total,
                slot_jadwal=[jadwal.isoformat().replace("+00:00", "Z")],
                jadwal_kunjungan=jadwal,
                id_bukti_sebelum=id_sebelum,
                id_bukti_sesudah=id_sesudah,
                verifikasi=verifikasi,
                created_at=setuju,
                updated_at=menit_lalu(next(m for m in (r.selesai, r.mulai, r.disetujui) if m is not None), now),
            )
        )
        db.flush()

        log = [
            ("dibuat", r.disetujui, "sistem", f"Ditugaskan ke {nama[r.teknisi]}"),
            ("jadwal", r.disetujui - 20, nama[a.penghuni], None),
        ]
        if r.tiba is not None:
            log.append(("tiba", r.tiba, nama[r.teknisi], None))
        if r.mulai is not None:
            log.append(("mulai", r.mulai, nama[r.teknisi], "Cek instalasi dan ganti komponen yang rusak."))
        if r.selesai is not None:
            log += [
                ("bukti_valid", r.selesai + 10, "Evidence Verification", "4 dari 4 pemeriksaan lolos"),
                ("dikonfirmasi_penghuni", r.selesai, nama[a.penghuni], None),
                ("selesai", r.selesai - 30, pemilik, "Pemilik menerima hasil perbaikan"),
            ]
        db.add_all(
            LogServis(id_work_order=id_wo_ini, aktivitas=akt, catatan=cat, oleh=oleh, waktu=menit_lalu(m, now))
            for akt, m, oleh, cat in log
        )

        # Billing: invoice terbit ke pemilik saat pemilik menerima hasil perbaikan.
        if r.selesai is None:
            continue
        persen, komisi = hitung_komisi(total)
        terbit = menit_lalu(r.selesai - 30, now)
        id_inv += 1
        db.add(
            Invoice(
                id=id_inv,
                id_work_order=id_wo_ini,
                jenis="perbaikan",
                rincian=rincian,
                biaya=total,
                persen_komisi=persen,
                komisi=komisi,
                total=total,
                status="lunas" if r.bayar else "belum_dibayar",
                jatuh_tempo=terbit.astimezone(WIB).date() + timedelta(days=7),
                dibayar_at=menit_lalu(r.bayar.menit, now) if r.bayar else None,
                created_at=terbit,
            )
        )
    db.flush()


def _notifikasi_awal(nama: dict[int, str]) -> list[tuple[int, str, str, str, int]]:
    """(id penerima, kode tiket, jenis, isi, menit lalu)."""
    return [
        (
            4,
            "TKT-0052",
            "invoice",
            f"Tagihan perbaikan A-101 ({nama[1]}) INV-0003 Rp 165.000 sudah terbit. Bayar sebelum jatuh tempo.",
            2 * H + 240,
        ),
        (
            8,
            "TKT-0051",
            "teknisi_ditugaskan",
            "Pekerjaan baru WO-0012: Lampu kamar mandi mati total, Kos Kenanga B-201.",
            25 * 60,
        ),
        (3, "TKT-0051", "progres", "Pak Slamet sudah tiba dan mulai memperbaiki.", 62),
        (4, "TKT-0056", "tiket_dibuat", f"Keran kamar mandi tidak menutup. Unit B-202 ({nama[5]}).", 110),
        (5, "TKT-0056", "tiket_dibuat", "Laporanmu diterima: Keran kamar mandi tidak menutup.", 110),
        (
            4,
            "TKT-0057",
            "prioritas_tinggi",
            f"Stop kontak memercikkan api. Unit B-201 ({nama[3]}). Mohon segera dicek.",
            18,
        ),
        (3, "TKT-0057", "prioritas_tinggi", "Laporanmu diprioritaskan TINGGI. Pemilik sudah dikabari.", 18),
    ]


def _isi_notifikasi(db: Session, now: datetime) -> None:
    no_wa = {p[0]: p[3] for p in PENGGUNA}
    nama = {p[0]: p[1] for p in PENGGUNA}
    db.add_all(
        Notifikasi(
            id_penerima=i,
            kode_tiket=kode,
            jenis=jenis,
            isi=isi,
            kanal="whatsapp",
            no_tujuan=no_wa[i],
            status_kirim="terkirim",
            provider="mock",
            created_at=menit_lalu(menit, now),
        )
        for i, kode, jenis, isi, menit in _notifikasi_awal(nama)
    )
    db.flush()


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
    now = now_utc()
    _isi_tiket(db, now)
    _isi_perbaikan(db, now)
    _isi_notifikasi(db, now)
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
