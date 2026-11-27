"""[Task: Handle Maintenance Request] orkestrator Complaint Handling dan bagian Repair Verification
(cari teknisi, estimasi, persetujuan, jadwal kunjungan, keputusan biaya tambahan).

Hanya Task yang boleh memanggil service lain. Urutan langkah dan teks `operasi` di trace
mengikuti mock frontend (frontend/src/mocks/services.ts, objek `hmr`).
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import views
from app.core import validasi
from app.core.errors import ServiceError
from app.core.format import LABEL_KATEGORI, jadwal, rupiah, tanggal
from app.core.trace import Tracer
from app.core.waktu import WIB, now_utc
from app.services.entity.complaint_ticket import service as complaint_ticket
from app.services.entity.complaint_ticket.models import Tiket
from app.services.entity.invoice import service as invoice
from app.services.entity.technician import service as technician
from app.services.entity.tenant_lease import service as tenant_lease
from app.services.entity.tenant_lease.models import Pengguna
from app.services.entity.work_order import service as work_order
from app.services.micro import commission_calculation, cost_estimation, technician_matching
from app.services.micro.technician_matching import CalonTeknisi, Titik
from app.services.task.kabar import kabari_perbaikan, kabari_tagihan
from app.services.utility.ai_classification import service as ai_classification
from app.services.utility.media_storage import service as media_storage
from app.services.utility.media_storage.service import FileMasuk
from app.services.utility.notification import service as notification
from app.services.utility.notification.service import Penerima
from app.views.schemas import EstimasiBiaya, EstimasiResponse, KeluhanResponse, PersetujuanResponse, TiketDetail
from app.views.schemas import WorkOrder as WorkOrderOut

from .models import Estimasi

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
    if not validasi.teks_bermakna(teks):
        raise ServiceError(
            422, "DESKRIPSI_TIDAK_VALID", "Ceritakan masalahnya dengan kata-kata, bukan hanya angka atau simbol."
        )
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


def _tolak_estimasi_menunggu(db: Session, id_tiket: int) -> None:
    """Estimasi yang belum diputuskan tidak berlaku lagi (diganti, ditutup, atau dibatalkan)."""
    for e in db.scalars(select(Estimasi).filter_by(id_tiket=id_tiket, status="menunggu")):
        e.status = "ditolak"
    db.flush()


def ubah_status(db: Session, user: Pengguna, id_tiket: int, ke: str, catatan: str | None) -> TiketDetail:
    """Keputusan pemilik atas tiket tanpa memanggil teknisi:
    - "selesai": ditangani sendiri, hanya dari "diklasifikasi", tanpa work order dan tanpa tagihan.
    - "dibatalkan": tiket dibatalkan beserta estimasi dan work order yang berjalan. Bila teknisi sudah
      tiba di lokasi, pemilik tetap membayar biaya kunjungan (invoice jenis kunjungan).
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
        _tolak_estimasi_menunggu(db, id_tiket)
        kabari_perubahan(db, t, "selesai", alasan)
        db.commit()
        return views.tiket_detail(db, t)

    complaint_ticket.set_status_tiket(db, id_tiket, "dibatalkan", user.nama, alasan)
    _tolak_estimasi_menunggu(db, id_tiket)
    wo = work_order.by_tiket(db, id_tiket)
    inv_kunjungan = None
    if wo and wo.status not in work_order.DITUTUP:
        sudah_tiba = work_order.sudah_ada_log(db, wo.id, "tiba")
        work_order.set_status(db, wo.id, "dibatalkan")
        work_order.add_log(
            db,
            wo.id,
            "dibatalkan",
            user.nama,
            "Tiket dibatalkan pemilik setelah teknisi tiba; biaya kunjungan ditagihkan"
            if sudah_tiba
            else "Tiket dibatalkan pemilik",
        )
        if sudah_tiba:
            est = db.get(Estimasi, wo.id_estimasi)
            rincian, total = cost_estimation.biaya_kunjungan(est.rincian if est else [])
            persen, komisi = commission_calculation.hitung_komisi(total)
            inv_kunjungan = invoice.add(db, wo.id, "kunjungan", rincian, total, persen, komisi)
    kabari_perubahan(db, t, "dibatalkan", alasan)
    if inv_kunjungan:
        kabari_tagihan(db, inv_kunjungan, "invoice")
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
    if not 5 <= len(teks) <= 300 or not validasi.teks_bermakna(teks):
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


# ---------- Repair Verification (bagian HMR) ----------


def buat_estimasi(db: Session, user: Pengguna, id_tiket: int) -> EstimasiResponse:
    """Cari teknisi dan sajikan estimasi biaya (BPMN Repair Verification langkah 1-3)."""
    tr = Tracer()
    with tr.step("Handle Maintenance Request", "Task", f"getEstimasiBiaya(tiket={id_tiket})"):
        pass
    with tr.step("Complaint Ticket", "Entity", "getTiket") as s:
        t = views.tiket_untuk(db, user, id_tiket)
        s.operasi = f"getTiket → {t.kategori or '?'}, {t.urgensi or '?'}"
    if t.status != "diklasifikasi" or not t.kategori or not t.urgensi:
        raise ServiceError(
            409, "TIKET_BELUM_SIAP", "Teknisi dicarikan untuk tiket yang sudah diklasifikasi dan belum diproses."
        )
    kategori, urgensi = t.kategori, t.urgensi
    k = complaint_ticket.get_keluhan(db, t.id_keluhan)
    unit = tenant_lease.info_unit(db, k.id_unit)
    lokasi = Titik(unit.lat, unit.lng)

    with tr.step("Technician", "Entity", "getTeknisiTersedia") as s:
        calon_rows = technician.get_teknisi(db)
        s.operasi = f"getTeknisiTersedia({LABEL_KATEGORI[kategori]}) → {len(calon_rows)} teknisi"
    with tr.step("Technician", "Entity", "getStatusVerifikasiTeknisi") as s:
        n = sum(technician.get_status_verifikasi(db, r.id_pengguna) for r in calon_rows)
        s.operasi = f"getStatusVerifikasiTeknisi → {n} terverifikasi"
    with tr.step("Work Order", "Entity", "hitungBebanAktif(teknisi[])"):
        beban = {r.id_pengguna: work_order.jumlah_aktif(db, r.id_pengguna) for r in calon_rows}

    # Teknisi yang estimasinya sudah ditolak pemilik untuk tiket ini tidak dipilih lagi.
    ditolak = set(
        db.scalars(
            select(Estimasi.id_teknisi).where(
                Estimasi.id_tiket == id_tiket, Estimasi.status == "ditolak", Estimasi.diputuskan_oleh.is_not(None)
            )
        )
    )
    calon = [
        CalonTeknisi(
            teknisi=views.teknisi_ringkas(db, r.id_pengguna).model_dump(),
            tersedia=r.tersedia,
            jarak_km=technician_matching.jarak_km(lokasi, Titik(r.lat, r.lng)),
            beban=beban[r.id_pengguna],
            dikecualikan="Estimasinya sudah kamu tolak" if r.id_pengguna in ditolak else None,
        )
        for r in calon_rows
    ]
    with tr.step("Technician Matching", "Micro", "matchTeknisi") as s:
        kandidat = technician_matching.match_teknisi(kategori, urgensi, calon)
        terpilih = next((x for x in kandidat if x["lolos"]), None)
        nama = terpilih["teknisi"]["nama"] if terpilih else "tidak ada"
        s.operasi = f"matchTeknisi({LABEL_KATEGORI[kategori]}, {urgensi}) → {nama}"
    if terpilih is None:
        raise ServiceError(
            422,
            "TEKNISI_TIDAK_ADA",
            "Tidak ada teknisi lain yang tersedia untuk kategori ini. Coba lagi nanti atau tangani sendiri."
            if ditolak
            else "Belum ada teknisi terverifikasi yang tersedia untuk kategori ini.",
        )
    with tr.step("Cost Estimation", "Micro", "estimateBiaya") as s:
        rincian, total = cost_estimation.estimasi_biaya(kategori, urgensi, k.deskripsi, terpilih["jarak_km"])
        s.operasi = f"estimateBiaya → {rupiah(total)}"

    with tr.step("Handle Maintenance Request", "Task", "simpan estimasi → menunggu persetujuan"):
        # Estimasi lama yang belum diputuskan diganti yang baru.
        _tolak_estimasi_menunggu(db, id_tiket)
        est = Estimasi(
            id_tiket=id_tiket,
            id_teknisi=terpilih["teknisi"]["id"],
            kandidat=kandidat,
            rincian=rincian,
            total=total,
            status="menunggu",
            created_at=now_utc(),
        )
        db.add(est)
        db.flush()
    pemilik = tenant_lease.get_pengguna(db, unit.id_pemilik)
    isi = (
        f"Estimasi {unit.nomor_unit}: {rupiah(total)}, teknisi {terpilih['teknisi']['nama']}. "
        "Biaya ditagihkan ke kamu bila disetujui. Buka Kosmos untuk memutuskan."
    )
    with tr.step("Notification", "Utility", "setNotifikasi(estimasi)") as s:
        n = notification.kirim(db, [_penerima(pemilik)], complaint_ticket.kode_tiket(t.id), "estimasi", lambda _p: isi)
        s.operasi = f"setNotifikasi(estimasi) × {n} (WA mock)"
    db.commit()
    return EstimasiResponse(estimasi=views.estimasi(db, est), trace=tr.as_list())  # type: ignore[arg-type]


def get_estimasi(db: Session, user: Pengguna, id_tiket: int) -> EstimasiBiaya | None:
    """Estimasi terakhir untuk tiket (null bila belum dicarikan teknisi)."""
    views.tiket_untuk(db, user, id_tiket)
    q = select(Estimasi).filter_by(id_tiket=id_tiket).order_by(Estimasi.id.desc())
    est = db.scalars(q).first()
    return views.estimasi(db, est) if est else None


def usulan_slot(urgensi: str, dari: datetime | None = None) -> list[str]:
    """Usulan jadwal kunjungan (jam WIB): urgensi tinggi dalam hitungan jam, selain itu esok hari."""
    d = (dari or now_utc()).astimezone(WIB)

    def jam_ke(tambah: int) -> datetime:
        return d.replace(minute=0, second=0, microsecond=0) + timedelta(hours=tambah)

    def hari_ke(tambah: int, jam: int) -> datetime:
        return (d + timedelta(days=tambah)).replace(hour=jam, minute=0, second=0, microsecond=0)

    if urgensi == "tinggi":
        slot = [jam_ke(2), jam_ke(4), hari_ke(1, 9)]
    else:
        slot = [hari_ke(1, 10), hari_ke(1, 15), hari_ke(2, 10)]
    return [x.astimezone(UTC).isoformat().replace("+00:00", "Z") for x in slot]


def set_persetujuan(db: Session, user: Pengguna, id_estimasi: int, disetujui: bool) -> PersetujuanResponse:
    """Set Persetujuan Biaya (non-agnostic). Disetujui -> Add Work Order + tiket diproses.
    Ditolak -> tiket tetap diklasifikasi; pemilik bisa mencari teknisi lain atau menangani sendiri.
    """
    est = db.get(Estimasi, id_estimasi)
    if est is None:
        raise ServiceError(404, "ESTIMASI_TIDAK_ADA", "Estimasi tidak ditemukan.")
    t = complaint_ticket.get_tiket(db, est.id_tiket)
    if not views.boleh_lihat_tiket(db, user, t):
        raise ServiceError(404, "ESTIMASI_TIDAK_ADA", "Estimasi tidak ditemukan.")
    if est.status != "menunggu":
        raise ServiceError(409, "SUDAH_DIPUTUSKAN", "Estimasi ini sudah diputuskan.")

    tr = Tracer()
    keputusan = "disetujui" if disetujui else "ditolak"
    with tr.step("Handle Maintenance Request", "Task", f"setPersetujuanBiaya({keputusan})"):
        est.status = keputusan
        est.diputuskan_oleh = user.nama
        est.diputuskan_at = now_utc()
        db.flush()

    if not disetujui:
        # Tiket tidak dibatalkan: kerusakannya masih ada, pemilik kembali ke tahap tinjau.
        db.commit()
        return PersetujuanResponse(
            estimasi=views.estimasi(db, est),
            tiket=views.tiket_detail(db, t),
            work_order=None,
            trace=tr.as_list(),  # type: ignore[arg-type]
        )

    with tr.step("Work Order", "Entity", "addWorkOrder") as s:
        nama_teknisi = tenant_lease.get_pengguna(db, est.id_teknisi).nama
        slot = usulan_slot(t.urgensi or "rendah")
        wo = work_order.add(db, t.id, est.id_teknisi, est.id, est.total, slot, nama_teknisi)
        s.operasi = f"addWorkOrder → {work_order.kode_wo(wo.id)}, status menunggu_jadwal"
    with tr.step("Complaint Ticket", "Entity", "setStatusTiket(diproses)"):
        complaint_ticket.set_status_tiket(db, t.id, "diproses", user.nama)
    with tr.step("Notification", "Utility", "setNotifikasi(teknisi_ditugaskan)") as s:
        s.operasi = f"setNotifikasi(teknisi_ditugaskan) × {kabari_perbaikan(db, wo, 'teknisi_ditugaskan')} (WA mock)"
    db.commit()
    return PersetujuanResponse(
        estimasi=views.estimasi(db, est),
        tiket=views.tiket_detail(db, t),
        work_order=views.work_order(db, wo),
        trace=tr.as_list(),  # type: ignore[arg-type]
    )


def putuskan_biaya_tambahan(db: Session, user: Pengguna, id_wo: int, id_tambahan: int, disetujui: bool) -> WorkOrderOut:
    """Set Persetujuan Biaya Tambahan: pemilik memutuskan biaya di luar estimasi yang diajukan teknisi."""
    wo = views.work_order_untuk(db, user, id_wo)
    tambahan = work_order.get_tambahan(db, wo.id, id_tambahan)
    if tambahan.status != "menunggu":
        raise ServiceError(409, "SUDAH_DIPUTUSKAN", "Biaya tambahan ini sudah diputuskan.")
    if wo.status in work_order.DITUTUP:
        raise ServiceError(409, "WORK_ORDER_DITUTUP", "Work order sudah ditutup.")
    work_order.putuskan_tambahan(db, wo.id, id_tambahan, disetujui)
    aktivitas = "biaya_tambahan_disetujui" if disetujui else "biaya_tambahan_ditolak"
    work_order.add_log(db, wo.id, aktivitas, user.nama, f"{rupiah(tambahan.jumlah)}: {tambahan.alasan}")
    jenis = "tambahan_disetujui" if disetujui else "tambahan_ditolak"
    kabari_perbaikan(db, wo, jenis, f"{rupiah(tambahan.jumlah)} ({tambahan.alasan})")
    db.commit()
    return views.work_order(db, wo)


def konfirmasi_jadwal(db: Session, user: Pengguna, id_wo: int, waktu: datetime) -> WorkOrderOut:
    """Penghuni memilih salah satu jadwal kunjungan yang ditawarkan (Set Jadwal Kunjungan)."""
    wo = views.work_order_untuk(db, user, id_wo)
    if wo.status != "menunggu_jadwal":
        raise ServiceError(409, "JADWAL_SUDAH_ADA", "Jadwal kunjungan sudah dikonfirmasi.")
    pilihan = next((datetime.fromisoformat(x) for x in wo.slot_jadwal if datetime.fromisoformat(x) == waktu), None)
    if pilihan is None:
        raise ServiceError(422, "SLOT_TIDAK_VALID", "Pilih salah satu jadwal yang ditawarkan.")
    work_order.set_jadwal(db, wo.id, pilihan)
    work_order.add_log(db, wo.id, "jadwal", user.nama, jadwal(pilihan))
    kabari_perbaikan(db, wo, "jadwal")
    db.commit()
    return views.work_order(db, wo)
