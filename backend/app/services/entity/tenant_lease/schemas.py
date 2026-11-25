"""Skema Pydantic Tenant and Lease, mengikuti contracts/openapi.yaml (nama skema sama)."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

Role = Literal["penghuni", "pemilik", "teknisi"]


class Pengguna(BaseModel):
    id: int
    nama: str
    role: Role


class PenggunaSaya(Pengguna):
    email: str


class UnitRingkas(BaseModel):
    id: int
    nomor_unit: str
    nama_properti: str


class StatusSewa(BaseModel):
    id_unit: int
    status_sewa: Literal["aktif", "tidak_aktif"]
    tanggal_mulai: date
    tanggal_selesai: date


class ProfilPenghuni(BaseModel):
    pengguna: Pengguna
    unit: UnitRingkas
    sewa: StatusSewa


class UnitPemilik(UnitRingkas):
    harga_bulanan: int
    penghuni: Pengguna | None
    sewa: StatusSewa | None


class PenghuniTerdaftar(BaseModel):
    pengguna: Pengguna
    email: str
    no_wa: str
    unit: UnitRingkas
    sewa: StatusSewa
    terhubung_google: bool


class PenghuniBaruRequest(BaseModel):
    nama: str = Field(min_length=2, max_length=100)
    email: str = Field(max_length=254)
    no_wa: str = Field(min_length=8, max_length=20)
    id_unit: int
    tanggal_mulai: date
    tanggal_selesai: date


class UbahPenghuniRequest(BaseModel):
    nama: str | None = Field(default=None, min_length=2, max_length=100)
    email: str | None = Field(default=None, max_length=254)
    no_wa: str | None = Field(default=None, min_length=8, max_length=20)


class SewaBaruRequest(BaseModel):
    id_unit: int
    tanggal_mulai: date
    tanggal_selesai: date
