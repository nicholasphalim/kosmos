"""Read model: merakit DTO response dari beberapa service, setara fungsi view*() di mock frontend.

Bukan logika bisnis dan bukan layer SOA. Ada supaya Entity tidak perlu saling meng-import
hanya untuk menampilkan nama unit atau penghuni di response.
Termasuk di sini: otorisasi data (siapa boleh melihat tiket/work order mana).
"""

from sqlalchemy.orm import Session

from app.core.errors import ServiceError
from app.services.entity.complaint_ticket import service as complaint_ticket
from app.services.entity.complaint_ticket.models import Keluhan, Tiket
from app.services.entity.technician import service as technician
from app.services.entity.tenant_lease import service as tenant_lease
from app.services.entity.tenant_lease.models import Pengguna
from app.services.entity.work_order import service as work_order
from app.services.entity.work_order.models import WorkOrder
from app.services.task.hmr.models import Estimasi
from app.services.utility.media_storage import service as media_storage

from .schemas import (
    EstimasiBiaya,
    KeluhanOut,
    LogServisOut,
    RiwayatStatus,
    TeknisiRingkas,
    TiketDetail,
    TiketRingkas,
    WorkOrderOut,
)

# ---------- Otorisasi data ----------


def boleh_lihat_tiket(db: Session, user: Pengguna, t: Tiket) -> bool:
    k = complaint_ticket.get_keluhan(db, t.id_keluhan)
    if user.role == "penghuni":
        return k.id_penghuni == user.id
    if user.role == "teknisi":  # hanya tiket yang work order-nya ditugaskan kepadanya
        return any(w.id_teknisi == user.id for w in work_order.list_semua(db, t.id))
    return tenant_lease.info_unit(db, k.id_unit).id_pemilik == user.id


def tiket_untuk(db: Session, user: Pengguna, id_tiket: int) -> Tiket:
    t = complaint_ticket.get_tiket(db, id_tiket)
    if not boleh_lihat_tiket(db, user, t):
        raise ServiceError(404, "TIKET_TIDAK_ADA", "Tiket tidak ditemukan.")
    return t


def boleh_lihat_wo(db: Session, user: Pengguna, w: WorkOrder) -> bool:
    if user.role == "teknisi":
        return w.id_teknisi == user.id
    return boleh_lihat_tiket(db, user, complaint_ticket.get_tiket(db, w.id_tiket))


def wo_untuk(db: Session, user: Pengguna, id_wo: int) -> WorkOrder:
    w = work_order.get(db, id_wo)
    if not boleh_lihat_wo(db, user, w):
        raise ServiceError(404, "WORK_ORDER_TIDAK_ADA", "Work order tidak ditemukan.")
    return w


# ---------- DTO ----------


def keluhan(db: Session, k: Keluhan) -> KeluhanOut:
    return KeluhanOut(
        id=k.id, kode=complaint_ticket.kode_keluhan(k.id), id_penghuni=k.id_penghuni, id_unit=k.id_unit,
        deskripsi=k.deskripsi, status=k.status, alasan_penolakan=k.alasan_penolakan,  # type: ignore[arg-type]
        lampiran=media_storage.list_by_owner(db, "keluhan", k.id), created_at=k.created_at,
    )


def _ringkas_fields(db: Session, t: Tiket) -> dict:
    k = complaint_ticket.get_keluhan(db, t.id_keluhan)
    return dict(
        id=t.id, kode=complaint_ticket.kode_tiket(t.id), judul=t.judul, status=t.status, kategori=t.kategori,
        urgensi=t.urgensi, perlu_review=t.perlu_review, unit=tenant_lease.unit_ringkas(db, k.id_unit),
        penghuni=tenant_lease.to_pengguna(tenant_lease.get_pengguna(db, k.id_penghuni)),
        created_at=t.created_at, updated_at=t.updated_at,
    )


def tiket_ringkas(db: Session, t: Tiket) -> TiketRingkas:
    return TiketRingkas(**_ringkas_fields(db, t))


def tiket_detail(db: Session, t: Tiket) -> TiketDetail:
    return TiketDetail(
        **_ringkas_fields(db, t),
        keluhan=keluhan(db, complaint_ticket.get_keluhan(db, t.id_keluhan)),
        ai_confidence=t.ai_confidence,
        ai_alasan=t.ai_alasan,
        riwayat=[RiwayatStatus(dari=r.dari, ke=r.ke, waktu=r.waktu, oleh=r.oleh) for r in complaint_ticket.riwayat(db, t.id)],  # type: ignore[arg-type]
    )


def teknisi_ringkas(db: Session, id_pengguna: int) -> TeknisiRingkas:
    t = technician.get_row(db, id_pengguna)
    p = tenant_lease.get_pengguna(db, id_pengguna)
    return TeknisiRingkas(id=p.id, nama=p.nama, keahlian=t.keahlian, terverifikasi=t.terverifikasi, rating=t.rating, no_wa=p.no_wa)  # type: ignore[arg-type]


def estimasi(db: Session, e: Estimasi) -> EstimasiBiaya:
    return EstimasiBiaya(
        id=e.id, id_tiket=e.id_tiket, kode_tiket=complaint_ticket.kode_tiket(e.id_tiket), teknisi=teknisi_ringkas(db, e.id_teknisi),
        kandidat=e.kandidat, rincian=e.rincian, total=e.total, status=e.status,  # type: ignore[arg-type]
        diputuskan_oleh=e.diputuskan_oleh, diputuskan_at=e.diputuskan_at, created_at=e.created_at,
    )


def work_order_out(db: Session, w: WorkOrder) -> WorkOrderOut:
    t = complaint_ticket.get_tiket(db, w.id_tiket)
    k = complaint_ticket.get_keluhan(db, t.id_keluhan)
    return WorkOrderOut(
        id=w.id, kode=work_order.kode_wo(w.id), id_tiket=t.id, kode_tiket=complaint_ticket.kode_tiket(t.id), judul=t.judul,
        kategori=t.kategori, urgensi=t.urgensi, unit=tenant_lease.unit_ringkas(db, k.id_unit),  # type: ignore[arg-type]
        penghuni=tenant_lease.to_pengguna(tenant_lease.get_pengguna(db, k.id_penghuni)),
        teknisi=teknisi_ringkas(db, w.id_teknisi), status=w.status, biaya_final=w.biaya_final,  # type: ignore[arg-type]
        slot_jadwal=w.slot_jadwal, jadwal_kunjungan=w.jadwal_kunjungan,  # type: ignore[arg-type]
        log=[LogServisOut(aktivitas=l.aktivitas, catatan=l.catatan, waktu=l.waktu, oleh=l.oleh) for l in work_order.get_log(db, w.id)],
        bukti_sebelum=media_storage.get(db, w.id_bukti_sebelum), bukti_sesudah=media_storage.get(db, w.id_bukti_sesudah),
        verifikasi=w.verifikasi,  # type: ignore[arg-type]
        id_invoice=None,  # Invoice (Billing) ditambahkan di fase B3
        created_at=w.created_at, updated_at=w.updated_at,
    )
