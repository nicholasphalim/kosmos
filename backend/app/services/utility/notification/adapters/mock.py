"""MockWhatsApp: tidak mengirim apa pun, hanya melaporkan "terkirim" supaya pesan tercatat di outbox."""


def kirim(no_tujuan: str, isi: str) -> bool:
    return True
