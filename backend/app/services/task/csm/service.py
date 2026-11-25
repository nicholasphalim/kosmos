"""[Task: Complete and Settle Maintenance] orkestrator pengerjaan sampai hasil diterima pemilik.

Log servis, biaya tambahan, bukti + Evidence Verification, konfirmasi penghuni, penerimaan pemilik
(Get Biaya Final, Calculate Komisi, Add Invoice). Pembayaran invoice ditambahkan di fase P6.
Urutan langkah dan teks `operasi` di trace mengikuti objek `csm` di frontend/src/mocks/services.ts.
"""

from sqlalchemy.orm import Session

from app import views
from app.core.errors import ServiceError
from app.core.format import rupiah
from app.core.trace import Tracer
from app.services.entity.complaint_ticket import service as complaint_ticket
from app.services.entity.invoice import service as invoice
from app.services.entity.tenant_lease.models import Pengguna
from app.services.entity.work_order import service as work_order
from app.services.micro import commission_calculation, evidence_verification
from app.services.micro.evidence_verification import Foto
from app.services.task.hmr.models import Estimasi
from app.services.task.kabar import kabari_perbaikan, kabari_tagihan
from app.services.utility.media_storage import service as media_storage
from app.services.utility.media_storage.service import FileMasuk
from app.views.schemas import BuktiResponse, KonfirmasiResponse
from app.views.schemas import WorkOrder as WorkOrderOut


def _catatan(teks: str | None) -> str | None:
    return (teks or "").strip()[:300] or None


def catat_log(db: Session, user: Pengguna, id_wo: int, aktivitas: str, catatan: str | None) -> WorkOrderOut:
    """Teknisi mencatat log servis (Add Log Servis). "tiba" memindahkan work order ke dikerjakan."""
    wo = views.work_order_untuk(db, user, id_wo)
    if aktivitas == "tiba" and wo.status != "dijadwalkan":
        pesan = (
            "Penghuni belum mengonfirmasi jadwal." if wo.status == "menunggu_jadwal" else "Kedatangan sudah tercatat."
        )
        raise ServiceError(409, "BELUM_DIJADWALKAN", pesan)
    if aktivitas == "mulai" and (wo.status != "dikerjakan" or work_order.sudah_ada_log(db, wo.id, "mulai")):
        raise ServiceError(409, "TIDAK_BISA_MULAI", "Catat kedatangan dulu sebelum mulai memperbaiki.")
    if aktivitas == "catatan" and not _catatan(catatan):
        raise ServiceError(422, "CATATAN_KOSONG", "Catatan tidak boleh kosong.")
    if aktivitas == "catatan" and wo.status in work_order.DITUTUP:
        raise ServiceError(409, "WORK_ORDER_DITUTUP", "Work order sudah ditutup.")

    if aktivitas == "tiba":
        work_order.set_status(db, wo.id, "dikerjakan")
    work_order.add_log(db, wo.id, aktivitas, user.nama, _catatan(catatan))
    if aktivitas != "catatan":
        isi = f"{user.nama} sudah tiba di lokasi." if aktivitas == "tiba" else f"{user.nama} mulai memperbaiki."
        kabari_perbaikan(db, wo, "progres", isi)
    db.commit()
    return views.work_order(db, wo)


def ajukan_biaya_tambahan(db: Session, user: Pengguna, id_wo: int, alasan: str, jumlah: int) -> WorkOrderOut:
    """Teknisi mengajukan biaya di luar estimasi. Pemilik memutuskan lewat Task HMR."""
    wo = views.work_order_untuk(db, user, id_wo)
    teks = alasan.strip()
    if not 5 <= len(teks) <= 200:
        raise ServiceError(422, "ALASAN_TIDAK_VALID", "Jelaskan alasan biaya tambahan (5 sampai 200 karakter).")
    if not 1_000 <= jumlah <= 5_000_000:
        raise ServiceError(422, "JUMLAH_TIDAK_VALID", "Biaya tambahan antara Rp 1.000 dan Rp 5.000.000.")
    if wo.status != "dikerjakan":
        raise ServiceError(409, "TIDAK_SEDANG_DIKERJAKAN", "Biaya tambahan diajukan saat perbaikan sedang dikerjakan.")
    if work_order.ada_tambahan_menunggu(db, wo.id):
        raise ServiceError(409, "MASIH_MENUNGGU", "Masih ada biaya tambahan yang menunggu keputusan pemilik.")
    work_order.add_tambahan(db, wo.id, teks, jumlah)
    work_order.add_log(db, wo.id, "biaya_tambahan", user.nama, f"{rupiah(jumlah)}: {teks}")
    kabari_perbaikan(db, wo, "tambahan_diajukan", f"{rupiah(jumlah)} ({teks})")
    db.commit()
    return views.work_order(db, wo)


def unggah_bukti(
    db: Session, user: Pengguna, id_wo: int, sebelum: FileMasuk | None, sesudah: FileMasuk | None
) -> BuktiResponse:
    """Teknisi mengunggah bukti -> Media Storage -> Evidence Verification -> status work order."""
    wo = views.work_order_untuk(db, user, id_wo)
    if wo.status != "dikerjakan":
        raise ServiceError(409, "TIDAK_SEDANG_DIKERJAKAN", "Bukti diunggah saat work order sedang dikerjakan.")
    for f in (sebelum, sesudah):
        if f:
            media_storage.validasi([f])

    tr = Tracer()
    with tr.step("Complete and Settle Maintenance", "Task", f"unggahBukti({work_order.kode_wo(wo.id)})"):
        pass
    with tr.step("Media Storage", "Utility", "addLampiranMedia") as s:
        disimpan = [
            media_storage.simpan(db, f, owner_type="bukti", owner_id=wo.id) if f else None for f in (sebelum, sesudah)
        ]
        s.operasi = f"addLampiranMedia({sum(x is not None for x in disimpan)} file) → url"
    l_sebelum, l_sesudah = disimpan

    def foto(lp) -> Foto | None:
        return Foto(lp.nama_file, lp.mime, lp.ukuran_byte) if lp else None

    with tr.step("Evidence Verification", "Micro", "verifyBuktiPerbaikan") as s:
        hasil = evidence_verification.verifikasi_bukti(foto(l_sebelum), foto(l_sesudah))
        s.operasi = f"verifyBuktiPerbaikan → {'valid' if hasil['valid'] else 'ditolak'}, skor {hasil['skor']:.2f}"

    langkah = (
        "setBukti + setStatus(menunggu_konfirmasi)" if hasil["valid"] else "setBukti + addLogServis(bukti_ditolak)"
    )
    with tr.step("Work Order", "Entity", langkah):
        work_order.set_bukti(db, wo.id, l_sebelum.id if l_sebelum else None, l_sesudah.id if l_sesudah else None, hasil)
        n = len(hasil["pemeriksaan"])
        if hasil["valid"]:
            work_order.set_status(db, wo.id, "menunggu_konfirmasi")
            work_order.add_log(db, wo.id, "bukti_valid", "Evidence Verification", f"{n} dari {n} pemeriksaan lolos")
        else:
            gagal = ", ".join(p["label"].lower() for p in hasil["pemeriksaan"] if not p["ok"])
            work_order.add_log(db, wo.id, "bukti_ditolak", "Evidence Verification", f"Tidak lolos: {gagal}")
    jenis = "bukti_valid" if hasil["valid"] else "bukti_ditolak"
    with tr.step("Notification", "Utility", f"setNotifikasi({jenis})") as s:
        s.operasi = f"setNotifikasi({jenis}) × {kabari_perbaikan(db, wo, jenis)} (WA mock)"
    db.commit()
    return BuktiResponse(
        work_order=views.work_order(db, wo),
        verifikasi=hasil,  # type: ignore[arg-type]
        trace=tr.as_list(),  # type: ignore[arg-type]
    )


def konfirmasi(db: Session, user: Pengguna, id_wo: int, selesai: bool, catatan: str | None) -> KonfirmasiResponse:
    """Set Konfirmasi Selesai (non-agnostic) oleh penghuni.

    Sudah beres: work order menunggu pemilik menerima hasil (invoice belum terbit). Belum beres: kembali dikerjakan.
    """
    wo = views.work_order_untuk(db, user, id_wo)
    if wo.status != "menunggu_konfirmasi":
        raise ServiceError(409, "BELUM_BISA_DIKONFIRMASI", "Perbaikan bisa dikonfirmasi setelah bukti terverifikasi.")
    t = complaint_ticket.get_tiket(db, wo.id_tiket)
    teks = _catatan(catatan)
    tr = Tracer()
    with tr.step(
        "Complete and Settle Maintenance", "Task", f"setKonfirmasiSelesai({'selesai' if selesai else 'belum beres'})"
    ):
        pass

    if not selesai:
        with tr.step("Work Order", "Entity", "setStatus(dikerjakan) + addLogServis(belum_beres)"):
            work_order.set_status(db, wo.id, "dikerjakan")
            work_order.add_log(db, wo.id, "belum_beres", user.nama, teks)
        isi = f"Penghuni menandai belum beres{f': {teks}' if teks else '.'}"
        with tr.step("Notification", "Utility", "setNotifikasi(progres)") as s:
            s.operasi = f"setNotifikasi(progres) × {kabari_perbaikan(db, wo, 'progres', isi)} (WA mock)"
    else:
        with tr.step("Work Order", "Entity", "setStatus(menunggu_pemilik) + addLogServis(dikonfirmasi_penghuni)"):
            work_order.set_status(db, wo.id, "menunggu_pemilik")
            work_order.add_log(db, wo.id, "dikonfirmasi_penghuni", user.nama, teks)
        with tr.step("Notification", "Utility", "setNotifikasi(menunggu_pemilik)") as s:
            s.operasi = f"setNotifikasi(menunggu_pemilik) × {kabari_perbaikan(db, wo, 'menunggu_pemilik')} (WA mock)"
    db.commit()
    return KonfirmasiResponse(
        work_order=views.work_order(db, wo),
        tiket=views.tiket_detail(db, t),
        invoice=None,
        trace=tr.as_list(),  # type: ignore[arg-type]
    )


def terima(db: Session, user: Pengguna, id_wo: int, diterima: bool, catatan: str | None) -> KonfirmasiResponse:
    """Set Penerimaan Pemilik (non-agnostic).

    Diterima: tutup tiket, Get Biaya Final, Calculate Komisi, Add Invoice ke pemilik. Bisa langsung dari
    menunggu_konfirmasi bila penghuni belum merespons. Tidak diterima: teknisi diminta memperbaiki ulang.
    """
    wo = views.work_order_untuk(db, user, id_wo)
    if wo.status not in ("menunggu_pemilik", "menunggu_konfirmasi"):
        raise ServiceError(409, "BELUM_BISA_DITERIMA", "Hasil perbaikan bisa diterima setelah bukti terverifikasi.")
    if work_order.ada_tambahan_menunggu(db, wo.id):
        raise ServiceError(409, "TAMBAHAN_MENUNGGU", "Putuskan dulu biaya tambahan yang diajukan teknisi.")
    t = complaint_ticket.get_tiket(db, wo.id_tiket)
    tanpa_penghuni = wo.status == "menunggu_konfirmasi"
    alasan = _catatan(catatan)
    tr = Tracer()
    keputusan = "diterima" if diterima else "perbaikan ulang"
    with tr.step("Complete and Settle Maintenance", "Task", f"setPenerimaanPemilik({keputusan})"):
        pass

    if not diterima:
        with tr.step("Work Order", "Entity", "setStatus(dikerjakan) + addLogServis(perbaikan_ulang)"):
            work_order.set_status(db, wo.id, "dikerjakan")
            work_order.add_log(db, wo.id, "perbaikan_ulang", user.nama, alasan)
        with tr.step("Notification", "Utility", "setNotifikasi(progres)") as s:
            s.operasi = f"setNotifikasi(progres) × {kabari_perbaikan(db, wo, 'perbaikan_ulang', alasan)} (WA mock)"
        db.commit()
        return KonfirmasiResponse(
            work_order=views.work_order(db, wo),
            tiket=views.tiket_detail(db, t),
            invoice=None,
            trace=tr.as_list(),  # type: ignore[arg-type]
        )

    with tr.step("Work Order", "Entity", "setStatus(selesai)"):
        work_order.set_status(db, wo.id, "selesai")
        keterangan = (
            "Pemilik menerima hasil tanpa menunggu konfirmasi penghuni"
            if tanpa_penghuni
            else alasan or "Pemilik menerima hasil perbaikan"
        )
        work_order.add_log(db, wo.id, "selesai", user.nama, keterangan)
    with tr.step("Complaint Ticket", "Entity", "setStatusTiket(selesai) + setPenanganan(teknisi)"):
        complaint_ticket.set_status_tiket(db, t.id, "selesai", user.nama, alasan)
        complaint_ticket.set_penanganan(db, t.id, "teknisi")
    with tr.step("Work Order", "Entity", "getBiayaFinal") as s:
        biaya = work_order.get_biaya_final(db, wo.id)
        s.operasi = f"getBiayaFinal → {rupiah(biaya)}"
    with tr.step("Commission Calculation", "Micro", "calculateKomisi") as s:
        persen, komisi = commission_calculation.hitung_komisi(biaya)
        s.operasi = f"calculateKomisi({persen}%) → {rupiah(komisi)}"
    with tr.step("Invoice", "Entity", "addInvoice") as s:
        est = db.get(Estimasi, wo.id_estimasi)
        rincian = list(est.rincian) if est else [{"label": "Biaya perbaikan", "jumlah": biaya}]
        rincian += [
            {"label": f"Tambahan: {b.alasan}", "jumlah": b.jumlah}
            for b in work_order.list_tambahan(db, wo.id)
            if b.status == "disetujui"
        ]
        inv = invoice.add(db, wo.id, "perbaikan", rincian, biaya, persen, komisi)
        s.operasi = f"addInvoice → {invoice.kode_invoice(inv.id)}"
    with tr.step("Notification", "Utility", "setNotifikasi(selesai, invoice)") as s:
        n = kabari_perbaikan(db, wo, "selesai") + kabari_tagihan(db, inv, "invoice")
        s.operasi = f"setNotifikasi(selesai, invoice) × {n} (WA mock)"
    db.commit()
    return KonfirmasiResponse(
        work_order=views.work_order(db, wo),
        tiket=views.tiket_detail(db, t),
        invoice=views.invoice(db, inv),
        trace=tr.as_list(),  # type: ignore[arg-type]
    )
