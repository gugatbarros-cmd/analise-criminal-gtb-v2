"""API local para importações auditáveis e indicadores provisórios."""

import os
from datetime import date
from pathlib import Path
from urllib.parse import unquote

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from gtb.db.store import MAX_UPLOAD_BYTES, Store
from gtb.ingestion.adapters.normalize import SOURCES
from gtb.security.local_auth import AuthManager

APP_VERSION = "0.1.50"
PROJECT_ROOT = Path(__file__).resolve().parents[4]
DATA_DIR = Path(os.environ.get("GTB_DATA_DIR", PROJECT_ROOT / "data"))
store = Store(DATA_DIR / "gtb.duckdb")
auth_manager = AuthManager(DATA_DIR / "auth.sqlite3")
LOCAL_ORIGINS = {"http://127.0.0.1:5173", "http://localhost:5173"}


def demo_mode() -> bool:
    return os.environ.get("GTB_DEMO_MODE") == "1"


class HealthResponse(BaseModel):
    status: str
    version: str
    mode: str


class LoginRequest(BaseModel):
    username: str
    password: str


class CreateUserRequest(LoginRequest):
    role: str


app = FastAPI(title="Análise Criminal GTB 2.0", version=APP_VERSION)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"])
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(LOCAL_ORIGINS),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Accept", "Content-Type", "X-Filename", "Authorization"],
)


@app.middleware("http")
async def authorize(request: Request, call_next):
    origin = request.headers.get("origin")
    if origin and origin not in LOCAL_ORIGINS:
        return JSONResponse({"detail": "Origem não autorizada"}, status_code=403)
    if request.method == "OPTIONS":
        return await call_next(request)
    path = request.url.path
    if path == "/health" or (request.method == "GET" and
                             (path in {"/", "/index.html"} or path.startswith("/assets/"))):
        response = await call_next(request)
    elif demo_mode():
        if request.method != "GET" or path.startswith("/auth/"):
            return JSONResponse({"detail": "Demonstração somente para consulta"}, status_code=403)
        response = await call_next(request)
    elif path in {"/auth/login", "/auth/setup"}:
        response = await call_next(request)
    elif not auth_manager.has_users():
        return JSONResponse({"detail": "Crie a primeira conta administradora local"},
                            status_code=503)
    else:
        authorization = request.headers.get("authorization", "")
        token = authorization[7:] if authorization.startswith("Bearer ") else ""
        user = auth_manager.user_for_token(token)
        if not user:
            return JSONResponse({"detail": "Sessão inválida ou expirada"}, status_code=401)
        if path.startswith("/auth/users") and user["role"] != "admin":
            return JSONResponse({"detail": "Acesso restrito ao administrador"}, status_code=403)
        if request.method == "POST" and path.startswith("/imports/") and user["role"] == "viewer":
            return JSONResponse({"detail": "Perfil somente para consulta"}, status_code=403)
        request.state.user = user
        request.state.token = token
        response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", version=APP_VERSION,
                          mode="demo" if demo_mode() else "local" if auth_manager.has_users()
                          else "setup")


@app.post("/auth/login")
def login(body: LoginRequest) -> dict:
    result = auth_manager.authenticate(body.username, body.password)
    if not result:
        raise HTTPException(401, "Usuário ou senha inválidos")
    return result


@app.post("/auth/setup")
def setup_first_admin(body: LoginRequest) -> dict:
    if auth_manager.has_users():
        raise HTTPException(409, "A primeira conta já foi criada")
    try:
        auth_manager.create_user(body.username, body.password, "admin")
    except PermissionError as error:
        raise HTTPException(409, str(error)) from error
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    session = auth_manager.authenticate(body.username, body.password)
    if session is None:
        raise HTTPException(500, "Conta criada, mas não foi possível iniciar a sessão")
    return session


@app.get("/auth/me")
def me(request: Request) -> dict:
    return request.state.user


@app.post("/auth/logout")
def logout(request: Request) -> dict:
    auth_manager.revoke(request.state.token)
    return {"status": "ok"}


@app.get("/auth/users")
def users() -> dict:
    return {"items": auth_manager.users()}


@app.post("/auth/users")
def create_user(body: CreateUserRequest, request: Request) -> dict:
    try:
        auth_manager.create_user(body.username, body.password, body.role, request.state.user)
    except (ValueError, PermissionError) as error:
        raise HTTPException(422, str(error)) from error
    return {"status": "created", "username": body.username, "role": body.role}


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
        raise HTTPException(413, "Arquivo acima de 64 MB")
    content = await request.body()
    filename = unquote(request.headers.get("x-filename", ""))
    try:
        return store.import_file(source, filename, content, scope)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@app.post("/imports/{source}/validate")
async def validate_import(source: str, request: Request) -> dict:
    if demo_mode():
        raise HTTPException(403, "Demonstração somente para consulta")
    if source not in SOURCES:
        raise HTTPException(404, "Fonte desconhecida")
    if int(request.headers.get("content-length", "0")) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Arquivo acima de 64 MB")
    content = await request.body()
    filename = unquote(request.headers.get("x-filename", ""))
    try:
        return store.validate_file(source, filename, content)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@app.get("/imports")
def imports(page: int = Query(1, ge=1, le=1_000_000),
            size: int = Query(20, ge=1, le=100)) -> dict:
    return {"items": store.batches(size, (page - 1) * size),
            "total": store.batch_count(), "page": page, "size": size}


@app.get("/imports/{batch_id}/divergences")
def import_divergences(batch_id: str, page: int = Query(1, ge=1, le=1_000_000),
                       size: int = Query(100, ge=1, le=1000)) -> dict:
    return {"items": store.divergences(batch_id, size, (page - 1) * size),
            "total": store.audit_counts(batch_id)["divergences"],
            "page": page, "size": size}


@app.get("/imports/{batch_id}/quarantine")
def import_quarantine(batch_id: str, page: int = Query(1, ge=1, le=1_000_000),
                      size: int = Query(100, ge=1, le=1000)) -> dict:
    return {"items": store.quarantines(batch_id, size, (page - 1) * size),
            "total": store.audit_counts(batch_id)["quarantine"],
            "page": page, "size": size}


@app.get("/indicators/summary")
def indicators_summary(year: int | None = None, municipality: str | None = None) -> dict:
    return store.summary(year, municipality)


@app.get("/indicators/tco/analysis")
def tco_analysis(year: int | None = None, municipality: str | None = None) -> dict:
    return store.tco_analysis(year, municipality)


@app.get("/indicators/domestic/analysis")
def domestic_analysis(year: int | None = None, municipality: str | None = None) -> dict:
    return store.domestic_analysis(year, municipality)


@app.get("/indicators/arms/analysis")
def arms_analysis(year: int | None = None, municipality: str | None = None,
                  month: int | None = Query(None, ge=1, le=12),
                  start_date: date | None = None, end_date: date | None = None,
                  arm_type: str | None = None, situation: str | None = None) -> dict:
    try:
        return store.arms_analysis(year, municipality, month, start_date, end_date,
                                   arm_type, situation)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@app.get("/indicators/drugs/analysis")
def drugs_analysis(year: int | None = None, municipality: str | None = None,
                   month: int | None = Query(None, ge=1, le=12),
                   start_date: date | None = None, end_date: date | None = None,
                   drug_type: str | None = None) -> dict:
    try:
        return store.drugs_analysis(year, municipality, month, start_date, end_date,
                                    drug_type)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@app.get("/indicators/teams/analysis")
def teams_analysis(year: int | None = None, municipality: str | None = None,
                   month: int | None = Query(None, ge=1, le=12),
                   start_date: date | None = None, end_date: date | None = None,
                   team_name: str | None = None,
                   officer_registration: str | None = None,
                   nature_filter: str | None = None) -> dict:
    try:
        return store.teams_analysis(year, municipality, month, start_date, end_date,
                                    team_name, officer_registration, nature_filter)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


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


@app.get("/indicators/mvi/comparison")
def mvi_comparison(year: int | None = None, municipality: str | None = None) -> dict:
    return store.mvi_comparison(year, municipality)


@app.get("/records/{source}")
def records(source: str, page: int = 1, size: int = 20, year: int | None = None,
            municipality: str | None = None, victim: str | None = None,
            eligible_only: bool = False, category_prefix: str | None = None,
            indicator: str | None = None, start_date: date | None = None,
            end_date: date | None = None,
            month: int | None = Query(None, ge=1, le=12),
            arm_type: str | None = None, situation: str | None = None,
            drug_type: str | None = None, team_name: str | None = None,
            officer_registration: str | None = None,
            nature_filter: str | None = None) -> dict:
    try:
        return store.records(source, page, size, year, municipality, victim, eligible_only,
                             category_prefix, indicator, start_date, end_date,
                             month, arm_type, situation, drug_type, team_name,
                             officer_registration, nature_filter)
    except ValueError as error:
        raise HTTPException(404 if source not in SOURCES else 422, str(error)) from error


@app.get("/consolidated-records")
def consolidated_records(page: int = Query(1, ge=1, le=1_000_000),
                         size: int = Query(50, ge=1, le=100),
                         source: str | None = None, year: int | None = None,
                         municipality: str | None = None,
                         search: str | None = None) -> dict:
    try:
        return store.consolidated_records(page, size, source, year, municipality, search)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@app.get("/municipalities/overview")
def municipalities_overview(year: int | None = None) -> dict:
    return {"items": store.municipality_overview(year)}


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
