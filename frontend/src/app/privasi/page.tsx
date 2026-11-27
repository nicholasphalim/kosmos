import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";

export const metadata: Metadata = {
  title: "Kebijakan Privasi · Kosmos",
  description: "Data apa yang dikumpulkan Kosmos, untuk apa, dan siapa yang bisa melihatnya.",
};

const BERLAKU = "27 November 2026";
const REPO = "https://github.com/nicholasphalim/kosmos";

function Bagian({ judul, children }: { judul: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-bold">{judul}</h2>
      <div className="flex flex-col gap-3 leading-relaxed text-navy-soft">{children}</div>
    </section>
  );
}

export default function KebijakanPrivasi() {
  return (
    <div className="min-h-screen bg-lilac-50 px-5 py-10 text-navy sm:px-8 sm:py-14">
      <main className="mx-auto flex max-w-[760px] flex-col gap-8 rounded-[28px] bg-white p-6 sm:p-10">
        <Link href="/" aria-label="Kosmos, beranda" className="w-fit">
          <Logo size={40} />
        </Link>
        <header className="flex flex-col gap-2">
          <h1 className="text-[clamp(2rem,4vw,2.75rem)] leading-tight font-bold tracking-[-0.025em]">Kebijakan Privasi</h1>
          <p className="text-sm text-muted">Berlaku sejak {BERLAKU}</p>
        </header>

        <Bagian judul="Tentang Kosmos">
          <p>
            Kosmos adalah prototype platform manajemen kos yang dibuat untuk tugas mata kuliah II3120 Layanan Sistem dan Teknologi
            Informasi (Kelompok 11). Kosmos bukan layanan komersial: tidak ada uang sungguhan yang ditarik, dan pesan WhatsApp hanya
            disimulasikan di dalam aplikasi.
          </p>
        </Bagian>

        <Bagian judul="Data yang kami simpan">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-navy">Dari login Google:</strong> alamat email dan ID akun Google kamu, dipakai untuk mencocokkan
              akunmu dengan data yang didaftarkan pemilik kos. Kosmos tidak membaca kata sandi, kontak, atau data Google lainnya.
            </li>
            <li>
              <strong className="text-navy">Dari pemilik kos:</strong> nama, email, nomor WhatsApp, unit, dan periode sewa penghuni.
            </li>
            <li>
              <strong className="text-navy">Dari pemakaian aplikasi:</strong> keluhan beserta foto atau video, status tiket, jadwal
              kunjungan teknisi, foto bukti perbaikan, tagihan, dan riwayat pembayaran. Pembayaran memakai payment gateway tiruan, jadi
              Kosmos tidak pernah menerima data kartu atau rekening bank.
            </li>
          </ul>
        </Bagian>

        <Bagian judul="Untuk apa data dipakai">
          <p>
            Data hanya dipakai untuk menjalankan fitur Kosmos: memproses keluhan, menugaskan teknisi, menerbitkan tagihan, dan menyusun
            laporan kas pemilik. Data tidak dijual, tidak dipakai untuk iklan, dan tidak dibagikan ke pihak lain di luar penyedia
            infrastruktur di bawah.
          </p>
        </Bagian>

        <Bagian judul="Siapa yang bisa melihat data">
          <ul className="list-disc space-y-2 pl-5">
            <li>Penghuni hanya melihat keluhan, tiket, dan tagihan sewanya sendiri.</li>
            <li>Pemilik kos melihat data penghuni dan tiket di properti miliknya.</li>
            <li>Teknisi hanya melihat pekerjaan yang ditugaskan kepadanya.</li>
            <li>Email dan nomor WhatsApp penghuni hanya terlihat oleh pemilik kosnya.</li>
          </ul>
        </Bagian>

        <Bagian judul="Tempat data disimpan">
          <p>
            Database dan file disimpan di Supabase, server aplikasi berjalan di Railway, dan halaman web disajikan oleh Vercel. Login
            Google diproses oleh Supabase Auth.
          </p>
        </Bagian>

        <Bagian judul="Akun demo">
          <p>
            Tombol &quot;Coba demo&quot; memakai data contoh yang bisa diubah dan dikembalikan ke kondisi awal oleh siapa pun. Jangan
            memasukkan data pribadi sungguhan saat mencoba akun demo.
          </p>
        </Bagian>

        <Bagian judul="Mengubah atau menghapus data">
          <p>
            Untuk memperbaiki nama, email, atau nomor WhatsApp, hubungi pemilik kosmu. Untuk menghapus data atau bertanya soal
            kebijakan ini, hubungi tim Kosmos lewat{" "}
            <a href={`${REPO}/issues`} className="font-semibold text-violet underline underline-offset-2" target="_blank" rel="noreferrer">
              halaman issue repositori Kosmos
            </a>
            .
          </p>
        </Bagian>

        <Link href="/" className="w-fit font-semibold text-violet underline underline-offset-2">
          Kembali ke beranda
        </Link>
      </main>
    </div>
  );
}
