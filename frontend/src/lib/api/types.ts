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
