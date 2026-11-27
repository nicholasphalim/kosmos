"""[Task: Complete and Settle Maintenance] orkestrator pengerjaan sampai hasil diterima pemilik.

Log servis, biaya tambahan, bukti + Evidence Verification, konfirmasi penghuni, penerimaan pemilik
(Get Biaya Final, Calculate Komisi, Add Invoice), lalu pembayaran invoice oleh pemilik (satu per satu atau
sekaligus) lewat Entity Payment, rekonsiliasi, dan pencatatan ke laporan kas.
Urutan langkah dan teks `operasi` di trace mengikuti objek `csm` di frontend/src/mocks/services.ts.
"""

from datetime import datetime

from sqlalchemy.orm import Session

from app import views
from app.core import validasi
from app.core.errors import ServiceError
from app.core.format import rupiah
from app.core.trace import Tracer
from app.core.waktu import now_utc
from app.services.entity.complaint_ticket import service as complaint_ticket
from app.services.entity.financial_ledger import service as ledger
from app.services.entity.invoice import service as invoice
from app.services.entity.invoice.models import Invoice
from app.services.entity.payment import service as payment
from app.services.entity.payment.service import LABEL_METODE
from app.services.entity.tenant_lease import service as tenant_lease
from app.services.entity.tenant_lease.models import Pengguna
from app.services.entity.work_order import service as work_order
from app.services.micro import commission_calculation, evidence_verification
from app.services.micro.evidence_verification import Foto
from app.services.task.hmr.models import Estimasi
from app.services.task.kabar import kabari_perbaikan, kabari_tagihan
from app.services.utility.media_storage import service as media_storage
from app.services.utility.media_storage.service import FileMasuk
from app.views.schemas import BayarResponse, BayarSekaligusResponse, BuktiResponse, KonfirmasiResponse
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
    if aktivitas == "catatan" and not validasi.teks_bermakna(catatan or ""):
        raise ServiceError(422, "CATATAN_KOSONG", "Tulis catatan dengan kata-kata, bukan hanya angka atau simbol.")
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
    if not 5 <= len(teks) <= 200 or not validasi.teks_bermakna(teks):
        raise ServiceError(422, "ALASAN_TIDAK_VALID", "Jelaskan alasan biaya tambahan (5 sampai 200 karakter).")
    if not 1_000 <= jumlah <= 5_000_000:
        raise ServiceError(422, "JUMLAH_TIDAK_VALID", "Biaya tambahan antara Rp 1.000 dan Rp 5.000.000.")
    if jumlah % 100:
        raise ServiceError(422, "JUMLAH_TIDAK_VALID", "Biaya tambahan harus kelipatan Rp 100.")
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


# ---------- Billing: pemilik membayar invoice ----------


def _catat_kas_perbaikan(db: Session, inv: Invoice, waktu: datetime) -> None:
    """Dua baris pengeluaran per invoice di laporan kas pemilik: bagian teknisi dan komisi Kosmos."""
    wo = work_order.get(db, inv.id_work_order)
    k = complaint_ticket.get_keluhan(db, complaint_ticket.get_tiket(db, wo.id_tiket).id_keluhan)
    unit = tenant_lease.info_unit(db, k.id_unit)
    teknisi = tenant_lease.get_pengguna(db, wo.id_teknisi).nama
    kode = invoice.kode_invoice(inv.id)
    ledger.add(
        db,
        unit.id_pemilik,
        waktu,
        "pembayaran_teknisi",
        f"Biaya perbaikan {unit.nomor_unit}, ke {teknisi}",
        -(inv.total - inv.komisi),
        kode,
        unit.nama_properti,
    )
    ledger.add(
        db,
        unit.id_pemilik,
        waktu,
        "komisi",
        f"Komisi Kosmos {inv.persen_komisi}% perbaikan {unit.nomor_unit}",
        -inv.komisi,
        kode,
        unit.nama_properti,
    )


def bayar(db: Session, user: Pengguna, id_invoice: int, metode: str, simulasi_gagal: bool) -> BayarResponse:
    """Pemilik membayar satu invoice: metode -> gateway -> status -> rekonsiliasi -> lunas -> laporan kas."""
    payment.validasi_metode(metode)
    tr = Tracer()
    with tr.step(
        "Complete and Settle Maintenance", "Task", f"bayarInvoice({invoice.kode_invoice(id_invoice)}, {metode})"
    ):
        pass
    with tr.step("Invoice", "Entity", "getInvoice") as s:
        inv = views.invoice_untuk(db, user, id_invoice)
        s.operasi = f"getInvoice → {inv.status}, {rupiah(inv.total)}"
    if inv.status == "lunas":
        raise ServiceError(409, "SUDAH_LUNAS", "Invoice ini sudah lunas.")

    with tr.step("Payment", "Entity", f"setMetodePembayaran({LABEL_METODE[metode]})"):
        p = payment.set_metode(db, "invoice", inv.id, metode, inv.total, payment.ref_baru())
    with tr.step("Payment", "Entity", "processPayment via payment gateway (mock)") as s:
        hasil = payment.process_payment(p.ref_gateway, metode, inv.total, simulasi_gagal)
        s.operasi += f" → {hasil.status}"
    with tr.step("Payment", "Entity", f"getStatusPembayaran → {payment.get_status(hasil)}"):
        pass
    with tr.step("Payment", "Entity", f"setStatusPembayaran({hasil.status})"):
        payment.set_status(db, p, hasil.status, hasil.alasan)

    if hasil.status == "gagal":
        with tr.step("Notification", "Utility", "setNotifikasi(bayar_gagal)") as s:
            n = kabari_tagihan(db, inv, "bayar_gagal", hasil.alasan)
            s.operasi = f"setNotifikasi(bayar_gagal) × {n} (WA mock)"
        db.commit()
        return BayarResponse(
            hasil="gagal",
            invoice=views.invoice(db, inv),
            pembayaran=views.pembayaran(p),
            alasan=hasil.alasan,
            trace=tr.as_list(),  # type: ignore[arg-type]
        )

    with tr.step("Payment", "Entity", "reconcilePembayaran → cocok"):
        if not payment.reconcile(db, p, hasil.jumlah_tercatat, inv.total):
            raise ServiceError(409, "REKONSILIASI_GAGAL", "Jumlah transaksi tidak cocok dengan tagihan.")
    waktu = now_utc()
    with tr.step("Invoice", "Entity", "setStatus(lunas)"):
        invoice.set_lunas(db, inv.id, waktu)
    with tr.step("Financial Ledger", "Entity", "addTransaksiKas × 2 (bagian teknisi, komisi)"):
        _catat_kas_perbaikan(db, inv, waktu)
    with tr.step("Notification", "Utility", "setNotifikasi(lunas)") as s:
        s.operasi = f"setNotifikasi(lunas) × {kabari_tagihan(db, inv, 'lunas')} (WA mock)"
    db.commit()
    return BayarResponse(
        hasil="berhasil",
        invoice=views.invoice(db, inv),
        pembayaran=views.pembayaran(p),
        alasan=None,
        trace=tr.as_list(),  # type: ignore[arg-type]
    )


MAKS_BAYAR_SEKALIGUS = 20


def bayar_sekaligus(
    db: Session, user: Pengguna, ids: list[int], metode: str, simulasi_gagal: bool
) -> BayarSekaligusResponse:
    """Beberapa invoice dalam satu transaksi gateway (satu ref, satu baris Payment per invoice).

    All-or-nothing: gagal di gateway berarti tidak ada invoice yang lunas.
    """
    payment.validasi_metode(metode)
    unik = list(dict.fromkeys(ids))
    if not 1 <= len(unik) <= MAKS_BAYAR_SEKALIGUS:
        raise ServiceError(422, "JUMLAH_INVOICE_TIDAK_VALID", f"Pilih 1 sampai {MAKS_BAYAR_SEKALIGUS} invoice.")
    tr = Tracer()
    with tr.step("Complete and Settle Maintenance", "Task", f"bayarInvoiceSekaligus({len(unik)} invoice, {metode})"):
        pass
    with tr.step("Invoice", "Entity", "getInvoice") as s:
        daftar = [views.invoice_untuk(db, user, i) for i in unik]
        total = sum(i.total for i in daftar)
        s.operasi = f"getInvoice × {len(daftar)} → {rupiah(total)}"
    lunas = next((i for i in daftar if i.status == "lunas"), None)
    if lunas:
        raise ServiceError(409, "SUDAH_LUNAS", f"{invoice.kode_invoice(lunas.id)} sudah lunas.")

    ref = payment.ref_baru()
    with tr.step("Payment", "Entity", f"setMetodePembayaran({LABEL_METODE[metode]}) × {len(daftar)}, ref {ref}"):
        rows = [payment.set_metode(db, "invoice", i.id, metode, i.total, ref) for i in daftar]
    with tr.step("Payment", "Entity", f"processPayment {rupiah(total)} via payment gateway (mock)") as s:
        hasil = payment.process_payment(ref, metode, total, simulasi_gagal)
        s.operasi += f" → {hasil.status}"
    with tr.step("Payment", "Entity", f"setStatusPembayaran({hasil.status}) × {len(rows)}"):
        for r in rows:
            payment.set_status(db, r, hasil.status, hasil.alasan)

    if hasil.status == "gagal":
        db.commit()
        return BayarSekaligusResponse(
            hasil="gagal",
            invoice=[views.invoice(db, i) for i in daftar],
            ref_gateway=ref,
            total=total,
            alasan=hasil.alasan,
            trace=tr.as_list(),  # type: ignore[arg-type]
        )

    with tr.step("Payment", "Entity", "reconcilePembayaran × n → cocok"):
        # Satu transaksi gateway: jumlahnya dicocokkan ke total, lalu tiap baris Payment ke invoicenya.
        cocok = hasil.jumlah_tercatat == total and all(
            payment.reconcile(db, r, i.total, i.total) for r, i in zip(rows, daftar, strict=True)
        )
        if not cocok:
            raise ServiceError(409, "REKONSILIASI_GAGAL", "Jumlah transaksi tidak cocok dengan tagihan.")
    waktu = now_utc()
    with tr.step("Invoice", "Entity", f"setStatus(lunas) × {len(daftar)}"):
        for i in daftar:
            invoice.set_lunas(db, i.id, waktu)
    with tr.step("Financial Ledger", "Entity", f"addTransaksiKas × {len(daftar) * 2}"):
        for i in daftar:
            _catat_kas_perbaikan(db, i, waktu)
    with tr.step("Notification", "Utility", "setNotifikasi(lunas)") as s:
        s.operasi = f"setNotifikasi(lunas) × {sum(kabari_tagihan(db, i, 'lunas') for i in daftar)} (WA mock)"
    db.commit()
    return BayarSekaligusResponse(
        hasil="berhasil",
        invoice=[views.invoice(db, i) for i in daftar],
        ref_gateway=ref,
        total=total,
        alasan=None,
        trace=tr.as_list(),  # type: ignore[arg-type]
    )
