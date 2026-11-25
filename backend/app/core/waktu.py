"""Satu sumber waktu untuk seluruh service.

- Timestamp disimpan dan dikirim dalam UTC (ISO dengan akhiran Z).
- Tanggal bisnis (status sewa) dihitung dengan zona Asia/Jakarta.
"""

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

WIB = ZoneInfo("Asia/Jakarta")


def now_utc() -> datetime:
    return datetime.now(UTC)


def today() -> date:
    return datetime.now(WIB).date()


def menit_lalu(menit: float, dari: datetime | None = None) -> datetime:
    return (dari or now_utc()) - timedelta(minutes=menit)


def tanggal_geser(hari: int, dari: date | None = None) -> date:
    return (dari or today()) + timedelta(days=hari)
