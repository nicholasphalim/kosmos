"""[Entity: Tenant and Lease] operasi publik. Service lain tidak boleh query tabelnya langsung.

Aturan bisnis sama dengan `tenantLease` di frontend/src/mocks/services.ts.
"""

import re
import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import validasi
from app.core.errors import ServiceError
from app.core.waktu import today

from .models import Pengguna, Properti, Sewa, Unit
from .schemas import Pengguna as PenggunaOut
from .schemas import (
    PenghuniBaruRequest,
    PenghuniTerdaftar,
    ProfilPenghuni,
    SewaBaruRequest,
    StatusSewa,
    UbahPenghuniRequest,
    UnitPemilik,
    UnitRingkas,
)

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


@dataclass(frozen=True)
class InfoUnit:
    id: int
    nomor_unit: str
    nama_properti: str
    id_pemilik: int
    harga_bulanan: int
    lat: float
    lng: float


def normalisasi_email(email: str) -> str:
    return email.strip().lower()


def _validasi_email(email: str) -> str:
    email = normalisasi_email(email)
    if not EMAIL_RE.match(email):
        raise ServiceError(422, "VALIDASI_GAGAL", "Format email tidak valid.")
    return email


def _aktif(s: Sewa, hari: date | None = None) -> bool:
    hari = hari or today()
    return s.tanggal_mulai <= hari <= s.tanggal_selesai


def _status(s: Sewa) -> StatusSewa:
    return StatusSewa(
        id_unit=s.id_unit,
        status_sewa="aktif" if _aktif(s) else "tidak_aktif",
        tanggal_mulai=s.tanggal_mulai,
        tanggal_selesai=s.tanggal_selesai,
    )


# ----- Pengguna (dipakai juga oleh core/security untuk autentikasi) -----


def get_pengguna(db: Session, id_pengguna: int) -> Pengguna:
    p = db.get(Pengguna, id_pengguna)
    if p is None:
        raise ServiceError(404, "PENGGUNA_TIDAK_ADA", "Pengguna tidak ditemukan.")
    return p


def to_pengguna(p: Pengguna) -> PenggunaOut:
    return PenggunaOut(id=p.id, nama=p.nama, role=p.role)  # type: ignore[arg-type]


def cari_untuk_login_google(db: Session, auth_user_id: uuid.UUID, email: str) -> Pengguna | None:
    """Pengguna untuk akun Supabase ini (plan §7.2).

    1. Sudah terhubung: cocokkan auth_user_id.
    2. Login pertama: cocokkan email yang belum terhubung, lalu simpan auth_user_id.
    Email yang sudah terhubung ke akun Supabase lain tidak dianggap cocok.
    """
    p = db.scalars(select(Pengguna).where(Pengguna.auth_user_id == auth_user_id)).first()
    if p is not None:
        return p
    p = db.scalars(
        select(Pengguna).where(Pengguna.email == normalisasi_email(email), Pengguna.auth_user_id.is_(None))
    ).first()
    if p is None:
        return None
    p.auth_user_id = auth_user_id
    db.commit()
    return p


# ----- Unit dan sewa -----


def info_unit(db: Session, id_unit: int) -> InfoUnit:
    u = db.get(Unit, id_unit)
    if u is None:
        raise ServiceError(404, "UNIT_TIDAK_ADA", "Unit tidak ditemukan.")
    p = db.get(Properti, u.id_properti)
    assert p is not None
    return InfoUnit(u.id, u.nomor_unit, p.nama, p.id_pemilik, u.harga_bulanan, p.lat, p.lng)


def unit_ringkas(db: Session, id_unit: int) -> UnitRingkas:
    i = info_unit(db, id_unit)
    return UnitRingkas(id=i.id, nomor_unit=i.nomor_unit, nama_properti=i.nama_properti)


def properti_milik(db: Session, id_pemilik: int) -> list[Properti]:
    return list(db.scalars(select(Properti).where(Properti.id_pemilik == id_pemilik).order_by(Properti.id)))


def unit_milik(db: Session, id_pemilik: int) -> list[Unit]:
    q = select(Unit).join(Properti, Properti.id == Unit.id_properti).where(Properti.id_pemilik == id_pemilik)
    return list(db.scalars(q.order_by(Unit.id)))


def _sewa_terbaru(db: Session, **filter_) -> Sewa | None:
    q = select(Sewa).filter_by(**filter_).order_by(Sewa.tanggal_mulai.desc(), Sewa.id.desc()).limit(1)
    return db.scalars(q).first()


def get_id_unit(db: Session, id_penghuni: int) -> int:
    """Get ID Unit: unit dari sewa terbaru milik penghuni."""
    sewa = _sewa_terbaru(db, id_penghuni=id_penghuni)
    if sewa is None:
        raise ServiceError(404, "UNIT_TIDAK_ADA", "Penghuni tidak memiliki unit.")
    return sewa.id_unit


def get_status_sewa(db: Session, id_unit: int, id_penghuni: int | None = None) -> StatusSewa:
    """Get Status Sewa: aktif bila hari ini (WIB) di antara mulai dan selesai.

    Dengan `id_penghuni`: sewa terbaru penghuni itu di unit tersebut. Unit bisa sudah disewa orang lain, dan sewa
    penghuni baru tidak boleh membuat sewa penghuni lama ikut dianggap aktif. Tanpa `id_penghuni`: sewa terbaru unit.
    """
    filter_ = {"id_unit": id_unit} if id_penghuni is None else {"id_unit": id_unit, "id_penghuni": id_penghuni}
    sewa = _sewa_terbaru(db, **filter_)
    if sewa is None:
        raise ServiceError(404, "SEWA_TIDAK_ADA", "Unit belum pernah disewa.")
    return _status(sewa)


def status_sewa_untuk(db: Session, user: Pengguna, id_unit: int) -> StatusSewa:
    """GET /unit/{id}/sewa: hanya pemilik unit atau penghuni yang pernah menyewa unit itu."""
    tidak_ada = ServiceError(404, "UNIT_TIDAK_ADA", "Unit tidak ditemukan.")
    if db.get(Unit, id_unit) is None:
        raise tidak_ada
    pemilik = info_unit(db, id_unit).id_pemilik == user.id
    penyewa = db.scalars(select(Sewa.id).where(Sewa.id_unit == id_unit, Sewa.id_penghuni == user.id)).first()
    if not pemilik and penyewa is None:
        raise tidak_ada
    # Penghuni (termasuk penghuni lama) hanya melihat sewanya sendiri, bukan sewa penghuni berikutnya.
    return get_status_sewa(db, id_unit, None if pemilik else user.id)


def profil(db: Session, id_penghuni: int) -> ProfilPenghuni:
    p = get_pengguna(db, id_penghuni)
    id_unit = get_id_unit(db, id_penghuni)
    sewa = get_status_sewa(db, id_unit, id_penghuni)
    return ProfilPenghuni(pengguna=to_pengguna(p), unit=unit_ringkas(db, id_unit), sewa=sewa)


def _sewa_aktif_unit(db: Session, id_unit: int) -> Sewa | None:
    hari = today()
    q = select(Sewa).where(Sewa.id_unit == id_unit, Sewa.tanggal_mulai <= hari, Sewa.tanggal_selesai >= hari)
    return db.scalars(q).first()


def get_sewa(db: Session, id_sewa: int) -> Sewa:
    sw = db.get(Sewa, id_sewa)
    if sw is None:
        raise ServiceError(404, "SEWA_TIDAK_ADA", "Sewa tidak ditemukan.")
    return sw


def get_sewa_aktif(db: Session, id_pemilik: int) -> list[Sewa]:
    """Get Sewa Aktif: sewa yang aktif hari ini (WIB) di unit-unit milik pemilik, urut unit."""
    return [sw for u in unit_milik(db, id_pemilik) if (sw := _sewa_aktif_unit(db, u.id)) is not None]


def list_unit_pemilik(db: Session, id_pemilik: int) -> list[UnitPemilik]:
    hasil = []
    for u in unit_milik(db, id_pemilik):
        sw = _sewa_aktif_unit(db, u.id)
        ringkas = unit_ringkas(db, u.id)
        hasil.append(
            UnitPemilik(
                **ringkas.model_dump(),
                harga_bulanan=u.harga_bulanan,
                penghuni=to_pengguna(get_pengguna(db, sw.id_penghuni)) if sw else None,
                sewa=_status(sw) if sw else None,
            )
        )
    return hasil


# ----- Pendaftaran penghuni oleh pemilik (pengganti sign up, plan §11b #9) -----


def _penghuni_terdaftar(db: Session, p: Pengguna, sw: Sewa) -> PenghuniTerdaftar:
    return PenghuniTerdaftar(
        pengguna=to_pengguna(p),
        email=p.email,
        no_wa=p.no_wa,
        unit=unit_ringkas(db, sw.id_unit),
        sewa=_status(sw),
        terhubung_google=p.auth_user_id is not None,
    )


def _sewa_terbaru_per_penghuni(db: Session, id_pemilik: int) -> dict[int, Sewa]:
    id_unit = [u.id for u in unit_milik(db, id_pemilik)]
    hasil: dict[int, Sewa] = {}
    for sw in db.scalars(select(Sewa).where(Sewa.id_unit.in_(id_unit))):
        lama = hasil.get(sw.id_penghuni)
        if lama is None or (sw.tanggal_mulai, sw.id) > (lama.tanggal_mulai, lama.id):
            hasil[sw.id_penghuni] = sw
    return hasil


def list_penghuni(db: Session, id_pemilik: int) -> list[PenghuniTerdaftar]:
    rows = [
        _penghuni_terdaftar(db, get_pengguna(db, i), sw) for i, sw in _sewa_terbaru_per_penghuni(db, id_pemilik).items()
    ]
    return sorted(rows, key=lambda r: r.pengguna.nama.lower())


def _pastikan_unit_milik(db: Session, id_pemilik: int, id_unit: int) -> None:
    if not any(u.id == id_unit for u in unit_milik(db, id_pemilik)):
        raise ServiceError(404, "UNIT_TIDAK_ADA", "Unit tidak ditemukan di properti Anda.")


def _beririsan(mulai: date, selesai: date):
    return (Sewa.tanggal_mulai <= selesai) & (Sewa.tanggal_selesai >= mulai)


def _pastikan_unit_kosong(db: Session, id_unit: int, mulai: date, selesai: date) -> None:
    if db.scalars(select(Sewa.id).where(Sewa.id_unit == id_unit, _beririsan(mulai, selesai))).first():
        raise ServiceError(409, "UNIT_SUDAH_DISEWA", "Periode sewa bertabrakan dengan sewa lain di unit ini.")


def _email_terpakai(db: Session, email: str) -> bool:
    return db.scalars(select(Pengguna.id).where(Pengguna.email == email)).first() is not None


def add_penghuni(db: Session, id_pemilik: int, req: PenghuniBaruRequest) -> PenghuniTerdaftar:
    nama = validasi.nama_orang(req.nama)
    no_wa = validasi.no_wa_indonesia(req.no_wa)
    email = _validasi_email(req.email)
    validasi.periode_sewa(req.tanggal_mulai, req.tanggal_selesai)
    _pastikan_unit_milik(db, id_pemilik, req.id_unit)
    if _email_terpakai(db, email):
        raise ServiceError(409, "EMAIL_SUDAH_TERDAFTAR", "Email ini sudah terdaftar.")
    _pastikan_unit_kosong(db, req.id_unit, req.tanggal_mulai, req.tanggal_selesai)

    p = Pengguna(nama=nama, role="penghuni", no_wa=no_wa, email=email)
    db.add(p)
    db.flush()
    sw = Sewa(
        id_unit=req.id_unit, id_penghuni=p.id, tanggal_mulai=req.tanggal_mulai, tanggal_selesai=req.tanggal_selesai
    )
    db.add(sw)
    db.commit()
    return _penghuni_terdaftar(db, p, sw)


def _penghuni_milik(db: Session, id_pemilik: int, id_pengguna: int) -> tuple[Pengguna, Sewa]:
    sw = _sewa_terbaru_per_penghuni(db, id_pemilik).get(id_pengguna)
    if sw is None:
        raise ServiceError(404, "PENGHUNI_TIDAK_ADA", "Penghuni tidak ditemukan di properti Anda.")
    return get_pengguna(db, id_pengguna), sw


def ubah_penghuni(db: Session, id_pemilik: int, id_pengguna: int, req: UbahPenghuniRequest) -> PenghuniTerdaftar:
    p, sw = _penghuni_milik(db, id_pemilik, id_pengguna)
    if req.nama is None and req.email is None and req.no_wa is None:
        raise ServiceError(422, "VALIDASI_GAGAL", "Tidak ada data yang diubah.")
    nama = validasi.nama_orang(req.nama) if req.nama is not None else None
    no_wa = validasi.no_wa_indonesia(req.no_wa) if req.no_wa is not None else None
    if req.email is not None:
        email = _validasi_email(req.email)
        if email != p.email:
            if p.auth_user_id is not None:
                raise ServiceError(
                    409, "SUDAH_TERHUBUNG", "Email tidak bisa diubah karena penghuni sudah login dengan akun Google."
                )
            if _email_terpakai(db, email):
                raise ServiceError(409, "EMAIL_SUDAH_TERDAFTAR", "Email ini sudah terdaftar.")
            p.email = email
    if nama is not None:
        p.nama = nama
    if no_wa is not None:
        p.no_wa = no_wa
    db.commit()
    return _penghuni_terdaftar(db, p, sw)


def add_sewa(db: Session, id_pemilik: int, id_pengguna: int, req: SewaBaruRequest) -> PenghuniTerdaftar:
    p, _ = _penghuni_milik(db, id_pemilik, id_pengguna)
    validasi.periode_sewa(req.tanggal_mulai, req.tanggal_selesai)
    _pastikan_unit_milik(db, id_pemilik, req.id_unit)
    _pastikan_unit_kosong(db, req.id_unit, req.tanggal_mulai, req.tanggal_selesai)
    bentrok = select(Sewa.id).where(Sewa.id_penghuni == id_pengguna, _beririsan(req.tanggal_mulai, req.tanggal_selesai))
    if db.scalars(bentrok).first():
        raise ServiceError(409, "SEWA_BENTROK", "Penghuni masih punya sewa lain pada periode itu.")
    sw = Sewa(
        id_unit=req.id_unit, id_penghuni=p.id, tanggal_mulai=req.tanggal_mulai, tanggal_selesai=req.tanggal_selesai
    )
    db.add(sw)
    db.commit()
    return _penghuni_terdaftar(db, p, sw)
