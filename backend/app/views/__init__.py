"""Read model: merakit DTO response dari beberapa service, setara bagian toRingkas/toDetail di mock frontend.

Bukan logika bisnis dan bukan layer SOA. Ada supaya Entity tidak perlu saling meng-import
hanya untuk menampilkan nama unit atau penghuni di response.
Termasuk di sini: otorisasi data (siapa boleh melihat tiket mana).
"""

from sqlalchemy.orm import Session

from app.core.errors import ServiceError
from app.services.entity.complaint_ticket import service as complaint_ticket
from app.services.entity.complaint_ticket.models import Keluhan as KeluhanRow
from app.services.entity.complaint_ticket.models import Tiket
from app.services.entity.invoice import service as invoice_svc
from app.services.entity.invoice.models import Invoice as InvoiceRow
from app.services.entity.technician import service as technician
from app.services.entity.tenant_lease import service as tenant_lease
from app.services.entity.tenant_lease.models import Pengguna
from app.services.entity.work_order import service as work_order_svc
from app.services.entity.work_order.models import WorkOrder as WorkOrderRow
from app.services.task.hmr.models import Estimasi as EstimasiRow
from app.services.utility.media_storage import service as media_storage

from .schemas import (
    BiayaTambahan,
    EstimasiBiaya,
    Invoice,
    Keluhan,
    LogServis,
    RiwayatStatus,
    TeknisiRingkas,
    TiketDetail,
    TiketRingkas,
    WorkOrder,
)

# ---------- Otorisasi data ----------


def boleh_lihat_keluhan(db: Session, user: Pengguna, k: KeluhanRow) -> bool:
    if user.role == "penghuni":
        return k.id_penghuni == user.id
    if user.role == "pemilik":
        return tenant_lease.info_unit(db, k.id_unit).id_pemilik == user.id
    return False


def boleh_lihat_tiket(db: Session, user: Pengguna, t: Tiket) -> bool:
    # Teknisi hanya melihat tiket yang work order-nya ditugaskan kepadanya.
    if user.role == "teknisi":
        return work_order_svc.ada_untuk_teknisi(db, t.id, user.id)
    return boleh_lihat_keluhan(db, user, complaint_ticket.get_keluhan(db, t.id_keluhan))


def tiket_untuk(db: Session, user: Pengguna, id_tiket: int) -> Tiket:
    t = complaint_ticket.get_tiket(db, id_tiket)
    if not boleh_lihat_tiket(db, user, t):
        raise ServiceError(404, "TIKET_TIDAK_ADA", "Tiket tidak ditemukan.")
    return t


def boleh_lihat_work_order(db: Session, user: Pengguna, w: WorkOrderRow) -> bool:
    if user.role == "teknisi":
        return w.id_teknisi == user.id
    return boleh_lihat_tiket(db, user, complaint_ticket.get_tiket(db, w.id_tiket))


def work_order_untuk(db: Session, user: Pengguna, id_wo: int) -> WorkOrderRow:
    """Get Work Order dengan otorisasi data (404 bila bukan miliknya)."""
    w = work_order_svc.get(db, id_wo)
    if not boleh_lihat_work_order(db, user, w):
        raise ServiceError(404, "WORK_ORDER_TIDAK_ADA", "Work order tidak ditemukan.")
    return w


def boleh_lihat_invoice(db: Session, user: Pengguna, i: InvoiceRow) -> bool:
    """Invoice perbaikan ditagihkan ke pemilik properti; penghuni dan teknisi tidak melihatnya."""
    if user.role != "pemilik":
        return False
    return boleh_lihat_work_order(db, user, work_order_svc.get(db, i.id_work_order))


def invoice_untuk(db: Session, user: Pengguna, id_invoice: int) -> InvoiceRow:
    i = invoice_svc.get(db, id_invoice)
    if not boleh_lihat_invoice(db, user, i):
        raise ServiceError(404, "INVOICE_TIDAK_ADA", "Invoice tidak ditemukan.")
    return i


def keluhan_untuk(db: Session, user: Pengguna, id_keluhan: int) -> KeluhanRow:
    k = complaint_ticket.get_keluhan(db, id_keluhan)
    if not boleh_lihat_keluhan(db, user, k):
        raise ServiceError(404, "KELUHAN_TIDAK_ADA", "Keluhan tidak ditemukan.")
    return k


# ---------- DTO ----------


def keluhan(db: Session, k: KeluhanRow) -> Keluhan:
    return Keluhan(
        id=k.id,
        kode=complaint_ticket.kode_keluhan(k.id),
        id_penghuni=k.id_penghuni,
        id_unit=k.id_unit,
        deskripsi=k.deskripsi,
        status=k.status,  # type: ignore[arg-type]
        alasan_penolakan=k.alasan_penolakan,
        lampiran=media_storage.list_by_owner(db, "keluhan", k.id),
        created_at=k.created_at,
    )


def _ringkas_fields(db: Session, t: Tiket) -> dict:
    k = complaint_ticket.get_keluhan(db, t.id_keluhan)
    return dict(
        id=t.id,
        kode=complaint_ticket.kode_tiket(t.id),
        judul=t.judul,
        status=t.status,
        kategori=t.kategori,
        urgensi=t.urgensi,
        perlu_review=t.perlu_review,
        penanganan=t.penanganan,
        unit=tenant_lease.unit_ringkas(db, k.id_unit),
        penghuni=tenant_lease.to_pengguna(tenant_lease.get_pengguna(db, k.id_penghuni)),
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


def tiket_ringkas(db: Session, t: Tiket) -> TiketRingkas:
    return TiketRingkas(**_ringkas_fields(db, t))


def tiket_detail(db: Session, t: Tiket) -> TiketDetail:
    return TiketDetail(
        **_ringkas_fields(db, t),
        keluhan=keluhan(db, complaint_ticket.get_keluhan(db, t.id_keluhan)),
        ai_confidence=t.ai_confidence,
        ai_alasan=t.ai_alasan,
        catatan_penanganan=t.catatan_penanganan,
        bisa_dibuka_ulang=complaint_ticket.bisa_dibuka_ulang(db, t),
        riwayat=[
            RiwayatStatus(dari=r.dari, ke=r.ke, waktu=r.waktu, oleh=r.oleh, catatan=r.catatan)  # type: ignore[arg-type]
            for r in complaint_ticket.riwayat(db, t.id)
        ],
    )


# ---------- DTO Repair Verification dan Billing ----------


def teknisi_ringkas(db: Session, id_pengguna: int) -> TeknisiRingkas:
    t = technician.get_row(db, id_pengguna)
    p = tenant_lease.get_pengguna(db, id_pengguna)
    return TeknisiRingkas(
        id=p.id, nama=p.nama, keahlian=t.keahlian, terverifikasi=t.terverifikasi, rating=t.rating, no_wa=p.no_wa
    )


def estimasi(db: Session, e: EstimasiRow) -> EstimasiBiaya:
    return EstimasiBiaya(
        id=e.id,
        id_tiket=e.id_tiket,
        kode_tiket=complaint_ticket.kode_tiket(e.id_tiket),
        teknisi=teknisi_ringkas(db, e.id_teknisi),
        kandidat=e.kandidat,  # type: ignore[arg-type]
        rincian=e.rincian,  # type: ignore[arg-type]
        total=e.total,
        status=e.status,  # type: ignore[arg-type]
        diputuskan_oleh=e.diputuskan_oleh,
        diputuskan_at=e.diputuskan_at,
        created_at=e.created_at,
    )


def work_order(db: Session, w: WorkOrderRow) -> WorkOrder:
    t = complaint_ticket.get_tiket(db, w.id_tiket)
    k = complaint_ticket.get_keluhan(db, t.id_keluhan)
    inv = invoice_svc.by_work_order(db, w.id)
    return WorkOrder(
        id=w.id,
        kode=work_order_svc.kode_wo(w.id),
        id_tiket=t.id,
        kode_tiket=complaint_ticket.kode_tiket(t.id),
        judul=t.judul,
        kategori=t.kategori,  # type: ignore[arg-type]
        urgensi=t.urgensi,  # type: ignore[arg-type]
        unit=tenant_lease.unit_ringkas(db, k.id_unit),
        penghuni=tenant_lease.to_pengguna(tenant_lease.get_pengguna(db, k.id_penghuni)),
        teknisi=teknisi_ringkas(db, w.id_teknisi),
        status=w.status,  # type: ignore[arg-type]
        biaya_final=w.biaya_final,
        biaya_tambahan=[
            BiayaTambahan.model_validate(b, from_attributes=True) for b in work_order_svc.list_tambahan(db, w.id)
        ],
        slot_jadwal=w.slot_jadwal,  # type: ignore[arg-type]
        jadwal_kunjungan=w.jadwal_kunjungan,
        log=[LogServis.model_validate(lg, from_attributes=True) for lg in work_order_svc.get_log(db, w.id)],
        bukti_sebelum=media_storage.get(db, w.id_bukti_sebelum),
        bukti_sesudah=media_storage.get(db, w.id_bukti_sesudah),
        verifikasi=w.verifikasi,  # type: ignore[arg-type]
        id_invoice=inv.id if inv else None,
        created_at=w.created_at,
        updated_at=w.updated_at,
    )


def invoice(db: Session, i: InvoiceRow) -> Invoice:
    w = work_order_svc.get(db, i.id_work_order)
    t = complaint_ticket.get_tiket(db, w.id_tiket)
    k = complaint_ticket.get_keluhan(db, t.id_keluhan)
    unit = tenant_lease.info_unit(db, k.id_unit)
    return Invoice(
        id=i.id,
        kode=invoice_svc.kode_invoice(i.id),
        id_work_order=w.id,
        id_tiket=t.id,
        kode_tiket=complaint_ticket.kode_tiket(t.id),
        judul=t.judul,
        unit=tenant_lease.unit_ringkas(db, k.id_unit),
        penghuni=tenant_lease.to_pengguna(tenant_lease.get_pengguna(db, k.id_penghuni)),
        pemilik=tenant_lease.to_pengguna(tenant_lease.get_pengguna(db, unit.id_pemilik)),
        teknisi=tenant_lease.get_pengguna(db, w.id_teknisi).nama,
        rincian=i.rincian,  # type: ignore[arg-type]
        biaya=i.biaya,
        persen_komisi=i.persen_komisi,
        komisi=i.komisi,
        total=i.total,
        status=i.status,  # type: ignore[arg-type]
        terlambat=invoice_svc.terlambat(i),
        jenis=i.jenis,  # type: ignore[arg-type]
        jatuh_tempo=i.jatuh_tempo,
        dibayar_at=i.dibayar_at,
        pembayaran=[],  # riwayat percobaan pembayaran (Entity Payment) ditambahkan di fase P6
        created_at=i.created_at,
    )
