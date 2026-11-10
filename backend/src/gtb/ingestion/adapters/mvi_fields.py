"""Representação mínima das fichas MVI para cálculo e consulta online.

O arquivo recebido permanece integral no arquivo local comprimido. Cada grupo
guarda no máximo um valor, independentemente das variações do cabeçalho.
"""

from gtb.indicators.mvi_narrative import narrative_values
from gtb.indicators.mvi_time import TIME_FIELDS
from gtb.indicators.rules import key, mvi_instrument
from gtb.ingestion.adapters.normalize import ALIASES
from gtb.map_location import LATITUDE_KEYS, LONGITUDE_KEYS, PAIR_KEYS

MVI_CAD_FIELDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Número da ocorrência", ALIASES["occurrence"]),
    ("Data da ocorrência", ALIASES["date"]),
    ("Cidade ocorrência", ALIASES["city"]),
    ("Nome da vítima", ALIASES["victim"]),
    ("Nº NIC", ("nº nic", "no nic", *ALIASES["nic"])),
    ("Envolvimento", ALIASES["role"]),
    ("Óbito?", ALIASES["death"]),
    ("Tipificação no despacho", ALIASES["dispatch"]),
    ("Tipificação geral", ALIASES["type"]),
    ("Idade", ALIASES["age"]),
    ("Sexo", ALIASES["sex"]),
    ("Endereço", ("endereco ocorrencia", "endereco da ocorrencia", "endereco do fato",
                 "local do fato", "logradouro ocorrencia", "logradouro do fato", *ALIASES["address"])),
    ("Bairro", ("bairro ocorrencia", "bairro da ocorrencia", "comunidade ocorrencia",
                *ALIASES["neighborhood"])),
    ("Instrumento empregado", ALIASES["instrument"]),
    ("Hora da ocorrência", TIME_FIELDS),
    ("Latitude", LATITUDE_KEYS),
    ("Longitude", LONGITUDE_KEYS),
    ("Coordenadas ocorrência", PAIR_KEYS),
)


def _allowed_narrative(name: str) -> bool:
    column = key(name)
    if any(term in column for term in ("descricaofisica", "caracteristicasfisicas",
                                       "aparencia", "vestimenta", "sinaisparticulares")):
        return False
    return any(term in column for term in ("relato", "historico", "narrativa", "dinamica",
                                           "complemento", "observacao", "descricaodofato",
                                           "descricaodaocorrencia"))


def project_mvi_fields(source: str, row: dict[str, str]) -> dict[str, str]:
    """Seleciona até 19 grupos usados nas estatísticas e na revisão MVI."""
    if source not in {"mvi_cad", "mvi_neac"}:
        raise ValueError("Fonte MVI desconhecida")
    columns = {key(name): str(value).strip() for name, value in row.items()
               if name and str(value).strip()}
    result: dict[str, str] = {}
    for label, aliases in MVI_CAD_FIELDS:
        choices = (ALIASES["neac_type"] if source == "mvi_neac" and label == "Tipificação geral"
                   else aliases)
        if label == "Instrumento empregado":
            declared = [columns[key(alias)] for alias in choices if columns.get(key(alias))]
            if declared:
                result[label] = next((value for value in declared
                                      if mvi_instrument(value) != "Não identificado"), declared[0])
            continue
        for alias in choices:
            value = columns.get(key(alias))
            if value:
                result[label] = value
                break
    narrative_row = {name: value for name, value in row.items() if _allowed_narrative(name)}
    narratives = narrative_values(narrative_row)
    if narratives:
        if len(narratives) == 1:
            original = next((name for name, value in narrative_row.items() if str(value).strip() == narratives[0]
                             and narrative_values({name: value})), "Relatos")
            result[original] = narratives[0]
        else:
            result["Relatos"] = "\n".join(narratives)
    return result
