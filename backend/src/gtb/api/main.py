"""API local inicial, sem acesso a dados operacionais."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

APP_VERSION = "0.1.1"


class HealthResponse(BaseModel):
    status: str
    version: str
    mode: str


app = FastAPI(title="Análise Criminal GTB 2.0", version=APP_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["Accept", "Content-Type"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", version=APP_VERSION, mode="local")
