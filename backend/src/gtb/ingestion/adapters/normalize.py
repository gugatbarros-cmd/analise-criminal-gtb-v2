"""Mapeia colunas do legado sem misturar fontes."""

from dataclasses import dataclass

from gtb.indicators.rules import (
    cvp_class,
    death_confirmed,
    elaborated_tco,
    event_date,
    homicide_attempt,
    key,
    meaningful,
    mvi_class,
    mvi_instrument,
    operational_action,
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
    "solution": ("solucao da ocorrencia", "solucao ocorrencia", "solucao",
                 "desfecho", "providencia"),
    "tco_solution": ("solucao da ocorrencia", "solucao ocorrencia", "solucao"),
    "age": ("idade", "idade da vitima"),
    "sex": ("sexo", "sexo da vitima"),
    "address": ("logradouro", "endereco"),
    "neighborhood": ("bairro",),
    "instrument": ("instrumento empregado", "instrumento utilizado", "meio empregado",
                   "meio utilizado", "arma utilizada", "tipo de arma", "instrumento",
                   "tipo de agressao sofrida", "tipo de agressao", "agressao sofrida",
                   "causa da lesao", "causa da morte", "arma", "meio"),
}


def pick(row: dict[str, str], field: str) -> str:
    normalized = {key(column): value for column, value in row.items() if column.strip()}
    for alias in ALIASES[field]:
        value = normalized.get(key(alias))
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def declared_instrument(row: dict[str, str]) -> str:
    """Ignora campos estruturados genéricos antes de consultar os seguintes."""
    normalized = {key(column): value for column, value in row.items() if column.strip()}
    for alias in ALIASES["instrument"]:
        value = normalized.get(key(alias))
        if value:
            group = mvi_instrument(str(value))
            if group != "Não identificado":
                return group
    return "Não identificado"


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
    indicators: tuple[str, ...]


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
        indicators: tuple[str, ...] = ()
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
        labels: list[str] = []
        if source == "ocorrencias":
            classification = " ".join(str(value) for column, value in row.items()
                                      if value and any(term in key(column) for term in
                                      ("tipificacao", "tipicidade", "natureza", "indicadorcriminal",
                                       "tipodeocorrencia", "classificacao")))
            cvp = cvp_class(classification or nature)
            category = "CVP " + cvp if cvp else ""
            if cvp:
                labels.append("CVP")
            attempt_text = " ".join(str(value) for column, value in row.items()
                                    if value and any(term in key(column) for term in
                                    ("tipificacao", "tipicidade", "natureza", "classificacao",
                                     "relato", "historico", "narrativa", "descricao",
                                     "complemento", "solucao", "desfecho", "providencia")))
            if homicide_attempt(attempt_text or nature, pick(row, "solution")):
                labels.append("Tentativa de homicídio")
                category = category or "Tentativa de homicídio"
            if elaborated_tco(pick(row, "tco_solution")):
                labels.append("TCO")
            for action in ("Mandados", "Visitas", "Sossego"):
                if operational_action(row, action)[0]:
                    labels.append(action)
        indicators = tuple(labels)
        eligible, reason = True, ""
    return Record(natural_key, when.isoformat(), when.year, city, occurrence, victim,
                  nature, category, eligible, reason, indicators)
