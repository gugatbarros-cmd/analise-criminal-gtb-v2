"""CSV/XLSX com cabeçalhos originais preservados."""

import csv
import io
from pathlib import Path

from openpyxl import load_workbook


def read_rows(filename: str, content: bytes) -> list[dict[str, str]]:
    suffix = Path(filename).suffix.lower()
    if suffix == ".csv":
        try:
            decoded = content.decode("utf-8-sig")
        except UnicodeDecodeError:
            decoded = content.decode("cp1252")
        sample = decoded[:4096]
        try:
            delimiter = csv.Sniffer().sniff(sample, delimiters=",;\t").delimiter
        except csv.Error:
            delimiter = ";" if sample.count(";") > sample.count(",") else ","
        reader = csv.DictReader(io.StringIO(decoded), delimiter=delimiter)
        if not reader.fieldnames or any(field is None or not field.strip() for field in reader.fieldnames):
            raise ValueError("Cabeçalhos vazios ou ausentes no CSV")
        return [{str(k).strip(): str(v or "").strip() for k, v in row.items()} for row in reader]
    if suffix == ".xlsx":
        workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        result: list[dict[str, str]] = []
        for sheet in workbook:
            iterator = sheet.iter_rows(values_only=True)
            try:
                header = next(iterator)
            except StopIteration:
                continue
            names = [str(cell or "").strip() for cell in header]
            if not any(names):
                continue
            for values in iterator:
                if any(value is not None and str(value).strip() for value in values):
                    result.append({name: str(value or "").strip() for name, value in zip(names, values)
                                   if name})
        workbook.close()
        return result
    raise ValueError("Formato aceito: CSV ou XLSX")
