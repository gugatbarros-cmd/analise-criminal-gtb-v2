"""As verificações antigas de indicadores usam um administrador sintético."""

import pytest

from gtb.api import main


class SyntheticAuth:
    def has_users(self) -> bool:
        return True

    def user_for_token(self, _token: str) -> dict:
        return {"username": "teste", "role": "admin"}


@pytest.fixture(autouse=True)
def synthetic_auth(monkeypatch):
    monkeypatch.setattr(main, "auth_manager", SyntheticAuth())
