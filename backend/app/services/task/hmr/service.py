"""[Task: Handle Maintenance Request] orkestrator Complaint Handling.

Hanya Task yang boleh memanggil service lain. Urutan langkah dan teks `operasi` di trace
mengikuti mock frontend (frontend/src/mocks/services.ts, objek `hmr`).
Bagian Repair Verification (estimasi, persetujuan, jadwal, biaya tambahan) ditambahkan di fase P5.
"""

from sqlalchemy.orm import Session

from app import views
from app.core.errors import ServiceError
from app.core.format import LABEL_KATEGORI, tanggal
from app.core.trace import Tracer
from app.services.entity.complaint_ticket import service as complaint_ticket
from app.services.entity.complaint_ticket.models import Tiket
from app.services.entity.tenant_lease import service as tenant_lease
from app.services.entity.tenant_lease.models import Pengguna
from app.services.utility.ai_classification import service as ai_classification
from app.services.utility.media_storage import service as media_storage
from app.services.utility.media_storage.service import FileMasuk
from app.services.utility.notification import service as notification
from app.services.utility.notification.service import Penerima
from app.views.schemas import KeluhanResponse, TiketDetail

PESAN_AI_GAGAL = "Klasifikasi AI gagal. Tiket tetap dibuat dan menunggu klasifikasi ulang oleh pemilik."

# ---------- Notifikasi status tiket ----------


def _penerima(p: Pengguna) -> Penerima:
    return Penerima(id=p.id, no_wa=p.no_wa)


def kabari_perubahan(db: Session, t: Tiket, jenis: str, catatan: str | None = None) -> int:
    """Pesan WhatsApp per jenis; isi untuk pemilik dan penghuni dibedakan (sama dengan mock)."""
    k = complaint_ticket.get_keluhan(db, t.id_keluhan)
    unit = tenant_lease.info_unit(db, k.id_unit)
    penghuni = tenant_lease.get_pengguna(db, k.id_penghuni)
    pemilik = tenant_lease.get_pengguna(db, unit.id_pemilik)
    kat = LABEL_KATEGORI[t.kategori] if t.kategori else ""
    judul = t.judul if t.judul.endswith("…") else f"{t.judul}."  # judul terpotong sudah berakhir "…"
    u = unit.nomor_unit
    hari = complaint_ticket.HARI_BUKA_ULANG
    pesan = {
        "tiket_dibuat": (f"{judul} Unit {u} ({penghuni.nama}).", f"Laporanmu diterima: {judul}"),
        "diklasifikasi": (
            f"{kat} · prioritas {t.urgensi}. Unit {u} ({penghuni.nama}).",
            f"Laporanmu dikategorikan {kat}, prioritas {t.urgensi}.",
        ),
        "prioritas_tinggi": (
            f"{judul} Unit {u} ({penghuni.nama}). Mohon segera dicek.",
            "Laporanmu diprioritaskan TINGGI. Pemilik sudah dikabari.",
        ),
        "diproses": (f"Tiket {u} ditandai diproses.", "Pemilik sedang memproses laporanmu."),
        "dibatalkan": (
            f"Tiket {u} dibatalkan.",
            f"Laporanmu dibatalkan oleh pemilik.{f' Catatan: {catatan}' if catatan else ''}",
        ),
        "selesai": (
            f"Tiket {u} ditutup tanpa teknisi.",
            f"Pemilik menangani laporanmu tanpa memanggil teknisi.{f' Catatan: {catatan}' if catatan else ''} "
            f"Kalau masih bermasalah, buka ulang tiketnya dalam {hari} hari.",
        ),
        "dibuka_ulang": (
            f"{penghuni.nama} membuka ulang tiket {u}: {catatan or 'masih bermasalah'}. Mohon ditinjau lagi.",
            "Tiketmu dibuka ulang. Pemilik akan meninjaunya lagi.",
        ),
    }[jenis]
    jenis_notif = "tiket_dibuat" if jenis == "dibuka_ulang" else jenis
    return notification.kirim(
        db,
        [_penerima(pemilik), _penerima(penghuni)],
        complaint_ticket.kode_tiket(t.id),
        jenis_notif,
        lambda p: pesan[0] if p.id == pemilik.id else pesan[1],
    )


def _jenis_klasifikasi(urgensi: str) -> str:
    return "prioritas_tinggi" if urgensi == "tinggi" else "diklasifikasi"


def _klasifikasi(db: Session, t: Tiket, teks: str, jumlah_gambar: int, tr: Tracer) -> None:
    with tr.step("AI Classification", "Utility", "classifyKeluhan") as s:
        hasil = ai_classification.classify(teks, jumlah_gambar)
        s.operasi = f"classifyKeluhan → {LABEL_KATEGORI[hasil.kategori]}, {hasil.urgensi}, {hasil.confidence:.2f}"
    with tr.step("Complaint Ticket", "Entity", "setKategoriUrgensi + setStatusTiket(diklasifikasi)"):
        complaint_ticket.set_kategori_urgensi(
            db, t.id, hasil.kategori, hasil.urgensi, hasil.confidence, hasil.alasan, hasil.judul
        )
        complaint_ticket.set_status_tiket(db, t.id, "diklasifikasi", "AI Classification")
    jenis = _jenis_klasifikasi(hasil.urgensi)
    with tr.step("Notification", "Utility", f"setNotifikasi({jenis})") as s:
        s.operasi = f"setNotifikasi({jenis}) × {kabari_perubahan(db, t, jenis)} (WA mock)"


# ---------- Operasi publik ----------


def ajukan_keluhan(db: Session, user: Pengguna, deskripsi: str, files: list[FileMasuk]) -> tuple[int, KeluhanResponse]:
    """Operasi Add Keluhan: orkestrasi lengkap Complaint Handling (plan §3)."""
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
        return 200, KeluhanResponse(
            hasil="ditolak",
            keluhan=views.keluhan(db, k),
            tiket=None,
            alasan=alasan,
            sewa=sewa,
            warning=None,
            trace=tr.as_list(),  # type: ignore[arg-type]
        )

    # Lampiran disimpan sebelum data keluhan ditulis (aturan kontrak D2 slide 9).
    with tr.step("Media Storage", "Utility", "addLampiranMedia") as s:
        lampiran = [media_storage.simpan(db, f, owner_type="keluhan") for f in files]
        s.operasi = f"addLampiranMedia({len(lampiran)} file) → {len(lampiran)} url"

    # Commit pertama: keluhan + tiket.
    with tr.step("Complaint Ticket", "Entity", "addKeluhan + addTiket → status dibuat"):
        k = complaint_ticket.add_keluhan(db, user.id, id_unit, teks, "diterima", None)
        media_storage.tautkan(db, [lp.id for lp in lampiran], k.id)
        t = complaint_ticket.add_tiket(db, k.id, ai_classification.judul_sementara(teks))
    with tr.step("Notification", "Utility", "setNotifikasi(tiket_dibuat)") as s:
        s.operasi = f"setNotifikasi(tiket_dibuat) × {kabari_perubahan(db, t, 'tiket_dibuat')} (WA mock)"
    db.commit()

    # AI dipanggil di luar commit pertama; bila gagal, tiket tetap ada berstatus "dibuat".
    warning = None
    try:
        _klasifikasi(db, t, teks, sum(lp.mime.startswith("image/") for lp in lampiran), tr)
        db.commit()
    except ServiceError as e:
        if e.status != 503:
            raise
        db.rollback()
        warning = PESAN_AI_GAGAL

    t = complaint_ticket.get_tiket(db, t.id)
    return 201, KeluhanResponse(
        hasil="diterima",
        keluhan=views.keluhan(db, complaint_ticket.get_keluhan(db, t.id_keluhan)),
        tiket=views.tiket_detail(db, t),
        alasan=None,
        sewa=sewa,
        warning=warning,
        trace=tr.as_list(),  # type: ignore[arg-type]
    )


def ubah_status(db: Session, user: Pengguna, id_tiket: int, ke: str, catatan: str | None) -> TiketDetail:
    """Keputusan pemilik atas tiket tanpa memanggil teknisi:
    - "selesai": ditangani sendiri, hanya dari "diklasifikasi", tanpa biaya.
    - "dibatalkan": tiket dibatalkan (P5: beserta estimasi dan work order yang berjalan).
    Status "diproses" tidak diset manual: tiket diproses setelah estimasi biaya disetujui.
    """
    alasan = (catatan or "").strip()[:300] or None
    t = views.tiket_untuk(db, user, id_tiket)
    if ke == "selesai":
        if t.status != "diklasifikasi":
            raise ServiceError(
                409,
                "TIDAK_BISA_DITUTUP",
                "Tiket bisa ditutup tanpa teknisi selama belum ada teknisi yang ditugaskan.",
            )
        complaint_ticket.set_status_tiket(db, id_tiket, "selesai", user.nama, alasan)
        complaint_ticket.set_penanganan(db, id_tiket, "sendiri", alasan)
    else:
        complaint_ticket.set_status_tiket(db, id_tiket, "dibatalkan", user.nama, alasan)
    kabari_perubahan(db, t, ke, alasan)
    db.commit()
    return views.tiket_detail(db, t)


def klasifikasi_ulang(db: Session, user: Pengguna, id_tiket: int) -> TiketDetail:
    t = views.tiket_untuk(db, user, id_tiket)
    if t.status != "dibuat":
        raise ServiceError(409, "SUDAH_DIKLASIFIKASI", "Tiket sudah diklasifikasi.")
    k = complaint_ticket.get_keluhan(db, t.id_keluhan)
    gambar = sum(lp.mime.startswith("image/") for lp in media_storage.list_by_owner(db, "keluhan", k.id))
    _klasifikasi(db, t, k.deskripsi.replace("#gagal-ai", ""), gambar, Tracer())
    db.commit()
    return views.tiket_detail(db, t)


def buka_ulang(db: Session, user: Pengguna, id_tiket: int, alasan: str) -> TiketDetail:
    """Penghuni membuka ulang tiket yang ditutup pemilik tanpa teknisi -> kembali ke tahap tinjau pemilik."""
    teks = alasan.strip()
    if not 5 <= len(teks) <= 300:
        raise ServiceError(422, "ALASAN_TIDAK_VALID", "Ceritakan apa yang masih bermasalah (5 sampai 300 karakter).")
    t = views.tiket_untuk(db, user, id_tiket)
    if not complaint_ticket.bisa_dibuka_ulang(db, t):
        raise ServiceError(
            409,
            "TIDAK_BISA_DIBUKA_ULANG",
            "Tiket hanya bisa dibuka ulang bila ditangani sendiri oleh pemilik, "
            f"paling lama {complaint_ticket.HARI_BUKA_ULANG} hari setelah ditutup.",
        )
    complaint_ticket.set_status_tiket(db, id_tiket, "diklasifikasi", user.nama, teks)
    complaint_ticket.set_penanganan(db, id_tiket, None)
    kabari_perubahan(db, t, "dibuka_ulang", teks)
    db.commit()
    return views.tiket_detail(db, t)
