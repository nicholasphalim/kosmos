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


def _rute_backend() -> set[tuple[str, str]]:
    spec = app.openapi()
    return {
        (m.upper(), p.removeprefix(API_PREFIX))
        for p, ops in spec["paths"].items()
        for m in ops
        if m in METHODS
    }


def test_tidak_ada_rute_di_luar_kontrak():
    lebih = _rute_backend() - _rute_kontrak()
    assert not lebih, f"Rute backend tidak ada di openapi.yaml: {sorted(lebih)}"


@pytest.mark.xfail(reason="Endpoint diimplementasikan bertahap di fase B1-B3", strict=False)
def test_semua_rute_kontrak_terpasang():
    kurang = _rute_kontrak() - _rute_backend()
    assert not kurang, f"Belum diimplementasikan ({len(kurang)}): {sorted(kurang)}"


def test_tag_swagger_mengikuti_layer():
    spec = app.openapi()
    tags = {t for ops in spec["paths"].values() for op in ops.values() for t in op.get("tags", [])}
    boleh = ("Task: ", "Entity: ", "Utility: ", "Auth (demo)", "Dev (demo)")
    assert all(t.startswith(boleh) for t in tags), tags
