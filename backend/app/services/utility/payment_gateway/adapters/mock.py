"""MockGateway: tidak menarik uang sungguhan. Status langsung diketahui (gateway asli memakai callback)."""

ALASAN_GAGAL = {
    "qris": "QR kedaluwarsa sebelum dibayar",
    "va_bca": "Virtual account tidak dibayar sampai batas waktu",
    "va_mandiri": "Virtual account tidak dibayar sampai batas waktu",
    "gopay": "Saldo e-wallet tidak cukup",
}


def charge(ref: str, metode: str, jumlah: int, simulasi_gagal: bool) -> tuple[str, int, str | None]:
    """(status gateway, jumlah yang tercatat di gateway, alasan gagal)."""
    if simulasi_gagal:
        return "deny", 0, ALASAN_GAGAL[metode]
    return "settlement", jumlah, None
