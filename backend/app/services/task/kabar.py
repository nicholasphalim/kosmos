"""Pesan WhatsApp Repair Verification dan tagihan, dipakai Task HMR dan Complete and Settle Maintenance.

Teks sama dengan kabariPerbaikan dan kabariTagihan di frontend/src/mocks/services.ts.
Bukan service tersendiri: hanya merakit isi pesan dari beberapa Entity lalu memanggil Utility Notification.
"""

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.format import jadwal, rupiah, tanggal
from app.services.entity.complaint_ticket import service as complaint_ticket
from app.services.entity.complaint_ticket.models import Tiket
from app.services.entity.invoice.models import Invoice
from app.services.entity.invoice.service import kode_invoice
from app.services.entity.tenant_lease import service as tenant_lease
from app.services.entity.tenant_lease.models import Pengguna
from app.services.entity.work_order import service as work_order
from app.services.entity.work_order.models import WorkOrder
from app.services.utility.notification import service as notification
from app.services.utility.notification.service import Penerima

# Jenis kabar perbaikan -> jenis notifikasi WhatsApp di kontrak.
NOTIF_PERBAIKAN = {
    "teknisi_ditugaskan": "teknisi_ditugaskan",
    "jadwal": "jadwal",
    "progres": "progres",
    "bukti_valid": "bukti_valid",
    "bukti_ditolak": "bukti_ditolak",
    "selesai": "selesai",
    "menunggu_pemilik": "progres",
    "perbaikan_ulang": "progres",
    "tambahan_diajukan": "estimasi",
    "tambahan_disetujui": "progres",
    "tambahan_ditolak": "progres",
}


@dataclass(frozen=True)
class PihakTiket:
    tiket: Tiket
    penghuni: Pengguna
    pemilik: Pengguna
    unit: str
    lokasi: str  # "Kos Kenanga B-201"


def pihak_tiket(db: Session, t: Tiket) -> PihakTiket:
    k = complaint_ticket.get_keluhan(db, t.id_keluhan)
    unit = tenant_lease.info_unit(db, k.id_unit)
    return PihakTiket(
        tiket=t,
        penghuni=tenant_lease.get_pengguna(db, k.id_penghuni),
        pemilik=tenant_lease.get_pengguna(db, unit.id_pemilik),
        unit=unit.nomor_unit,
        lokasi=f"{unit.nama_properti} {unit.nomor_unit}",
    )


def _kirim(db: Session, kode: str, jenis: str, daftar: list[tuple[Pengguna, str]]) -> int:
    for p, teks in daftar:
        notification.kirim(db, [Penerima(id=p.id, no_wa=p.no_wa)], kode, jenis, lambda _p, teks=teks: teks)
    return len(daftar)


def kabari_perbaikan(db: Session, wo: WorkOrder, jenis: str, isi: str | None = None) -> int:
    """Kabar perbaikan ke pihak yang relevan. Mengembalikan jumlah pesan."""
    t = complaint_ticket.get_tiket(db, wo.id_tiket)
    p = pihak_tiket(db, t)
    penghuni, pemilik, unit = p.penghuni, p.pemilik, p.unit
    teknisi = tenant_lease.get_pengguna(db, wo.id_teknisi)
    kode_wo = work_order.kode_wo(wo.id)
    jam = jadwal(wo.jadwal_kunjungan) if wo.jadwal_kunjungan else ""
    gagal = ", ".join(c["label"].lower() for c in (wo.verifikasi or {}).get("pemeriksaan", []) if not c["ok"])

    if jenis == "teknisi_ditugaskan":
        daftar = [
            (pemilik, f"Estimasi disetujui. {teknisi.nama} ditugaskan ke {unit}."),
            (
                penghuni,
                f'Teknisi {teknisi.nama} ditugaskan untuk "{t.judul}". Biaya ditanggung pemilik. '
                "Pilih jadwal kunjungan di Kosmos.",
            ),
            (teknisi, f"Pekerjaan baru {kode_wo}: {t.judul}, {p.lokasi}."),
        ]
    elif jenis == "jadwal":
        daftar = [
            (teknisi, f"Jadwal {kode_wo} dikonfirmasi: {jam}. {p.lokasi} ({penghuni.nama})."),
            (pemilik, f"Jadwal kunjungan {unit}: {jam}, teknisi {teknisi.nama}."),
        ]
    elif jenis == "progres":
        # Progres dari teknisi dikabarkan ke penghuni; keberatan penghuni dikabarkan ke teknisi.
        if (isi or "").startswith("Penghuni"):
            daftar = [(teknisi, f"{kode_wo}: {isi}"), (pemilik, f"{unit}: {isi}")]
        else:
            daftar = [(penghuni, isi or ""), (pemilik, f"{unit}: {isi or ''}")]
    elif jenis == "bukti_valid":
        daftar = [
            (penghuni, f'Perbaikan "{t.judul}" selesai dan bukti terverifikasi. Mohon konfirmasi di Kosmos.'),
            (pemilik, f"Bukti perbaikan {unit} terverifikasi, menunggu konfirmasi penghuni."),
        ]
    elif jenis == "bukti_ditolak":
        daftar = [(teknisi, f"Bukti {kode_wo} ditolak: {gagal}. Silakan unggah ulang.")]
    elif jenis == "menunggu_pemilik":
        daftar = [
            (
                pemilik,
                f"{penghuni.nama} mengonfirmasi perbaikan {unit} beres. "
                "Cek hasilnya lalu terima untuk menerbitkan tagihan.",
            ),
            (teknisi, f"{kode_wo} dikonfirmasi penghuni, menunggu pemilik menerima hasil."),
        ]
    elif jenis == "perbaikan_ulang":
        daftar = [
            (teknisi, f"Pemilik meminta {kode_wo} diperbaiki ulang{f': {isi}' if isi else '.'}"),
            (penghuni, f'Pemilik meminta teknisi memperbaiki ulang "{t.judul}".'),
        ]
    elif jenis == "selesai":
        daftar = [
            (penghuni, f'Perbaikan "{t.judul}" sudah diterima pemilik. Tiket ditutup.'),
            (teknisi, f"{kode_wo} diterima pemilik. Terima kasih!"),
        ]
    elif jenis == "tambahan_diajukan":
        daftar = [(pemilik, f"{teknisi.nama} mengajukan biaya tambahan {unit}: {isi}. Setujui atau tolak di Kosmos.")]
    elif jenis == "tambahan_disetujui":
        daftar = [(teknisi, f"Biaya tambahan {kode_wo} disetujui pemilik: {isi}.")]
    elif jenis == "tambahan_ditolak":
        daftar = [(teknisi, f"Biaya tambahan {kode_wo} ditolak pemilik: {isi}. Lanjutkan sesuai estimasi.")]
    else:
        raise ValueError(f"Jenis kabar perbaikan tidak dikenal: {jenis}")
    return _kirim(db, complaint_ticket.kode_tiket(t.id), NOTIF_PERBAIKAN[jenis], daftar)


def kabari_tagihan(db: Session, inv: Invoice, jenis: str, alasan: str | None = None) -> int:
    """Kabar invoice ke pemilik (dan teknisi saat lunas). jenis: invoice | lunas | bayar_gagal."""
    wo = work_order.get(db, inv.id_work_order)
    t = complaint_ticket.get_tiket(db, wo.id_tiket)
    p = pihak_tiket(db, t)
    teknisi = tenant_lease.get_pengguna(db, wo.id_teknisi)
    kode = kode_invoice(inv.id)
    apa = "biaya kunjungan (perbaikan dibatalkan)" if inv.jenis == "kunjungan" else "perbaikan"
    daftar = {
        "invoice": [
            (
                p.pemilik,
                f"Tagihan {apa} {p.unit} ({p.penghuni.nama}) {kode} {rupiah(inv.total)} sudah terbit. "
                f"Jatuh tempo {tanggal(inv.jatuh_tempo)}.",
            )
        ],
        "lunas": [
            (p.pemilik, f"Pembayaran {kode} {rupiah(inv.total)} berhasil dan sudah tercatat di laporan kas."),
            (teknisi, f"Pembayaran {work_order.kode_wo(wo.id)} {rupiah(inv.total - inv.komisi)} diteruskan ke kamu."),
        ],
        "bayar_gagal": [(p.pemilik, f"Pembayaran {kode} gagal: {alasan}. Silakan coba lagi.")],
    }[jenis]
    return _kirim(db, complaint_ticket.kode_tiket(t.id), jenis, daftar)
