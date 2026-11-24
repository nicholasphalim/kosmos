"""Data demo awal, meniru frontend/src/mocks/db.ts. Tanggal dihitung relatif terhadap waktu seed.

Jalankan manual: `uv run python -m app.seed` (menghapus semua data lalu mengisi ulang).
Data Billing (invoice, pembayaran, kas) ditambahkan di fase B3.
"""

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import SessionLocal, buat_tabel, hapus_tabel
from app.core.waktu import menit_lalu, now_utc, tanggal_geser
from app.services.entity.complaint_ticket.models import Keluhan, Tiket, TiketRiwayat
from app.services.entity.technician.models import Teknisi
from app.services.entity.tenant_lease.models import Pengguna, Properti, Sewa, Unit
from app.services.entity.work_order.models import LogServis, WorkOrder
from app.services.micro.cost_estimation import estimasi_biaya
from app.services.micro.evidence_verification import Foto, verifikasi_bukti
from app.services.micro.technician_matching import CalonTeknisi, jarak_km, match_teknisi
from app.services.task.hmr.models import Estimasi
from app.services.utility.media_storage.models import Lampiran
from app.services.utility.notification.models import Notifikasi

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


@dataclass
class Perbaikan:
    """Menit sebelum sekarang untuk tiap kejadian Repair Verification."""

    teknisi: int
    disetujui: int
    wo: str
    jadwal: int
    tiba: int | None = None
    mulai: int | None = None
    selesai: int | None = None


PERBAIKAN = {
    48: Perbaikan(9, 12 * HARI - 40, "selesai", 11 * HARI + 600, 11 * HARI + 600, 11 * HARI + 590, 11 * HARI + 500),
    49: Perbaikan(10, 6 * HARI - 30, "selesai", 5 * HARI + 900, 5 * HARI + 900, 5 * HARI + 895, 5 * HARI + 840),
    52: Perbaikan(8, 3 * HARI - 60, "selesai", 2 * HARI + 300, 2 * HARI + 300, 2 * HARI + 295, 2 * HARI + 240),
    51: Perbaikan(8, 25 * 60, "dikerjakan", 75, 70, 62),
}


def NOTIFIKASI(nama: dict[int, str]) -> list[tuple[int, str, str, str, int]]:
    return [
        (1, "TKT-0052", "invoice", "Tagihan perbaikan INV-0003 Rp 165.000 sudah terbit. Bayar sebelum jatuh tempo.", 2 * HARI + 240),
        (8, "TKT-0051", "teknisi_ditugaskan", "Pekerjaan baru WO-0012: Lampu kamar mandi mati total, Kos Kenanga B-201.", 25 * 60),
        (3, "TKT-0051", "progres", "Pak Slamet sudah tiba dan mulai memperbaiki.", 62),
        (4, "TKT-0056", "tiket_dibuat", f"Keran kamar mandi tidak menutup. Unit B-202 ({nama[5]}).", 110),
        (5, "TKT-0056", "tiket_dibuat", "Laporanmu diterima: Keran kamar mandi tidak menutup.", 110),
        (4, "TKT-0057", "prioritas_tinggi", f"Stop kontak memercikkan api. Unit B-201 ({nama[3]}). Mohon segera dicek.", 18),
        (3, "TKT-0057", "prioritas_tinggi", "Laporanmu diprioritaskan TINGGI. Pemilik sudah dikabari.", 18),
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

    db.flush()
    nama = {i: n for i, n, _r, _w in PENGGUNA}
    unit_ke_properti = {u: p for u, p, _n in UNIT}
    nomor_unit = {u: n for u, _p, n in UNIT}
    lokasi = {p: (la, lo) for p, _n, _o, la, lo in PROPERTI}
    teknisi = {t[0]: t for t in TEKNISI}

    def ringkas_teknisi(id_: int) -> dict:
        _i, keahlian, verif, _c, _t, rating, _la, _lo = teknisi[id_]
        no_wa = next(w for i, _n, _r, w in PENGGUNA if i == id_)
        return {"id": id_, "nama": nama[id_], "keahlian": keahlian, "terverifikasi": verif, "rating": rating, "no_wa": no_wa}

    def jarak_ke(id_unit: int, id_teknisi: int) -> float:
        la, lo = lokasi[unit_ke_properti[id_unit]]
        t = teknisi[id_teknisi]
        return jarak_km(la, lo, t[6], t[7])

    id_wo = 9  # sama dengan seq work_order di mock (WO-0009 dst.)
    id_lampiran = 1
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

        r = PERBAIKAN.get(a.id_tiket)
        if r is None or a.kategori is None or a.urgensi is None:
            continue

        # Repair Verification: estimasi disetujui -> work order -> log servis.
        est = estimasi_biaya(a.kategori, a.urgensi, a.deskripsi, jarak_ke(a.unit, r.teknisi))
        waktu_setuju = menit_lalu(r.disetujui, now)
        e = Estimasi(id_tiket=a.id_tiket, id_teknisi=r.teknisi, kandidat=[], rincian=est["rincian"], total=est["total"],
                     status="disetujui", diputuskan_oleh=nama[4], diputuskan_at=waktu_setuju, created_at=menit_lalu(r.disetujui + 5, now))
        db.add(e)
        db.flush()
        db.add(TiketRiwayat(id_tiket=a.id_tiket, dari="diklasifikasi", ke="diproses", waktu=waktu_setuju, oleh=nama[4]))

        waktu_jadwal = menit_lalu(r.jadwal, now)
        logs = [("dibuat", r.disetujui, "sistem", f"Ditugaskan ke {nama[r.teknisi]}"), ("jadwal", r.disetujui - 20, nama[a.penghuni], None)]
        if r.tiba is not None:
            logs.append(("tiba", r.tiba, nama[r.teknisi], None))
        if r.mulai is not None:
            logs.append(("mulai", r.mulai, nama[r.teknisi], "Cek instalasi dan ganti komponen yang rusak."))
        id_sebelum = id_sesudah = None
        verifikasi = None
        if r.selesai is not None:
            nu = nomor_unit[a.unit]
            db.add_all([
                Lampiran(id=id_lampiran, owner_type="bukti", owner_id=id_wo, url="/bukti/sebelum.svg",
                         nama_file=f"sebelum-{nu}.jpg", mime="image/svg+xml", ukuran_byte=184_220),
                Lampiran(id=id_lampiran + 1, owner_type="bukti", owner_id=id_wo, url="/bukti/sesudah.svg",
                         nama_file=f"sesudah-{nu}.jpg", mime="image/svg+xml", ukuran_byte=201_904),
            ])
            id_sebelum, id_sesudah = id_lampiran, id_lampiran + 1
            id_lampiran += 2
            verifikasi = verifikasi_bukti(Foto("sebelum.jpg", "image/jpeg", 184_220), Foto("sesudah.jpg", "image/jpeg", 201_904))
            logs.append(("bukti_valid", r.selesai + 10, "Evidence Verification", "4 dari 4 pemeriksaan lolos"))
            logs.append(("selesai", r.selesai, nama[a.penghuni], "Penghuni mengonfirmasi perbaikan selesai"))
            db.add(TiketRiwayat(id_tiket=a.id_tiket, dari="diproses", ke="selesai", waktu=menit_lalu(r.selesai, now), oleh=nama[a.penghuni]))
        db.add(WorkOrder(
            id=id_wo, id_tiket=a.id_tiket, id_teknisi=r.teknisi, id_estimasi=e.id, status=r.wo, biaya_final=est["total"],
            slot_jadwal=[iso(waktu_jadwal)], jadwal_kunjungan=waktu_jadwal, id_bukti_sebelum=id_sebelum, id_bukti_sesudah=id_sesudah,
            verifikasi=verifikasi, created_at=waktu_setuju,
            updated_at=menit_lalu(next(x for x in (r.selesai, r.mulai, r.disetujui) if x is not None), now),
        ))
        db.flush()
        db.add_all(LogServis(id_work_order=id_wo, aktivitas=akt, catatan=cat, oleh=oleh, waktu=menit_lalu(m, now)) for akt, m, oleh, cat in logs)
        id_wo += 1
        # Invoice, pembayaran, dan buku kas (Billing & Commission) ditambahkan di fase B3.

    # Tiket yang sudah diklasifikasi otomatis dicarikan teknisi; estimasinya menunggu persetujuan pemilik.
    db.flush()
    for a in TIKET_AWAL:
        if a.status != "diklasifikasi" or a.kategori is None or a.urgensi is None:
            continue
        beban = {i: db.scalar(select(func.count()).select_from(WorkOrder).where(
            WorkOrder.id_teknisi == i, WorkOrder.status.not_in(("selesai", "dibatalkan")))) or 0 for i in teknisi}
        kandidat = match_teknisi(a.kategori, a.urgensi, [
            CalonTeknisi(teknisi=ringkas_teknisi(i), tersedia=t[4], jarak_km=jarak_ke(a.unit, i), beban=beban[i]) for i, t in teknisi.items()
        ])
        terpilih = next((k for k in kandidat if k["lolos"]), None)
        if terpilih is None:
            continue
        est = estimasi_biaya(a.kategori, a.urgensi, a.deskripsi, terpilih["jarak_km"])
        db.add(Estimasi(id_tiket=a.id_tiket, id_teknisi=terpilih["teknisi"]["id"], kandidat=kandidat, rincian=est["rincian"],
                        total=est["total"], status="menunggu", created_at=menit_lalu(a.menit, now)))

    for id_penerima, kode, jenis, isi, menit in NOTIFIKASI(nama):
        no_wa = next(w for i, _n, _r, w in PENGGUNA if i == id_penerima)
        db.add(Notifikasi(id_penerima=id_penerima, kode_tiket=kode, jenis=jenis, isi=isi, kanal="whatsapp", no_tujuan=no_wa,
                          status_kirim="terkirim", provider="mock", created_at=menit_lalu(menit, now)))
    db.commit()


def iso(d: datetime) -> str:
    return d.astimezone(UTC).isoformat().replace("+00:00", "Z")


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
