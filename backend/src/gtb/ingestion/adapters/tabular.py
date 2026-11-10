"""CSV/XLS/XLSX com cabeçalhos originais preservados."""

import csv
import io
from pathlib import Path

import xlrd
from openpyxl import load_workbook

from gtb.indicators.mvi_time import mvi_hour
from gtb.indicators.rules import key
from gtb.ingestion.adapters.neac_model import add_adjacent_fields, is_neac_model


def _xls_value(book: xlrd.book.Book, cell: xlrd.sheet.Cell) -> str:
    """Converte células BIFF sem transformar datas ou inteiros em valores ambíguos."""
    if cell.ctype in {xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK, xlrd.XL_CELL_ERROR}:
        return ""
    if cell.ctype == xlrd.XL_CELL_DATE:
        value = xlrd.xldate_as_datetime(cell.value, book.datemode)
        return value.isoformat(sep=" ")
    if cell.ctype == xlrd.XL_CELL_BOOLEAN:
        return "TRUE" if cell.value else "FALSE"
    if cell.ctype == xlrd.XL_CELL_NUMBER and float(cell.value).is_integer():
        return str(int(cell.value))
    return str(cell.value).strip()


def _row(names: list[str], values: list[str]) -> dict[str, str]:
    """Combina cabeçalhos repetidos sem perder a hora da primeira data CAD."""
    result: dict[str, str] = {}
    for index, (name, value) in enumerate(zip(names, values)):
        if not name and value:
            name = f'Coluna {index + 1}'
        if (name and key(name) == 'datadaocorrencia' and name in result
                and mvi_hour({name: result[name]}) is not None
                and mvi_hour({name: value}) in {None, 0}
                and mvi_hour({name: result[name]}) != 0):
            continue
        if name and (value or name not in result):
            result[name] = value
    add_adjacent_fields(names, values, result)
    return result


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
        if not reader.fieldnames or (any(field is None or not field.strip() for field in reader.fieldnames)
                                     and not is_neac_model({key(name): '' for name in reader.fieldnames if name})):
            raise ValueError("Cabeçalhos vazios ou ausentes no CSV")
        matrix = csv.reader(io.StringIO(decoded), delimiter=delimiter)
        names = [name.strip() for name in next(matrix)]
        return [_row(names, [value.strip() for value in values]) for values in matrix if any(values)]
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
                    result.append(_row(names, ['' if value is None else str(value).strip() for value in values]))
        workbook.close()
        return result
    if suffix == ".xls":
        # As exportações BIFF do CAD repetem setores OLE. Excel as abre normalmente;
        # o modo tolerante do xlrd permite lê-las sem alterar o arquivo original.
        workbook = xlrd.open_workbook(
            file_contents=content,
            on_demand=True,
            ignore_workbook_corruption=True,
        )
        result: list[dict[str, str]] = []
        try:
            for sheet in workbook.sheets():
                if not sheet.nrows:
                    continue
                names = [_xls_value(workbook, sheet.cell(0, column))
                         for column in range(sheet.ncols)]
                if not any(names):
                    continue
                for row_index in range(1, sheet.nrows):
                    values = [_xls_value(workbook, sheet.cell(row_index, column))
                              for column in range(sheet.ncols)]
                    if any(values):
                        result.append(_row(names, values))
        finally:
            workbook.release_resources()
        return result
    raise ValueError("Formato aceito: CSV, XLS ou XLSX")
