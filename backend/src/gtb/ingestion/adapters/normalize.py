"""Mapeia colunas do legado sem misturar fontes."""

from dataclasses import dataclass

from gtb.indicators.rules import (
    cvp_class,
    death_confirmed,
    event_date,
    homicide_attempt,
    key,
    meaningful,
    mvi_class,
    victim_role,
)

SOURCES = ("mvi_cad", "mvi_neac", "ocorrencias", "armas", "drogas", "guarnicoes")

ALIASES = {
    "occurrence": ("numero da ocorrencia", "n da ocorrencia", "numero ocorrencia", "ocorrencia",
                   "cad", "bo", "numero do boletim"),
    "date": ("data da ocorrencia", "data do fato", "data do evento", "data", "dia"),
    "city": ("cidade ocorrencia", "municipio", "cidade", "municipio do fato"),
    "victim": ("nome da vitima", "nome vitima", "vitima"),
    "nic": ("n nic", "numero nic", "nic", "identificador da vitima"),
    "role": ("envolvimento", "tipo de envolvimento", "papel"),
    "death": ("obito", "obito?", "obito da vitima"),
    "dispatch": ("tipificacao no despacho", "tipicidade no despacho", "natureza no despacho"),
    "type": ("classificacao", "natureza final", "tipificacao geral", "tipicidade geral",
             "natureza geral", "natureza", "tipo de ocorrencia", "tipo",
             "tipificacao no atendimento", "tipo de crime"),
    "solution": ("solucao", "solucao da ocorrencia"),
    "age": ("idade", "idade da vitima"),
    "sex": ("sexo", "sexo da vitima"),
    "address": ("logradouro", "endereco"),
    "neighborhood": ("bairro",),
}


def pick(row: dict[str, str], field: str) -> str:
    normalized = {key(column): value for column, value in row.items() if column.strip()}
    for alias in ALIASES[field]:
        value = normalized.get(key(alias))
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


@dataclass(frozen=True)
class Record:
    natural_key: str
    event_date: str
    year: int
    municipality: str
    occurrence: str
    victim: str
    nature: str
    category: str
    eligible: bool
    reason: str


def normalize(source: str, row: dict[str, str]) -> Record:
    if source not in SOURCES:
        raise ValueError("Fonte desconhecida")
    when = event_date(pick(row, "date"))
    occurrence = pick(row, "occurrence")
    city = pick(row, "city")
    if key(city) == "tanquedarca":
        city = "Tanque d'Arca"
    victim = pick(row, "victim")
    nic = pick(row, "nic")
    nature = pick(row, "dispatch") if source == "mvi_cad" else ""
    nature = nature or pick(row, "type")
    if not when:
        raise ValueError("Data do fato inválida ou ausente")
    if not city:
        raise ValueError("Município ausente")
    if source.startswith("mvi_"):
        if not (meaningful(victim) or meaningful(nic)):
            raise ValueError("Vítima sem identidade confiável")
        identity = key(nic) or key(victim)
        if occurrence:
            natural_key = f"{when.year}|{key(occurrence)}|{identity}"
        elif source == "mvi_neac" and len(victim.split()) >= 2 and any(
            pick(row, field) for field in ("age", "sex", "address", "neighborhood")
        ):
            context = "|".join(key(pick(row, field)) for field in
                               ("age", "sex", "address", "neighborhood"))
            natural_key = f"{when.isoformat()}|{key(city)}|{key(victim)}|{context}"
        else:
            raise ValueError("Sem ocorrência e contexto estável para identificar a vítima")
        category = mvi_class(nature) or ""
        eligible = bool(category)
        reason = "" if eligible else "Natureza fora da regra MVI"
        if source == "mvi_cad":
            if not victim_role(pick(row, "role")):
                eligible, reason = False, "Envolvimento não é vítima"
            elif not death_confirmed(pick(row, "death")):
                eligible, reason = False, "Óbito da vítima não confirmado"
    else:
        if not occurrence:
            raise ValueError("Número da ocorrência ausente; revisar chave natural")
        natural_key = f"{when.year}|{key(occurrence)}"
        category = ""
        if source == "ocorrencias":
            classification = " ".join(str(value) for column, value in row.items()
                                      if value and any(term in key(column) for term in
                                      ("tipificacao", "tipicidade", "natureza", "indicadorcriminal",
                                       "tipodeocorrencia", "classificacao")))
            cvp = cvp_class(classification or nature)
            category = "CVP " + cvp if cvp else ""
            if homicide_attempt(nature, pick(row, "solution")):
                category = "Tentativa de homicídio"
        eligible, reason = True, ""
    return Record(natural_key, when.isoformat(), when.year, city, occurrence, victim,
                  nature, category, eligible, reason)
