"""MockClassifier: aturan keyword yang SAMA dengan frontend/src/lib/klasifikasi.ts.

re.ASCII dipakai agar \\b berperilaku seperti regex JavaScript.
Versi akhir diganti adapter LLM API multimodal (teks + gambar) lewat AI_PROVIDER.
"""

import re

F = re.IGNORECASE | re.ASCII

KATEGORI_RULES = [
    ("AC", re.compile(r"\b(ac|dingin|freon|remote ac)\b", F)),
    ("listrik", re.compile(r"\b(listrik|lampu|stop ?kontak|mcb|korslet|sekring|colokan)\b", F)),
    ("air", re.compile(r"\b(air|bocor|keran|kran|pipa|wc|toilet|wastafel|mampet)\b", F)),
]
URGENSI_TINGGI = re.compile(r"\b(korslet|percikan|memercik|api|banjir|gosong|asap|setrum)\b", F)
URGENSI_SEDANG = re.compile(r"\b(bocor|menetes|mati total|mampet|tidak dingin|tidak menyala|mati)\b", F)


def deteksi_kategori(teks: str) -> str | None:
    if len(teks.strip()) < 10:
        return None
    return next((k for k, pola in KATEGORI_RULES if pola.search(teks)), None)


def deteksi_urgensi(teks: str) -> str:
    if URGENSI_TINGGI.search(teks):
        return "tinggi"
    if URGENSI_SEDANG.search(teks):
        return "sedang"
    return "rendah"


def buat_judul(teks: str, maks: int = 42) -> str:
    """Judul tiket: kalimat pertama, dipotong rapi di batas kata."""
    kalimat = re.split(r"[.!?\n]", teks.strip())[0]
    if len(kalimat) <= maks:
        return kalimat
    potong = kalimat[:maks]
    return re.sub(r"[,;:]$", "", potong[: potong.rfind(" ")]) + "…"


def klasifikasi(teks: str, jumlah_gambar: int) -> dict:
    kategori = deteksi_kategori(teks)
    urgensi = deteksi_urgensi(teks)
    confidence = min(0.95, 0.78 + jumlah_gambar * 0.07) if kategori else 0.45
    if kategori:
        akhir = {
            "tinggi": " dan tanda bahaya, sehingga perlu segera ditangani.",
            "sedang": ". Tidak berbahaya, tetapi mengganggu penggunaan unit.",
            "rendah": ". Tidak mendesak.",
        }[urgensi]
        alasan = f"Deskripsi memuat kata kunci kategori {kategori}{akhir}"
    else:
        alasan = "Tidak ada kata kunci yang cocok. Pemilik perlu meninjau kategori secara manual."
    return {"kategori": kategori or "lainnya", "urgensi": urgensi, "confidence": confidence, "alasan": alasan, "judul": buat_judul(teks)}
