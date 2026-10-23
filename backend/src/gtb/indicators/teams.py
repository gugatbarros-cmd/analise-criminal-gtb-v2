"""Produtividade provisória das guarnições, baseada nas regras do legado."""

import hashlib
import json
import re

from gtb.indicators.rules import key, plain

FIELDS = {
    "team": ("nome da equipe recurso", "nome da equipe", "equipe recurso", "guarnicao"),
    "role": ("titular ou apoio", "vinculo", "papel da equipe"),
    "officers": ("ultima guarnicao", "composicao da guarnicao", "integrantes da guarnicao"),
    "prefix": ("prefixo",),
    "dispatch": ("dt hora que despachou o recurso para ocorrencia", "hora despachou"),
}


def team_field(row: dict[str, str], field: str) -> str:
    headers = [(key(column), str(value).strip()) for column, value in row.items()]
    for alias in FIELDS[field]:
        wanted = key(alias)
        for column, value in headers:
            if column == wanted and value:
                return value
        for column, value in headers:
            if column.startswith(wanted) and value:
                return value
    return ""


def canonical_team(value: str) -> str:
    normalized = plain(value).strip()
    compact = re.sub(r"[^a-z0-9]+", " ", normalized).strip()
    rp = re.fullmatch(r"rp 0*(\d{1,2})", compact)
    if rp:
        return f"RP {int(rp[1]):02d}"
    if re.fullmatch(r"ft(?: 0*\d{1,2})?|forca tarefa(?: 0*\d{1,2})?", compact):
        return "GERAL — FORÇA-TAREFA"
    rural = re.fullmatch(r"(?:rural|tatico rural) 0*(\d{1,2})", compact)
    if rural:
        return f"TÁTICO RURAL {int(rural[1]):02d}"
    if compact in {"patrulha maria da penha", "pmp"}:
        return "PATRULHA MARIA DA PENHA"
    if compact == "ronda comunitaria":
        return "RONDA COMUNITÁRIA"
    school = re.fullmatch(r"ronda escolar 0*(\d{1,2})", compact)
    if school:
        return f"RONDA ESCOLAR {int(school[1]):02d}"
    if compact == "pelopes 1" or compact == "pelopes 01":
        return "PELOPES 01"
    if compact in {"tatico urbano", "tatico 1", "tatico 01"}:
        return "TÁTICO URBANO"
    return value.strip().upper() if value.strip() else "NÃO INFORMADA"


def team_group(name: str) -> str:
    if name == "GERAL — FORÇA-TAREFA":
        return "extra"
    if re.fullmatch(r"RP 0[1-9]", name) or name in {
        "PATRULHA MARIA DA PENHA", "RONDA COMUNITÁRIA", "RONDA ESCOLAR 01",
        "RONDA ESCOLAR 02", "PELOPES 01", "TÁTICO RURAL 01", "TÁTICO RURAL 02",
        "TÁTICO URBANO",
    }:
        return "roster"
    return "unlisted"


def team_identity(row: dict[str, str], occurrence: str, year: int) -> str:
    name = canonical_team(team_field(row, "team"))
    if name == "NÃO INFORMADA":
        raise ValueError("Guarnição sem nome identificável")
    if occurrence:
        return f"{year}|{key(occurrence)}|{key(name)}|{key(team_field(row, 'role'))}"
    canonical = {key(column): str(value).strip() for column, value in row.items()}
    digest = hashlib.sha256(json.dumps(canonical, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    return f"{year}|team-row:{digest}"


def team_complexity(nature: str, solution: str = "") -> tuple[int, str]:
    value = plain(nature)
    if re.search(r"homicidio|feminicidio|latrocinio|estupro|sequestro|"
                 r"extorsao mediante sequestro|roubo|tentativa de homicidio", value):
        return 5, "Crítico"
    if re.search(r"violencia domestica|violencia contra a mulher|trafico de drogas|"
                 r"porte ilegal de arma|posse ilegal de arma|arma de fogo|prisao|"
                 r"cumprimento de mandado|lesao corporal", value):
        return 4, "Alto"
    if re.search(r"furto|acidente de transito|ameaca|dano|desacato|resistencia|"
                 r"tco|termo circunstanciado", value) or "elaborou tco" in plain(solution):
        return 3, "Médio"
    if re.search(r"perturbacao|abordagem|averiguacao|apoio|visita|diligencia|"
                 r"orientacao|policiamento", value):
        return 2, "Rotineiro"
    return 1, "Básico"


def team_officers(value: str) -> list[dict[str, str]]:
    expression = re.compile(
        r"(COMANDANTE DE EQUIPE|MOTORISTA DA EQUIPE|PATRULHEIRO DA EQUIPE)\s+"
        r"(.+?)\s*/\s*MATR\s*:\s*([A-Z0-9.-]+?)(?=(?:COMANDANTE DE EQUIPE|"
        r"MOTORISTA DA EQUIPE|PATRULHEIRO DA EQUIPE)|$)", re.IGNORECASE,
    )
    members = {}
    for match in expression.finditer(value):
        registration = match[3].upper()
        members[registration] = {"registration": registration, "name": match[2].strip().upper(),
                                 "role": match[1].upper().replace(" DA EQUIPE", "")}
    return list(members.values())
