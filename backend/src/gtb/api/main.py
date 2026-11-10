"""API local para importações auditáveis e indicadores provisórios."""

import json
import os
import subprocess
import sys
import threading
from datetime import date
from pathlib import Path
from urllib.parse import unquote

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from gtb.cad.automation import CadImportManager
from gtb.db.store import MAX_UPLOAD_BYTES, Store
from gtb.ingestion.adapters.normalize import SOURCES
from gtb.security.local_auth import AuthManager
from gtb.sync.cloud import CloudSync

APP_VERSION = "0.1.107"
PROJECT_ROOT = Path(__file__).resolve().parents[4]
DATA_DIR = Path(os.environ.get("GTB_DATA_DIR", PROJECT_ROOT / "data"))
store = Store(DATA_DIR / "gtb.duckdb")
auth_manager = AuthManager(DATA_DIR / "auth.sqlite3")
cloud_sync = CloudSync(store, DATA_DIR, APP_VERSION)
cad_import = CadImportManager(store, DATA_DIR, lambda: (cloud_sync.start(), cloud_sync.wake.set()))
update_lock = threading.Lock()
update_process: subprocess.Popen | None = None
active_data_operations = 0
update_status_file = DATA_DIR / "update-status.json"


def installed_updater_path() -> Path | None:
    if not getattr(sys, "frozen", False) or os.name != "nt":
        return None
    return Path(sys.executable).resolve().parent / "atualizar-gtb.ps1"
# A interface de desenvolvimento usa 5173; a interface embutida no executável
# usa a mesma porta 8000 da API, inclusive para login e importação.
LOCAL_ORIGINS = {"http://127.0.0.1:5173", "http://localhost:5173",
                 "http://127.0.0.1:8000", "http://localhost:8000"}


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


class UpdateUserRequest(BaseModel):
    role: str
    status: str


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


class PasswordResetRequest(BaseModel):
    password: str


class OnlineCredentials(BaseModel):
    email: str
    password: str


class CadStartRequest(BaseModel):
    cpf: str = ""
    password: str = ""
    start_date: str
    end_date: str
    sources: list[str] = ["ocorrencias"]


class CadTokenRequest(BaseModel):
    token: str


class MviCadReviewRequest(BaseModel):
    row_hash: str
    decision: str
    category: str | None = None
    evidence_note: str | None = None
    death_date: str | None = None


class MapLocationReviewRequest(BaseModel):
    row_hash: str
    latitude: float | None = None
    longitude: float | None = None


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
    global active_data_operations
    origin = request.headers.get("origin")
    if origin and origin not in LOCAL_ORIGINS:
        return JSONResponse({"detail": "Origem não autorizada"}, status_code=403)
    if request.method == "OPTIONS":
        return await call_next(request)
    path = request.url.path
    if path == "/health" or (request.method == "GET" and
                             (path in {"/", "/index.html", "/logo-10bpm-3d-ui.png"}
                              or path.startswith("/assets/"))):
        response = await call_next(request)
    elif demo_mode():
        if request.method != "GET" or path.startswith(("/auth/", "/mvi/cad/reviews", "/map/location-reviews")):
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
        if user.get("must_change_password") and path not in {"/auth/me", "/auth/password", "/auth/logout"}:
            return JSONResponse({"detail": "Troque a senha temporária antes de continuar"}, status_code=403)
        if (path.startswith(("/auth/users", "/online/", "/reports/", "/imports/checkpoints", "/mvi/cad/reviews", "/map/location-reviews", "/system/update"))
                and user["role"] != "admin"):
            return JSONResponse({"detail": "Acesso restrito ao administrador"}, status_code=403)
        if request.method == "POST" and path.startswith(("/imports/", "/cad/")) and user["role"] == "viewer":
            return JSONResponse({"detail": "Perfil somente para consulta"}, status_code=403)
        request.state.user = user
        request.state.token = token
        data_operation = request.method == "POST" and path.startswith(("/imports/", "/cad/"))
        if data_operation:
            with update_lock:
                if update_process is not None and update_process.poll() is None:
                    return JSONResponse({"detail": "Aguarde a atualização do sistema terminar."}, status_code=409)
                active_data_operations += 1
        try:
            response = await call_next(request)
        finally:
            if data_operation:
                with update_lock:
                    active_data_operations -= 1
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.get('/online/status')
def online_status() -> dict:
    cloud_sync.start()
    return cloud_sync.status()


@app.post('/online/connect')
def online_connect(credentials: OnlineCredentials) -> dict:
    try:
        cloud_sync.connect(credentials.email, credentials.password)
        return cloud_sync.status()
    except (ValueError, OSError):
        raise HTTPException(400, 'Não foi possível conectar. Confira o e-mail, a senha e a permissão de administrador ou analista da conta online.') from None


@app.post('/online/sync')
def online_sync_now() -> dict:
    if not cloud_sync.credential.exists():
        raise HTTPException(409, 'Conecte a conta online primeiro.')
    cloud_sync.start()
    cloud_sync.wake.set()
    return cloud_sync.status()


@app.post('/online/disconnect')
def online_disconnect() -> dict:
    cloud_sync.disconnect()
    return cloud_sync.status()


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", version=APP_VERSION,
                          mode="demo" if demo_mode() else "local" if auth_manager.has_users()
                          else "setup")


@app.get("/system/update/status")
def system_update_status() -> dict:
    if not update_status_file.is_file():
        return {"phase": "idle", "message": "Nenhuma atualização em andamento."}
    try:
        status = json.loads(update_status_file.read_text(encoding="utf-8-sig"))
        if status.get("phase") not in {"checking", "available", "downloading", "verifying", "installing", "complete", "failed", "ready"}:
            raise ValueError("Estado inválido")
        return {"phase": status["phase"], "message": str(status.get("message", ""))}
    except (OSError, ValueError, TypeError):
        return {"phase": "failed", "message": "Não foi possível ler o andamento da atualização."}


@app.post("/system/update")
def start_system_update() -> dict:
    global update_process
    script = installed_updater_path()
    if script is None:
        raise HTTPException(409, "A instalação automática está disponível apenas no aplicativo Windows instalado.")
    if not script.is_file():
        raise HTTPException(503, "O atualizador não foi encontrado nesta instalação.")
    with update_lock:
        if update_process is not None and update_process.poll() is None:
            return {"phase": "checking", "message": "Atualização já em andamento."}
        with cad_import.lock:
            cad_busy = cad_import.worker is not None and cad_import.worker.is_alive()
        if cad_busy or active_data_operations:
            raise HTTPException(409, "Conclua a importação e encerre a sessão do CAD antes de atualizar.")
        update_status_file.write_text(json.dumps({"phase": "checking", "message": "Verificando nova versão…"}), encoding="utf-8")
        powershell = Path(os.environ.get("WINDIR", r"C:\Windows")) / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe"
        try:
            update_process = subprocess.Popen(
                [str(powershell), "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden",
                 "-File", str(script), "-AllowRunning", "-Restart", "-StatusFile", str(update_status_file)],
                cwd=str(script.parent), stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
        except OSError:
            raise HTTPException(503, "Não foi possível iniciar o atualizador do Windows.") from None
    return {"phase": "checking", "message": "Verificando nova versão…"}


@app.get('/reports/dataset')
def reports_dataset() -> dict:
    from gtb.reports import report_dataset
    return report_dataset(store)


@app.get('/comparisons/dataset')
def comparisons_dataset() -> dict:
    from gtb.comparisons import comparison_dataset
    return comparison_dataset(store)


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
    try:
        cad_import.disconnect(request.state.user["username"])
    except ValueError:
        pass
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


@app.post("/auth/users/{username}/profile")
def update_user(username: str, body: UpdateUserRequest, request: Request) -> dict:
    try:
        auth_manager.update_user(username, body.role, body.status, request.state.user)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    return {"status": "updated"}


@app.post("/auth/users/{username}/reset")
def reset_user_password(username: str, body: PasswordResetRequest, request: Request) -> dict:
    try:
        auth_manager.reset_password(username, body.password, request.state.user)
    except (ValueError, PermissionError) as error:
        raise HTTPException(422, str(error)) from error
    return {"status": "reset", "must_change_password": True}


@app.post("/auth/password")
def change_password(body: PasswordChangeRequest, request: Request) -> dict:
    try:
        auth_manager.change_password(request.state.user["username"], body.current_password,
                                     body.new_password, request.state.token)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    return {"status": "changed"}


@app.get("/sources")
def sources() -> dict:
    return {"items": list(SOURCES)}


@app.get("/cad/status")
def cad_status(request: Request) -> dict:
    return cad_import.status(request.state.user["username"])


@app.post("/cad/start")
def cad_start(body: CadStartRequest, request: Request) -> dict:
    if demo_mode():
        raise HTTPException(403, "Demonstração somente para consulta")
    try:
        return cad_import.start(body.cpf, body.password, body.start_date, body.end_date,
                                request.state.user["username"], body.sources)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@app.post("/cad/token")
def cad_token(body: CadTokenRequest) -> dict:
    try:
        return cad_import.submit_token(body.token)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@app.post("/cad/disconnect")
def cad_disconnect(request: Request) -> dict:
    try:
        return cad_import.disconnect(request.state.user["username"])
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@app.post("/cad/cancel")
def cad_cancel(request: Request) -> dict:
    try:
        return cad_import.cancel(request.state.user["username"])
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


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
        result = store.import_file(source, filename, content, scope)
        cloud_sync.start()
        cloud_sync.wake.set()
        return result
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


@app.get("/imports/checkpoints/{source}")
def import_checkpoints(source: str) -> dict:
    try:
        return {"items": store.restore_points_for_source(source)}
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@app.post("/imports/checkpoints/{source}/{point_id}/restore")
def restore_import_checkpoint(source: str, point_id: str) -> dict:
    if demo_mode():
        raise HTTPException(403, "Demonstração somente para consulta")
    try:
        result = store.restore_source_point(source, point_id)
        cloud_sync.start()
        cloud_sync.wake.set()
        return result
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


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
def indicators_summary(year: int | None = None, municipality: str | None = None,
                       bpm_only: bool = False) -> dict:
    return store.summary(year, municipality, bpm_only)


@app.get("/indicators/tco/analysis")
def tco_analysis(year: int | None = None, municipality: str | None = None) -> dict:
    return store.tco_analysis(year, municipality)


@app.get("/indicators/crimes/analysis")
def crime_analysis(kind: str, year: int | None = None, municipality: str | None = None) -> dict:
    try:
        return store.crime_analysis(kind, year, municipality)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


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


@app.get('/mvi/cad/reviews')
def mvi_cad_reviews(page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100),
                    status: str = 'pending', focus: str = 'all') -> dict:
    try:
        return store.mvi_cad_review_cases(page, size, status, focus)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@app.post('/mvi/cad/reviews/{natural_key}')
def review_mvi_cad(natural_key: str, body: MviCadReviewRequest, request: Request) -> dict:
    try:
        result = store.review_mvi_cad(natural_key, body.row_hash, body.decision,
                                      body.category, request.state.user['username'],
                                      body.evidence_note, body.death_date)
    except ValueError as error:
        raise HTTPException(409, str(error)) from error
    cloud_sync.start()
    cloud_sync.wake.set()
    return result


@app.get('/map/location-reviews')
def map_location_reviews(page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100),
                         status: str = 'pending') -> dict:
    try:
        return store.map_location_review_cases(page, size, status)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@app.post('/map/location-reviews/{source}/{natural_key}')
def review_map_location(source: str, natural_key: str, body: MapLocationReviewRequest,
                        request: Request) -> dict:
    try:
        result = store.review_map_location(source, natural_key, body.row_hash,
                                           body.latitude, body.longitude,
                                           request.state.user['username'])
    except ValueError as error:
        raise HTTPException(409, str(error)) from error
    cloud_sync.start()
    cloud_sync.wake.set()
    return result


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
