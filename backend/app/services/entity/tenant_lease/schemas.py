"""Skema Tenant and Lease (nama dan bentuk mengikuti contracts/openapi.yaml)."""

from datetime import date
from typing import Literal

from pydantic import BaseModel

Role = Literal["penghuni", "pemilik", "teknisi"]


class PenggunaOut(BaseModel):
    id: int
    nama: str
    role: Role


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
    pengguna: PenggunaOut
    unit: UnitRingkas
    sewa: StatusSewa
