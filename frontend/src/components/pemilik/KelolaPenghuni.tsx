"use client";

import { clsx } from "clsx";
import { CirclePlus, ShieldCheck, UserRound } from "@/components/icons";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Stiker } from "@/components/ui/Stiker";
import { useSewaLagi, useTambahPenghuni, useUbahPenghuni, useUnitPemilik } from "@/lib/api/hooks";
import type { PenghuniTerdaftar, UnitPemilik } from "@/lib/api/types";
import { rupiah, tanggal } from "@/lib/format";
import { GALAT_NO_WA, galatNama, galatPeriodeSewa, normalisasiNoWa } from "@/lib/validasi";

const INPUT =
  "h-11 w-full rounded-full border border-line-strong bg-white px-4 text-[15px] focus:border-violet-400 focus:shadow-[0_0_0_4px_#8a6ff029] focus:outline-none disabled:bg-lilac-50 disabled:text-muted";

/** "YYYY-MM-DD" tanggal lokal, digeser n hari. */
function isoLokal(geserHari = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + geserHari);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Field({ label, children, petunjuk }: { label: string; children: (id: string) => ReactNode; petunjuk?: string }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      {children(id)}
      {petunjuk && <span className="text-[13px] text-muted">{petunjuk}</span>}
    </div>
  );
}

/** Galat dari pemeriksaan di browser didahulukan; selain itu galat dari server. */
function PesanGalat({ error, lokal = null }: { error: Error | null; lokal?: string | null }) {
  const pesan = lokal ?? error?.message;
  if (!pesan) return null;
  return (
    <p role="alert" className="rounded-2xl bg-danger-bg px-4 py-3 text-sm font-semibold text-danger">
      {pesan}
    </p>
  );
}

/** Pemeriksaan cepat sebelum request; aturan sama dengan backend (lib/validasi.ts). */
function galatData(d: { nama?: string; noWa?: string; mulai?: string; selesai?: string }): string | null {
  if (d.nama !== undefined) {
    const g = galatNama(d.nama);
    if (g) return g;
  }
  if (d.noWa !== undefined && !normalisasiNoWa(d.noWa)) return GALAT_NO_WA;
  if (d.mulai !== undefined && d.selesai !== undefined) return galatPeriodeSewa(d.mulai, d.selesai);
  return null;
}

function labelUnit(u: UnitPemilik) {
  return `${u.nama_properti} · ${u.nomor_unit} (${rupiah(u.harga_bulanan)}/bln)${u.penghuni ? ` · terisi ${u.penghuni.nama}` : " · kosong"}`;
}

/** Pilih unit: unit kosong ditaruh di atas; unit terisi tetap bisa dipilih untuk sewa yang dimulai nanti. */
function PilihUnit({ id, value, onChange }: { id: string; value: number | ""; onChange: (v: number | "") => void }) {
  const unit = useUnitPemilik();
  const urut = [...(unit.data ?? [])].sort((a, b) => Number(a.penghuni !== null) - Number(b.penghuni !== null));
  return (
    <select
      id={id}
      required
      value={value}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}
      className={clsx(INPUT, "cursor-pointer")}
    >
      <option value="">{unit.isPending ? "Memuat unit…" : "Pilih unit"}</option>
      {urut.map((u) => (
        <option key={u.id} value={u.id}>
          {labelUnit(u)}
        </option>
      ))}
    </select>
  );
}

function PeriodeSewa({
  mulai,
  selesai,
  setMulai,
  setSelesai,
}: {
  mulai: string;
  selesai: string;
  setMulai: (v: string) => void;
  setSelesai: (v: string) => void;
}) {
  return (
    <>
      <Field label="Mulai sewa">{(id) => <input id={id} type="date" required value={mulai} onChange={(e) => setMulai(e.target.value)} className={INPUT} />}</Field>
      <Field label="Selesai sewa">
        {(id) => <input id={id} type="date" required min={mulai} value={selesai} onChange={(e) => setSelesai(e.target.value)} className={INPUT} />}
      </Field>
    </>
  );
}

/** Add Penghuni (Entity Tenant and Lease): pengganti sign up, plan §11b #9. */
export function FormTambahPenghuni({ onSelesai }: { onSelesai: (p: PenghuniTerdaftar) => void }) {
  const tambah = useTambahPenghuni();
  const [nama, setNama] = useState("");
  const [email, setEmail] = useState("");
  const [noWa, setNoWa] = useState("");
  const [idUnit, setIdUnit] = useState<number | "">("");
  const [mulai, setMulai] = useState(isoLokal());
  const [selesai, setSelesai] = useState(isoLokal(365));
  const [galatLokal, setGalatLokal] = useState<string | null>(null);

  function kirim(e: FormEvent) {
    e.preventDefault();
    if (idUnit === "") return;
    const galat = galatData({ nama, noWa, mulai, selesai });
    setGalatLokal(galat);
    if (galat) return;
    tambah.mutate(
      { nama, email, no_wa: noWa, id_unit: idUnit, tanggal_mulai: mulai, tanggal_selesai: selesai },
      { onSuccess: onSelesai },
    );
  }

  return (
    <form onSubmit={kirim} className="flex flex-col gap-4 rounded-[24px] bg-lilac-50 p-5 sm:p-6">
      <p className="text-sm text-navy-soft">
        Penghuni login dengan akun Google dari email ini. Tidak ada pendaftaran mandiri, jadi hanya email yang kamu daftarkan yang bisa masuk.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama">{(id) => <input id={id} required minLength={2} maxLength={100} value={nama} onChange={(e) => setNama(e.target.value)} className={INPUT} />}</Field>
        <Field label="Email Google">
          {(id) => (
            <input id={id} type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@gmail.com" className={INPUT} />
          )}
        </Field>
        <Field label="Nomor WhatsApp">
          {(id) => (
            <input id={id} required minLength={8} maxLength={20} inputMode="tel" value={noWa} onChange={(e) => setNoWa(e.target.value)} placeholder="0812-3456-7890" className={INPUT} />
          )}
        </Field>
        <Field label="Unit">{(id) => <PilihUnit id={id} value={idUnit} onChange={setIdUnit} />}</Field>
        <PeriodeSewa mulai={mulai} selesai={selesai} setMulai={setMulai} setSelesai={setSelesai} />
      </div>
      <PesanGalat error={tambah.error} lokal={galatLokal} />
      <Button type="submit" loading={tambah.isPending} icon={<CirclePlus className="size-4.5" aria-hidden />} className="self-start">
        Daftarkan penghuni
      </Button>
    </form>
  );
}

function FormUbah({ p, onSelesai }: { p: PenghuniTerdaftar; onSelesai: () => void }) {
  const ubah = useUbahPenghuni();
  const [nama, setNama] = useState(p.pengguna.nama);
  const [email, setEmail] = useState(p.email);
  const [noWa, setNoWa] = useState(p.no_wa);
  const [galatLokal, setGalatLokal] = useState<string | null>(null);

  function kirim(e: FormEvent) {
    e.preventDefault();
    const galat = galatData({ nama: nama !== p.pengguna.nama ? nama : undefined, noWa: noWa !== p.no_wa ? noWa : undefined });
    setGalatLokal(galat);
    if (galat) return;
    const body = {
      ...(nama !== p.pengguna.nama && { nama }),
      ...(email !== p.email && { email }),
      ...(noWa !== p.no_wa && { no_wa: noWa }),
    };
    if (Object.keys(body).length === 0) return onSelesai();
    ubah.mutate({ idPengguna: p.pengguna.id, body }, { onSuccess: onSelesai });
  }

  return (
    <form onSubmit={kirim} className="flex flex-col gap-3 rounded-[20px] bg-lilac-50 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Nama">{(id) => <input id={id} required minLength={2} value={nama} onChange={(e) => setNama(e.target.value)} className={INPUT} />}</Field>
        <Field label="Email Google" petunjuk={p.terhubung_google ? "Terkunci: penghuni sudah login dengan Google." : undefined}>
          {(id) => (
            <input id={id} type="email" required disabled={p.terhubung_google} value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
          )}
        </Field>
        <Field label="Nomor WhatsApp">{(id) => <input id={id} required minLength={8} value={noWa} onChange={(e) => setNoWa(e.target.value)} className={INPUT} />}</Field>
      </div>
      <PesanGalat error={ubah.error} lokal={galatLokal} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" loading={ubah.isPending}>
          Simpan
        </Button>
        <Button size="sm" variant="outline" onClick={onSelesai}>
          Batal
        </Button>
      </div>
    </form>
  );
}

function FormSewaLagi({ p, onSelesai }: { p: PenghuniTerdaftar; onSelesai: () => void }) {
  const sewa = useSewaLagi();
  const [idUnit, setIdUnit] = useState<number | "">(p.unit.id);
  const besok = p.sewa.status_sewa === "aktif" ? p.sewa.tanggal_selesai : isoLokal();
  const [mulai, setMulai] = useState(besok);
  const [selesai, setSelesai] = useState(isoLokal(365));
  const [galatLokal, setGalatLokal] = useState<string | null>(null);

  function kirim(e: FormEvent) {
    e.preventDefault();
    if (idUnit === "") return;
    const galat = galatData({ mulai, selesai });
    setGalatLokal(galat);
    if (galat) return;
    sewa.mutate({ idPengguna: p.pengguna.id, body: { id_unit: idUnit, tanggal_mulai: mulai, tanggal_selesai: selesai } }, { onSuccess: onSelesai });
  }

  return (
    <form onSubmit={kirim} className="flex flex-col gap-3 rounded-[20px] bg-lilac-50 p-4">
      <p className="text-[13px] text-muted">Perpanjang di unit yang sama atau pindah unit. Periode tidak boleh bertabrakan dengan sewa lain.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Unit">{(id) => <PilihUnit id={id} value={idUnit} onChange={setIdUnit} />}</Field>
        <PeriodeSewa mulai={mulai} selesai={selesai} setMulai={setMulai} setSelesai={setSelesai} />
      </div>
      <PesanGalat error={sewa.error} lokal={galatLokal} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" loading={sewa.isPending}>
          Buat sewa
        </Button>
        <Button size="sm" variant="outline" onClick={onSelesai}>
          Batal
        </Button>
      </div>
    </form>
  );
}

/** Satu baris penghuni: data kontak, sewa terbaru, status akun Google, aksi ubah / sewa lagi. */
export function PenghuniItem({ p, baru }: { p: PenghuniTerdaftar; baru?: boolean }) {
  const [mode, setMode] = useState<"lihat" | "ubah" | "sewa">("lihat");
  const aktif = p.sewa.status_sewa === "aktif";
  return (
    <li className={clsx("flex flex-col gap-3 border-t border-line-soft px-4 py-4 first:border-t-0", baru && "bg-ok-bg/40")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UserRound className="size-9 shrink-0" aria-hidden />
        <span className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5">
          <span className="font-bold">{p.pengguna.nama}</span>
          <span className="truncate text-[13px] text-muted">
            {p.email} · {p.no_wa}
          </span>
          <span className="text-[13px] text-muted">
            {p.unit.nama_properti} {p.unit.nomor_unit} · {tanggal(p.sewa.tanggal_mulai)} – {tanggal(p.sewa.tanggal_selesai)}
          </span>
        </span>
        <Stiker varian={aktif ? "aktif" : "berakhir"}>{aktif ? "Sewa aktif" : "Sewa tidak aktif"}</Stiker>
        {p.terhubung_google ? (
          <Stiker varian="netral" ikon={ShieldCheck}>
            Google terhubung
          </Stiker>
        ) : (
          <Stiker varian="review">Belum pernah login</Stiker>
        )}
        {mode === "lihat" && (
          <span className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setMode("ubah")}>
              Ubah
            </Button>
            <Button size="sm" variant="outline" onClick={() => setMode("sewa")}>
              Sewa lagi
            </Button>
          </span>
        )}
      </div>
      {mode === "ubah" && <FormUbah p={p} onSelesai={() => setMode("lihat")} />}
      {mode === "sewa" && <FormSewaLagi p={p} onSelesai={() => setMode("lihat")} />}
    </li>
  );
}
