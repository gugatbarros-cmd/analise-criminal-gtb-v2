"""API local para importações auditáveis e indicadores provisórios."""

import os
from pathlib import Path
from urllib.parse import unquote

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from gtb.db.store import MAX_UPLOAD_BYTES, Store
from gtb.ingestion.adapters.normalize import SOURCES

APP_VERSION = "0.1.19"
PROJECT_ROOT = Path(__file__).resolve().parents[4]
DATA_DIR = Path(os.environ.get("GTB_DATA_DIR", PROJECT_ROOT / "data"))
store = Store(DATA_DIR / "gtb.duckdb")


def demo_mode() -> bool:
    return os.environ.get("GTB_DEMO_MODE") == "1"


class HealthResponse(BaseModel):
    status: str
    version: str
    mode: str


app = FastAPI(title="Análise Criminal GTB 2.0", version=APP_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Accept", "Content-Type", "X-Filename"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", version=APP_VERSION,
                          mode="demo" if demo_mode() else "local")


@app.get("/sources")
def sources() -> dict:
    return {"items": list(SOURCES)}


@app.post("/imports/{source}")
async def import_source(source: str, request: Request, scope: str = "partial") -> dict:
    if demo_mode():
        raise HTTPException(403, "Demonstração somente para consulta")
    if source not in SOURCES:
        raise HTTPException(404, "Fonte desconhecida")
    if int(request.headers.get("content-length", "0")) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Arquivo acima de 30 MB")
    content = await request.body()
    filename = unquote(request.headers.get("x-filename", ""))
    try:
        return store.import_file(source, filename, content, scope)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@app.get("/imports")
def imports() -> dict:
    return {"items": store.batches()}


@app.get("/imports/{batch_id}/divergences")
def import_divergences(batch_id: str) -> dict:
    return {"items": store.divergences(batch_id)}


@app.get("/indicators/summary")
def indicators_summary(year: int | None = None, municipality: str | None = None) -> dict:
    return store.summary(year, municipality)


@app.get("/indicators/tco/analysis")
def tco_analysis(year: int | None = None, municipality: str | None = None) -> dict:
    return store.tco_analysis(year, municipality)


@app.get("/indicators/domestic/analysis")
def domestic_analysis(year: int | None = None, municipality: str | None = None) -> dict:
    return store.domestic_analysis(year, municipality)


@app.get("/indicators/operations/{kind}/analysis")
def operational_analysis(kind: str, year: int | None = None,
                         municipality: str | None = None) -> dict:
    try:
        return store.operational_analysis(kind, year, municipality)
    except ValueError as error:
        raise HTTPException(404, str(error)) from error


@app.get("/indicators/mvi/{source}/analysis")
def mvi_analysis(source: str, year: int | None = None,
                 municipality: str | None = None) -> dict:
    try:
        return store.mvi_analysis(source, year, municipality)
    except ValueError as error:
        raise HTTPException(404, str(error)) from error


@app.get("/records/{source}")
def records(source: str, page: int = 1, size: int = 20, year: int | None = None,
            municipality: str | None = None, victim: str | None = None,
            eligible_only: bool = False, category_prefix: str | None = None,
            indicator: str | None = None) -> dict:
    try:
        return store.records(source, page, size, year, municipality, victim, eligible_only,
                             category_prefix, indicator)
    except ValueError as error:
        raise HTTPException(404, str(error)) from error


@app.get("/mvi/{source}/records/{natural_key}/versions")
def mvi_record_versions(source: str, natural_key: str) -> dict:
    try:
        versions = store.mvi_record_versions(source, natural_key)
    except ValueError as error:
        raise HTTPException(404, str(error)) from error
    if not versions:
        raise HTTPException(404, "Caso MVI não encontrado")
    return {"items": versions}


@app.get("/mvi/{source}/records/{natural_key}")
def mvi_record_detail(source: str, natural_key: str, version: int | None = None) -> dict:
    try:
        detail = store.mvi_record_detail(source, natural_key, version)
    except ValueError as error:
        raise HTTPException(404, str(error)) from error
    if detail is None:
        raise HTTPException(404, "Caso MVI não encontrado")
    return detail
