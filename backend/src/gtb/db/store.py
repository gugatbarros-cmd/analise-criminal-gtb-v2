"""Importação transacional e consultas por fonte em um DuckDB local.

A implementação fica dividida por área em módulos ``store_*``; este módulo
monta a classe pública ``Store``.
"""

import threading
from pathlib import Path

from gtb.db.neac_upgrade import upgrade_neac
from gtb.db.store_analysis import StoreAnalysisMixin
from gtb.db.store_common import (  # noqa: F401 - reexportados para compatibilidade
    ADAPTER_VERSION,
    CAD_ADAPTER_VERSION,
    MAX_UPLOAD_BYTES,
    indicator_evidence,
    source_adapter_version,
)
from gtb.db.store_imports import StoreImportMixin
from gtb.db.store_records import StoreRecordsMixin
from gtb.db.store_reviews import StoreReviewMixin
from gtb.db.store_schema import StoreSchemaMixin


class Store(StoreSchemaMixin, StoreReviewMixin, StoreImportMixin, StoreAnalysisMixin,
            StoreRecordsMixin):
    def __init__(self, path: Path):
        self.path = path
        self.lock = threading.RLock()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            self._schema(db)
        self._upgrade_occurrences()
        self._upgrade_cad()
        upgrade_neac(self)
        self._compress_legacy_xls()
        self._reduce_existing_mvi_cad()
