from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Iterable

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

from .schema import CANONICAL_SCHEMA


@dataclass(frozen=True)
class ExportFile:
    body: bytes
    filename: str
    media_type: str


def _columns(variations: list[dict]) -> list[tuple[str, str]]:
    fields = [(field["key"], field["label"]) for field in CANONICAL_SCHEMA["fields"]]
    fields.extend([
        ("low_stock_threshold", "Low Stock Threshold"),
        ("tags", "Tags"),
        ("media", "Product Media"),
    ])
    known = {key for key, _ in fields}
    for definition in variations:
        key = definition["key"]
        if key not in known:
            fields.insert(11, (key, definition["display_name"]))
            known.add(key)
    return fields


def _value(product: dict, key: str):
    if key in product:
        value = product[key]
    elif key in (product.get("variations") or {}):
        value = product["variations"][key]
    else:
        value = ""
    if key == "tags":
        return ", ".join(value or [])
    if key == "media":
        return " | ".join(item.get("url") or item.get("path") or "" for item in (value or []))
    if isinstance(value, bool):
        return "true" if value else "false"
    return "" if value is None else value


def _safe_csv_text(value) -> str:
    text = str(value)
    if text.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")):
        return "'" + text
    return text


def _xlsx_value(product: dict, key: str):
    value = _value(product, key)
    if key == "track_inventory":
        return str(value).lower() == "true"
    if key in {"stock_quantity", "low_stock_threshold"} and value not in (None, ""):
        return int(value)
    if key in {"cost_price", "selling_price", "weight"} and value not in (None, ""):
        try:
            decimal_value = Decimal(str(value))
        except InvalidOperation:
            return _safe_csv_text(value)
        # Excel preserves at most 15 significant digits. Retain exact text for larger values.
        if len(decimal_value.as_tuple().digits) > 15:
            return format(decimal_value, "f")
        return decimal_value
    return _safe_csv_text(value)


def export_products(products: Iterable[dict], variations: list[dict], file_format: str) -> ExportFile:
    columns = _columns(variations)
    records = list(products)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    if file_format == "csv":
        buffer = io.StringIO(newline="")
        writer = csv.writer(buffer, lineterminator="\r\n")
        writer.writerow([label for _key, label in columns])
        for product in records:
            writer.writerow([_safe_csv_text(_value(product, key)) for key, _label in columns])
        return ExportFile(buffer.getvalue().encode("utf-8-sig"), f"eos-pcm-products-{stamp}.csv", "text/csv; charset=utf-8")
    if file_format != "xlsx":
        raise ValueError("Export format must be csv or xlsx.")
    book = Workbook(write_only=False)
    sheet = book.active
    if sheet is None:
        raise RuntimeError("The XLSX workbook did not create its default worksheet.")
    sheet.title = "Products"
    headers = [label for _key, label in columns]
    sheet.append(headers)
    for cell in sheet[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="274638")
    for product in records:
        sheet.append([_xlsx_value(product, key) for key, _label in columns])
    for index, (_key, label) in enumerate(columns, start=1):
        widest = max((len(str(sheet.cell(row=row, column=index).value or "")) for row in range(1, sheet.max_row + 1)), default=len(label))
        sheet.column_dimensions[get_column_letter(index)].width = min(48, max(12, widest + 2))
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    output = io.BytesIO()
    book.save(output)
    return ExportFile(output.getvalue(), f"eos-pcm-products-{stamp}.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
