"""Rute FastAPI dicocokkan dengan contracts/openapi.yaml (sumber kebenaran kontrak)."""

from pathlib import Path

import pytest
import yaml

from app.main import API_PREFIX, app

KONTRAK = Path(__file__).resolve().parents[3] / "contracts" / "openapi.yaml"
METHODS = {"get", "post", "put", "patch", "delete"}


def _rute_kontrak() -> set[tuple[str, str]]:
    spec = yaml.safe_load(KONTRAK.read_text(encoding="utf-8"))
    return {(m.upper(), p) for p, ops in spec["paths"].items() for m in ops if m in METHODS}


def _operasi_api():
    """Operasi di bawah /api/v1. /health dan /health/db sengaja di luar kontrak (endpoint operasional)."""
    for p, ops in app.openapi()["paths"].items():
        if p.startswith(API_PREFIX):
            for m, op in ops.items():
                if m in METHODS:
                    yield m.upper(), p.removeprefix(API_PREFIX), op


def test_tidak_ada_rute_di_luar_kontrak():
    lebih = {(m, p) for m, p, _ in _operasi_api()} - _rute_kontrak()
    assert not lebih, f"Rute backend tidak ada di openapi.yaml: {sorted(lebih)}"


@pytest.mark.xfail(reason="Endpoint diimplementasikan bertahap di fase P3-P6", strict=False)
def test_semua_rute_kontrak_terpasang():
    kurang = _rute_kontrak() - {(m, p) for m, p, _ in _operasi_api()}
    assert not kurang, f"Belum diimplementasikan ({len(kurang)}): {sorted(kurang)}"


def test_tag_swagger_mengikuti_layer():
    tags = {t for _, _, op in _operasi_api() for t in op.get("tags", [])}
    boleh = ("Task: ", "Entity: ", "Utility: ", "Auth", "Dev (demo)")
    assert all(t.startswith(boleh) for t in tags), tags
