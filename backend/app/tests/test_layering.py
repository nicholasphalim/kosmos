"""Bukti aturan layering SOA (plan §1.2) lewat pemeriksaan import antar-modul.

- Entity tidak memanggil Task, Micro, Utility, atau Entity lain.
- Utility tidak tahu domain bisnis: tidak meng-import Task maupun Entity.
- Micro tidak menyentuh database dan tidak memanggil service lain.
"""

import ast
from pathlib import Path

SERVICES = Path(__file__).resolve().parents[1] / "services"


def _imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    hasil: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            hasil.update(a.name for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            hasil.add(node.module)
    return hasil


def _file(layer: str):
    yield from (SERVICES / layer).rglob("*.py")


def test_entity_tidak_memanggil_service_lain():
    for f in _file("entity"):
        milik = f.relative_to(SERVICES / "entity").parts[0]
        for imp in _imports(f):
            assert not imp.startswith(("app.services.task", "app.services.utility", "app.services.micro")), (
                f"{f}: {imp}"
            )
            if imp.startswith("app.services.entity."):
                assert imp.split(".")[3] == milik, f"{f} meng-import Entity lain: {imp}"


def test_utility_agnostic():
    for f in _file("utility"):
        for imp in _imports(f):
            assert not imp.startswith(("app.services.task", "app.services.entity")), f"{f}: {imp}"


def test_micro_tanpa_database():
    for f in _file("micro"):
        for imp in _imports(f):
            assert not imp.startswith(("app.core.db", "sqlalchemy", "app.services")), f"{f}: {imp}"
