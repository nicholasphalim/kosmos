"""[Task: Handle Maintenance Request] orkestrator Complaint Handling + bagian awal Repair Verification.

Hanya Task yang boleh memanggil service lain. Urutan langkah dan teks `operasi` di trace
mengikuti mock frontend (frontend/src/mocks/services.ts, objek `hmr`).
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import views
from app.core.errors import ServiceError
from app.core.format import LABEL_KATEGORI, rupiah, tanggal
from app.core.security import require_role
from app.core.trace import Tracer
from app.core.waktu import now_utc
from app.services.entity.complaint_ticket import service as complaint_ticket
from app.services.entity.complaint_ticket.models import Tiket
from app.services.entity.technician import service as technician
from app.services.entity.tenant_lease import service as tenant_lease
from app.services.entity.tenant_lease.models import Pengguna
from app.services.entity.work_order import service as work_order
from app.services.micro.cost_estimation import estimasi_biaya
from app.services.micro.technician_matching import CalonTeknisi, jarak_km, match_teknisi
from app.services.utility.ai_classification import service as ai_classification
from app.services.utility.media_storage import service as media_storage
from app.services.utility.media_storage.service import FileMasuk
from app.services.utility.notification import service as notification
from app.services.utility.notification.service import Penerima
from app.views.schemas import EstimasiBiaya, EstimasiResponse, KeluhanResponse, TiketDetail

from .models import Estimasi

# ---------- Notifikasi status tiket ----------


def _penerima(p: Pengguna) -> Penerima:
    return Penerima(id=p.id, no_wa=p.no_wa)


def _kabari_perubahan(db: Session, t: Tiket, jenis: str) -> int:
    """Pesan WhatsApp per jenis; isi untuk pemilik dan penghuni dibedakan."""
    k = complaint_ticket.get_keluhan(db, t.id_keluhan)
    unit = tenant_lease.info_unit(db, k.id_unit)
    penghuni = tenant_lease.get_pengguna(db, k.id_penghuni)
    pemilik = tenant_lease.get_pengguna(db, unit.id_pemilik)
    kat = LABEL_KATEGORI[t.kategori] if t.kategori else ""
    judul = t.judul if t.judul.endswith("…") else f"{t.judul}."  # judul terpotong sudah berakhir "…"
    u = unit.nomor_unit
    pesan = {
        "tiket_dibuat": (f"{judul} Unit {u} ({penghuni.nama}).", f"Laporanmu diterima: {judul}"),
        "diklasifikasi": (f"{kat} · prioritas {t.urgensi}. Unit {u} ({penghuni.nama}).", f"Laporanmu dikategorikan {kat}, prioritas {t.urgensi}."),
        "prioritas_tinggi": (f"{judul} Unit {u} ({penghuni.nama}). Mohon segera dicek.", "Laporanmu diprioritaskan TINGGI. Pemilik sudah dikabari."),
        "diproses": (f"Tiket {u} ditandai diproses.", "Pemilik sedang memproses laporanmu."),
        "dibatalkan": (f"Tiket {u} dibatalkan.", "Laporanmu dibatalkan oleh pemilik."),
    }[jenis]
    return notification.kirim(
        db, [_penerima(pemilik), _penerima(penghuni)], complaint_ticket.kode_tiket(t.id), jenis,
        lambda p: pesan[0] if p.id == pemilik.id else pesan[1],
    )


def _jenis_klasifikasi(urgensi: str) -> str:
    return "prioritas_tinggi" if urgensi == "tinggi" else "diklasifikasi"


# ---------- Repair Verification: cari teknisi + estimasi ----------


def _cari_teknisi_dan_estimasi(db: Session, t: Tiket, tr: Tracer) -> Estimasi | None:
    """BPMN Repair Verification langkah 1-3. Dipanggil otomatis setelah tiket diklasifikasi.
    Mengembalikan None bila belum ada teknisi yang cocok."""
    if t.status != "diklasifikasi" or not t.kategori or not t.urgensi:
        raise ServiceError(409, "TIKET_BELUM_SIAP", "Teknisi dicarikan untuk tiket yang sudah diklasifikasi dan belum diproses.")
    kategori, urgensi = t.kategori, t.urgensi
    k = complaint_ticket.get_keluhan(db, t.id_keluhan)
    unit = tenant_lease.info_unit(db, k.id_unit)

    with tr.step("Technician", "Entity", "getTeknisiTersedia") as s:
        calon_rows = technician.get_teknisi(db)
        s.operasi = f"getTeknisiTersedia({LABEL_KATEGORI[kategori]}) → {len(calon_rows)} teknisi"
    with tr.step("Technician", "Entity", "getStatusVerifikasiTeknisi") as s:
        n = sum(technician.get_status_verifikasi(db, r.id_pengguna) for r in calon_rows)
        s.operasi = f"getStatusVerifikasiTeknisi → {n} terverifikasi"
    with tr.step("Work Order", "Entity", "hitungBebanAktif(teknisi[])"):
        beban = {r.id_pengguna: work_order.jumlah_aktif(db, r.id_pengguna) for r in calon_rows}
    with tr.step("Technician Matching", "Micro", "matchTeknisi") as s:
        kandidat = match_teknisi(kategori, urgensi, [
            CalonTeknisi(
                teknisi=views.teknisi_ringkas(db, r.id_pengguna).model_dump(),
                tersedia=r.tersedia,
                jarak_km=jarak_km(unit.lat, unit.lng, r.lat, r.lng),
                beban=beban[r.id_pengguna],
            )
            for r in calon_rows
        ])
        terpilih = next((x for x in kandidat if x["lolos"]), None)
        s.operasi = f"matchTeknisi({LABEL_KATEGORI[kategori]}, {urgensi}) → {terpilih['teknisi']['nama'] if terpilih else 'tidak ada'}"
    if terpilih is None:
        return None
    with tr.step("Cost Estimation", "Micro", "estimateBiaya") as s:
        est = estimasi_biaya(kategori, urgensi, k.deskripsi, terpilih["jarak_km"])
        s.operasi = f"estimateBiaya → {rupiah(est['total'])}"

    with tr.step("Handle Maintenance Request", "Task", "simpan estimasi → menunggu persetujuan"):
        # Estimasi lama yang belum diputuskan diganti yang baru.
        for lama in db.scalars(select(Estimasi).filter_by(id_tiket=t.id, status="menunggu")):
            lama.status = "ditolak"
        row = Estimasi(
            id_tiket=t.id, id_teknisi=terpilih["teknisi"]["id"], kandidat=kandidat, rincian=est["rincian"],
            total=est["total"], status="menunggu", created_at=now_utc(),
        )
        db.add(row)
        db.flush()
    nama_teknisi = terpilih["teknisi"]["nama"]
    with tr.step("Notification", "Utility", "setNotifikasi(estimasi)") as s:
        pemilik = tenant_lease.get_pengguna(db, unit.id_pemilik)
        n = notification.kirim(
            db, [_penerima(pemilik)], complaint_ticket.kode_tiket(t.id), "estimasi",
            lambda _p: f"Estimasi {unit.nomor_unit}: {rupiah(est['total'])}, teknisi {nama_teknisi}. Buka Kosmos untuk menyetujui.",
        )
        s.operasi = f"setNotifikasi(estimasi) × {n} (WA mock)"
    return row


# ---------- Operasi publik ----------


def ajukan_keluhan(db: Session, user: Pengguna, deskripsi: str, files: list[FileMasuk]) -> tuple[int, KeluhanResponse]:
    """Operasi Add Keluhan: orkestrasi lengkap Complaint Handling (plan §3)."""
    require_role(user, "penghuni")
    teks = deskripsi.strip()
    if not 10 <= len(teks) <= 1000:
        raise ServiceError(422, "DESKRIPSI_TIDAK_VALID", "Deskripsi harus 10 sampai 1000 karakter.")
    media_storage.validasi(files)

    tr = Tracer()
    with tr.step("Handle Maintenance Request", "Task", f"ajukanKeluhan(deskripsi, {len(files)} file)"):
        pass
    with tr.step("Tenant and Lease", "Entity", "getIdUnit") as s:
        id_unit = tenant_lease.get_id_unit(db, user.id)
        s.operasi = f"getIdUnit(penghuni={user.id}) → {id_unit}"
    with tr.step("Tenant and Lease", "Entity", "getStatusSewa") as s:
        sewa = tenant_lease.get_status_sewa(db, id_unit)
        s.operasi = f"getStatusSewa(unit={id_unit}) → {sewa.status_sewa}"

    # Cabang BPMN: sewa tidak aktif -> keluhan ditolak, tidak ada tiket.
    if sewa.status_sewa != "aktif":
        unit = tenant_lease.info_unit(db, id_unit)
        alasan = f"Sewa {unit.nama_properti} · {unit.nomor_unit} berakhir {tanggal(sewa.tanggal_selesai)}."
        with tr.step("Complaint Ticket", "Entity", "addKeluhan(status=ditolak)"):
            k = complaint_ticket.add_keluhan(db, user.id, id_unit, teks, "ditolak", alasan)
        db.commit()
        return 200, KeluhanResponse(hasil="ditolak", keluhan=views.keluhan(db, k), tiket=None, alasan=alasan,
                                    sewa=sewa, warning=None, trace=tr.as_list())  # type: ignore[arg-type]

    # Lampiran disimpan sebelum data keluhan ditulis (aturan kontrak D2 slide 9).
    with tr.step("Media Storage", "Utility", "addLampiranMedia") as s:
        lampiran = [media_storage.simpan(db, f, owner_type="keluhan") for f in files]
        s.operasi = f"addLampiranMedia({len(lampiran)} file) → {len(lampiran)} url"

    # Transaksi pertama: keluhan + tiket.
    with tr.step("Complaint Ticket", "Entity", "addKeluhan + addTiket → status dibuat"):
        k = complaint_ticket.add_keluhan(db, user.id, id_unit, teks, "diterima", None)
        media_storage.tautkan(db, [l.id for l in lampiran], k.id)
        t = complaint_ticket.add_tiket(db, k.id, ai_classification.judul_sementara(teks))
    with tr.step("Notification", "Utility", "setNotifikasi(tiket_dibuat)") as s:
        s.operasi = f"setNotifikasi(tiket_dibuat) × {_kabari_perubahan(db, t, 'tiket_dibuat')} (WA mock)"
    db.commit()

    # AI dipanggil di luar transaksi pertama; bila gagal, tiket tetap ada berstatus "dibuat".
    jumlah_gambar = sum(l.mime.startswith("image/") for l in lampiran)
    warning = None
    try:
        with tr.step("AI Classification", "Utility", "classifyKeluhan") as s:
            hasil = ai_classification.classify(teks, jumlah_gambar)
            s.operasi = f"classifyKeluhan → {LABEL_KATEGORI[hasil.kategori]}, {hasil.urgensi}, {hasil.confidence:.2f}"
        with tr.step("Complaint Ticket", "Entity", "setKategoriUrgensi + setStatusTiket(diklasifikasi)"):
            complaint_ticket.set_kategori_urgensi(db, t.id, hasil.kategori, hasil.urgensi, hasil.confidence, hasil.alasan, hasil.judul)
            complaint_ticket.set_status_tiket(db, t.id, "diklasifikasi", "AI Classification")
        jenis = _jenis_klasifikasi(hasil.urgensi)
        with tr.step("Notification", "Utility", f"setNotifikasi({jenis})") as s:
            s.operasi = f"setNotifikasi({jenis}) × {_kabari_perubahan(db, t, jenis)} (WA mock)"
        # BPMN Repair Verification dimulai otomatis setelah tiket diklasifikasi.
        _cari_teknisi_dan_estimasi(db, t, tr)
    except ServiceError as e:
        if e.status != 503:
            raise
        db.rollback()
        warning = "Klasifikasi AI gagal. Tiket tetap dibuat dan menunggu klasifikasi ulang oleh pemilik."
    db.commit()

    t = complaint_ticket.get_tiket(db, t.id)
    return 201, KeluhanResponse(
        hasil="diterima", keluhan=views.keluhan(db, complaint_ticket.get_keluhan(db, t.id_keluhan)),
        tiket=views.tiket_detail(db, t), alasan=None, sewa=sewa, warning=warning, trace=tr.as_list(),  # type: ignore[arg-type]
    )


def ubah_status(db: Session, user: Pengguna, id_tiket: int, ke: str) -> TiketDetail:
    """Pemilik membatalkan tiket. Status "diproses" tidak diset manual: tiket diproses setelah estimasi disetujui."""
    require_role(user, "pemilik")
    if ke != "dibatalkan":
        raise ServiceError(422, "STATUS_TIDAK_DIDUKUNG", "Tiket diproses setelah estimasi biaya disetujui.")
    t = views.tiket_untuk(db, user, id_tiket)
    complaint_ticket.set_status_tiket(db, id_tiket, ke, user.nama)
    # Batalkan juga proses perbaikan yang sedang berjalan.
    for e in db.scalars(select(Estimasi).filter_by(id_tiket=id_tiket, status="menunggu")):
        e.status = "ditolak"
    wo = work_order.by_tiket(db, id_tiket)
    if wo and wo.status not in ("selesai", "dibatalkan"):
        work_order.set_status(db, wo.id, "dibatalkan")
        work_order.add_log(db, wo.id, "dibatalkan", user.nama, "Tiket dibatalkan pemilik")
    _kabari_perubahan(db, t, ke)
    db.commit()
    return views.tiket_detail(db, t)


def klasifikasi_ulang(db: Session, user: Pengguna, id_tiket: int) -> TiketDetail:
    require_role(user, "pemilik")
    t = views.tiket_untuk(db, user, id_tiket)
    if t.status != "dibuat":
        raise ServiceError(409, "SUDAH_DIKLASIFIKASI", "Tiket sudah diklasifikasi.")
    k = complaint_ticket.get_keluhan(db, t.id_keluhan)
    gambar = sum(l.mime.startswith("image/") for l in media_storage.list_by_owner(db, "keluhan", k.id))
    hasil = ai_classification.classify(k.deskripsi.replace("#gagal-ai", ""), gambar)
    complaint_ticket.set_kategori_urgensi(db, id_tiket, hasil.kategori, hasil.urgensi, hasil.confidence, hasil.alasan, hasil.judul)
    complaint_ticket.set_status_tiket(db, id_tiket, "diklasifikasi", "AI Classification")
    _kabari_perubahan(db, t, _jenis_klasifikasi(hasil.urgensi))
    _cari_teknisi_dan_estimasi(db, t, Tracer())
    db.commit()
    return views.tiket_detail(db, t)


def buat_estimasi(db: Session, user: Pengguna, id_tiket: int) -> EstimasiResponse:
    """Cari ulang teknisi + estimasi secara manual (fallback bila estimasi otomatis belum terbentuk)."""
    require_role(user, "pemilik")
    tr = Tracer()
    with tr.step("Handle Maintenance Request", "Task", f"getEstimasiBiaya(tiket={id_tiket})"):
        pass
    with tr.step("Complaint Ticket", "Entity", "getTiket") as s:
        t = views.tiket_untuk(db, user, id_tiket)
        s.operasi = f"getTiket → {t.kategori or '?'}, {t.urgensi or '?'}"
    row = _cari_teknisi_dan_estimasi(db, t, tr)
    if row is None:
        raise ServiceError(422, "TEKNISI_TIDAK_ADA", "Belum ada teknisi terverifikasi yang tersedia untuk kategori ini.")
    db.commit()
    return EstimasiResponse(estimasi=views.estimasi(db, row), trace=tr.as_list())  # type: ignore[arg-type]


def get_estimasi(db: Session, user: Pengguna, id_tiket: int) -> EstimasiBiaya | None:
    views.tiket_untuk(db, user, id_tiket)
    row = db.scalars(select(Estimasi).filter_by(id_tiket=id_tiket).order_by(Estimasi.id.desc()).limit(1)).first()
    return views.estimasi(db, row) if row else None
