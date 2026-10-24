"""Inferência conservadora do meio em relatos MVI da própria fonte."""

import re

from gtb.indicators.rules import key, plain

PATTERNS = (
    ("Arma de fogo", re.compile(r"\b(?:arma de fogo|dispar\w*|tiros?|alvejad[oa]|balead[oa]|"
                                   r"projetil|paf|pistola|revolver|espingarda|escopeta|garrucha|"
                                   r"fuzil|carabina|submetralhadora)\b")),
    ("Arma branca", re.compile(r"\b(?:arma branca|perfuro[ -]?cortante|perfurante|"
                                  r"esfaquead[oa]|facad[ao]|faca|facao|peixeira|canivete|"
                                  r"punhal|estilete|tesoura|lamina|foice|machado)\b")),
    ("Outros meios", re.compile(r"\b(?:objeto contundente|contundente|paulada|pedrada|"
                                  r"porrete|martelo|pedra|asfixia|estrangulamento|"
                                  r"enforcamento|sufocamento|esganadura|espancamento|"
                                  r"atropelamento|veneno|intoxicacao|explosivo|"
                                  r"queimadura|incendio)\b")),
)
NARRATIVE_HEADER = re.compile(r"relato|historico|narrativa|dinamica|descri|complement|observa")
INJURY = re.compile(r"\b(?:feriment\w*|les\w*|golpe\w*|atingid\w*|mort\w*|matou|"
                    r"alvejad\w*|balead\w*|efetuou|desferiu|disparou|esfaque\w*|"
                    r"estrangul\w*|espanc\w*)\b")
INCIDENTAL = re.compile(r"\b(?:apreendid\w*|apreensao|portava|porte|coldre|"
                        r"armamento da equipe|policia\w* armad\w*)\b")
NEGATION = re.compile(r"\b(?:nao (?:houve|apresentava|apresentou|foi|usou|utilizou|"
                      r"empregou)|sem|descartad[oa])(?:\s+\w+){0,8}\s*$")
UNCERTAIN = re.compile(r"\b(?:possivel|possivelmente|suspeita de|suposto|hipotese de|"
                       r"a confirmar)(?:\s+\w+){0,4}\s*$")
SPLIT = re.compile(r"[.;\n|,]|\b(?:mas|porem|contudo|entretanto)\b")


def narrative_values(row: dict[str, str]) -> list[str]:
    found = []
    for column, value in row.items():
        header = plain(column)
        if not NARRATIVE_HEADER.search(header) or not str(value).strip():
            continue
        compact = key(column)
        priority = (0 if compact in {"textodocomplementodoquimera", "textocomplementodoquimera",
                                     "complementodoquimera", "textodocomplementoquimera",
                                     "textocomplementoquimera", "complementoquimera",
                                     "textodocomplemento"}
                    else 1 if "quimera" in compact and "complement" in compact
                    else 2 if any(term in compact for term in ("relato", "historico", "narrativa"))
                    else 3)
        found.append((priority, str(value).strip()))
    return [value for _, value in sorted(found, key=lambda item: item[0])]


def infer_narrative_instrument(row: dict[str, str]) -> str:
    """Usa o primeiro relato com evidência afirmativa; não cruza CAD com NEAC."""
    for value in narrative_values(row):
        matches = []
        offset = 0
        for clause in SPLIT.split(plain(value)):
            injury = bool(INJURY.search(clause))
            incidental = bool(INCIDENTAL.search(clause))
            for priority, (label, pattern) in enumerate(PATTERNS):
                for match in pattern.finditer(clause):
                    before, after = clause[:match.start()], clause[match.end():]
                    if NEGATION.search(before) or UNCERTAIN.search(before):
                        continue
                    if re.match(r"\s+(?:nao foi|descartad)", after):
                        continue
                    if incidental and not injury:
                        continue
                    if re.search(r"\b(?:portava|porte de|armad[oa]s? com|apreensao de|"
                                 r"apreendid[oa])(?:\s+\w+){0,3}\s*$", before):
                        continue
                    if match.group().startswith("dispar") and re.match(r"\s+(?:o\s+)?alarme\b", after):
                        continue
                    matches.append((-int(injury), offset + match.start(), priority, label))
            offset += len(clause) + 1
        if matches:
            return min(matches)[3]
    return "Não identificado"
