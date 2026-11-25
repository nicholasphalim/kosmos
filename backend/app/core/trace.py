"""Pencatat jejak service (field `trace` di response Task), setara kelas Tracer di mock frontend.

Pemakaian:
    tr = Tracer()
    with tr.step("Tenant and Lease", "Entity", "getStatusSewa(unit=7)") as s:
        sewa = tenant_lease.get_status_sewa(db, 7)
        s.operasi += f" → {sewa.status_sewa}"

Setiap langkah juga dicetak satu baris di log terminal, sebagai alat peraga saat demo.
"""

import logging
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Literal

Layer = Literal["Task", "Micro", "Entity", "Utility"]

log = logging.getLogger("kosmos.trace")


@dataclass
class Langkah:
    service: str
    layer: Layer
    operasi: str
    ok: bool = True
    ms: int = 0

    def as_dict(self) -> dict:
        return {"service": self.service, "layer": self.layer, "operasi": self.operasi, "ok": self.ok, "ms": self.ms}


class Tracer:
    def __init__(self) -> None:
        self.steps: list[Langkah] = []

    @contextmanager
    def step(self, service: str, layer: Layer, operasi: str) -> Iterator[Langkah]:
        langkah = Langkah(service, layer, operasi)
        mulai = time.perf_counter()
        try:
            yield langkah
        except Exception:
            langkah.ok = False
            langkah.operasi = f"{langkah.operasi} → gagal"
            raise
        finally:
            langkah.ms = round((time.perf_counter() - mulai) * 1000)
            self.steps.append(langkah)
            log.info(
                "[%-7s] %-28s %s (%d ms)%s", layer, service, langkah.operasi, langkah.ms, "" if langkah.ok else " GAGAL"
            )

    def as_list(self) -> list[dict]:
        return [s.as_dict() for s in self.steps]
