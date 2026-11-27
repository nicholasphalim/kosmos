"""[Task: Rent Billing] tagihan sewa bulanan: pemilik menerbitkan, penghuni membayar (plan §11b #6).

Urutan langkah dan teks `operasi` di trace mengikuti objek `rb` di frontend/src/mocks/services.ts.
"""

from sqlalchemy.orm import Session

from app import views
from app.core.errors import ServiceError
from app.core.format import label_periode, rupiah
from app.core.trace import Tracer
from app.core.waktu import now_utc
from app.services.entity.financial_ledger import service as ledger
from app.services.entity.payment import service as payment
from app.services.entity.rent_invoice import service as rent_invoice
from app.services.entity.tenant_lease import service as tenant_lease
from app.services.entity.tenant_lease.models import Pengguna
from app.services.task.kabar import kabari_sewa
from app.services.utility.payment_gateway import service as payment_gateway
from app.services.utility.payment_gateway.service import LABEL_METODE
from app.views.schemas import BayarSewaResponse, TerbitkanSewaResponse


def terbitkan(db: Session, user: Pengguna) -> TerbitkanSewaResponse:
    """Terbitkan tagihan bulan berjalan untuk semua sewa aktif yang belum ditagih (idempoten per sewa per periode)."""
    periode = rent_invoice.periode_dari()
    tr = Tracer()
    with tr.step("Rent Billing", "Task", f"terbitkanTagihanSewa({periode})"):
        pass
    # Hanya sewa yang aktif hari ini; sewa yang berakhir awal bulan tidak ditagih lagi.
    with tr.step("Tenant and Lease", "Entity", "getSewaAktif") as s:
        sewa_aktif = tenant_lease.get_sewa_aktif(db, user.id)
        s.operasi = f"getSewaAktif(pemilik={user.id}) → {len(sewa_aktif)} sewa"
    with tr.step("Rent Invoice", "Entity", "addTagihanSewa") as s:
        dibuat = [
            rent_invoice.add(db, sw.id, periode, tenant_lease.info_unit(db, sw.id_unit).harga_bulanan)
            for sw in sewa_aktif
            if not rent_invoice.ada(db, sw.id, periode)
        ]
        s.operasi = f"addTagihanSewa × {len(dibuat)}"
    with tr.step("Notification", "Utility", "setNotifikasi(invoice)") as s:
        for t in dibuat:
            kabari_sewa(db, t, "invoice")
        s.operasi = f"setNotifikasi(invoice) × {len(dibuat)} (WA mock)"
    db.commit()
    return TerbitkanSewaResponse(
        periode=periode,
        dibuat=[views.tagihan_sewa(db, t) for t in dibuat],
        trace=tr.as_list(),  # type: ignore[arg-type]
    )


def bayar(db: Session, user: Pengguna, id_tagihan: int, metode: str, simulasi_gagal: bool) -> BayarSewaResponse:
    """Penghuni membayar sewa: gateway -> status -> rekonsiliasi -> lunas -> pemasukan di laporan kas pemilik."""
    payment_gateway.validasi_metode(metode)
    kode = rent_invoice.kode_tagihan_sewa(id_tagihan)
    tr = Tracer()
    with tr.step("Rent Billing", "Task", f"bayarTagihanSewa({kode}, {metode})"):
        pass
    with tr.step("Rent Invoice", "Entity", "getTagihanSewa") as s:
        t = views.tagihan_sewa_untuk(db, user, id_tagihan)
        s.operasi = f"getTagihanSewa → {t.status}, {rupiah(t.jumlah)}"
    if t.status == "lunas":
        raise ServiceError(409, "SUDAH_LUNAS", "Tagihan sewa ini sudah lunas.")

    with tr.step("Payment", "Entity", f"setMetodePembayaran({LABEL_METODE[metode]})"):
        p = payment.set_metode(db, "sewa", t.id, metode, t.jumlah, payment_gateway.ref_baru())
    with tr.step("Payment Gateway", "Utility", "processPayment via payment gateway (mock)") as s:
        hasil = payment_gateway.proses(p.ref_gateway, metode, t.jumlah, simulasi_gagal)
        s.operasi += f" → {hasil.status}"
    with tr.step("Payment", "Entity", f"setStatusPembayaran({hasil.status})"):
        payment.set_status(db, p, hasil.status, hasil.alasan)

    if hasil.status == "gagal":
        kabari_sewa(db, t, "bayar_gagal", hasil.alasan)
        db.commit()
        return BayarSewaResponse(
            hasil="gagal",
            tagihan=views.tagihan_sewa(db, t),
            pembayaran=views.pembayaran(p),
            alasan=hasil.alasan,
            trace=tr.as_list(),  # type: ignore[arg-type]
        )

    with tr.step("Payment", "Entity", "reconcilePembayaran → cocok"):
        if not payment.reconcile(db, p, hasil.jumlah_tercatat, t.jumlah):
            raise ServiceError(409, "REKONSILIASI_GAGAL", "Jumlah transaksi tidak cocok dengan tagihan.")
    waktu = now_utc()
    with tr.step("Rent Invoice", "Entity", "setStatus(lunas)"):
        rent_invoice.set_lunas(db, t, waktu)
    with tr.step("Financial Ledger", "Entity", "addTransaksiKas(sewa)"):
        sw = tenant_lease.get_sewa(db, t.id_sewa)
        unit = tenant_lease.info_unit(db, sw.id_unit)
        ledger.add(
            db,
            unit.id_pemilik,
            waktu,
            "sewa",
            f"Sewa {unit.nomor_unit} {label_periode(t.periode)} · {user.nama}",
            t.jumlah,
            kode,
            unit.nama_properti,
        )
    with tr.step("Notification", "Utility", "setNotifikasi(lunas)") as s:
        s.operasi = f"setNotifikasi(lunas) × {kabari_sewa(db, t, 'lunas')} (WA mock)"
    db.commit()
    return BayarSewaResponse(
        hasil="berhasil",
        tagihan=views.tagihan_sewa(db, t),
        pembayaran=views.pembayaran(p),
        alasan=None,
        trace=tr.as_list(),  # type: ignore[arg-type]
    )
