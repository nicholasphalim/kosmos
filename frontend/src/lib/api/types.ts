/**
 * Alias tipe dari kontrak OpenAPI (schema.d.ts di-generate, jangan diedit).
 * Regenerate: npm run gen:api
 */
import type { components } from "./schema";

type S = components["schemas"];

export type Role = S["Role"];
export type StatusTiket = S["StatusTiket"];
export type Kategori = S["Kategori"];
export type Urgensi = S["Urgensi"];
export type Layer = S["Layer"];

export type Pengguna = S["Pengguna"];
export type AkunDemo = S["AkunDemo"];
export type LoginResponse = S["LoginResponse"];
export type UnitRingkas = S["UnitRingkas"];
export type StatusSewa = S["StatusSewa"];
export type ProfilPenghuni = S["ProfilPenghuni"];
export type Lampiran = S["Lampiran"];
export type Keluhan = S["Keluhan"];
export type TiketRingkas = S["TiketRingkas"];
export type TiketDetail = S["TiketDetail"];
export type RiwayatStatus = S["RiwayatStatus"];
export type TraceStep = S["TraceStep"];
export type KeluhanResponse = S["KeluhanResponse"];
export type UbahStatusRequest = S["UbahStatusRequest"];
export type KlasifikasiResponse = S["KlasifikasiResponse"];
export type Notifikasi = S["Notifikasi"];
export type ErrorResponse = S["ErrorResponse"];

/* Repair Verification */
export type StatusWorkOrder = S["StatusWorkOrder"];
export type RincianBiaya = S["RincianBiaya"];
export type TeknisiRingkas = S["TeknisiRingkas"];
export type KandidatTeknisi = S["KandidatTeknisi"];
export type EstimasiBiaya = S["EstimasiBiaya"];
export type EstimasiResponse = S["EstimasiResponse"];
export type PersetujuanResponse = S["PersetujuanResponse"];
export type LogServis = S["LogServis"];
export type VerifikasiBukti = S["VerifikasiBukti"];
export type WorkOrder = S["WorkOrder"];
export type LogRequest = S["LogRequest"];
export type BuktiResponse = S["BuktiResponse"];
export type KonfirmasiResponse = S["KonfirmasiResponse"];

/* Billing & Commission */
export type MetodePembayaran = S["MetodePembayaran"];
export type Pembayaran = S["Pembayaran"];
export type Invoice = S["Invoice"];
export type BayarResponse = S["BayarResponse"];
export type TransaksiKas = S["TransaksiKas"];
export type LaporanKas = S["LaporanKas"];
