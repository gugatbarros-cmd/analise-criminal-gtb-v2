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


_CONSUMED = re.compile(r"\b(?:homicidio\s+consumad[oa]|assassinat[oa]|assassinad[oa]|latrocinio|feminicidio)\b")
_DEATH = re.compile(r"\b(?:morreu|faleceu|veio\s+a\s+obito|evoluiu\s+(?:a|para)\s+obito|"
                    r"obito\s+confirmado|morte\s+confirmada|sem\s+sinais\s+vitais|sem\s+vida|"
                    r"corpo\s+(?:foi\s+)?encontrad[oa])\b")
_VIOLENCE = re.compile(r"\b(?:homicidio|latrocinio|feminicidio|assassinat\w*|assassinad\w*|"
                       r"dispar\w*|tiros?|balead\w*|alvejad\w*|arma\s+de\s+fogo|"
                       r"esfaquead\w*|facad\w*|arma\s+branca|agress\w*|golpes?|"
                       r"estrangul\w*|enforc\w*|espanc\w*)\b")
_EXCLUDED_DEATH = re.compile(r"\b(?:nao\s+(?:morreu|faleceu|houve\s+obito)|sem\s+obito|"
                             r"obito\s+nao\s+confirmado|morte\s+nao\s+confirmada|"
                             r"sobreviveu|sem\s+confirmacao\s+(?:de\s+)?(?:morte|obito))\b")
_EXCLUDED_CAUSE = re.compile(r"\b(?:suicidio|autoexterminio|morte\s+natural|doenca|"
                             r"acidente|afogamento|transito|intervencao\s+policial|resistencia|"
                             r"tentativa\s+de\s+(?:homicidio|feminicidio|latrocinio))\b")
_UNCERTAIN_DEATH = re.compile(r"\b(?:possivel|supost[oa]|suspeita\s+de|a\s+confirmar|"
                              r"aparentemente)\b.{0,35}\b(?:morte|obito|homicidio)\b")
_REVIEW_TERMS = re.compile(r"\b(?:homicidio|feminicidio|latrocinio|obito|morte|morreu|"
                           r"faleceu|assassinat\w*|assassinad\w*)\b")


def cad_narrative_reviewable(row: dict[str, str]) -> bool:
    """Inclui relatos com sinal de morte, inclusive incerto ou evolução posterior."""
    return any(_REVIEW_TERMS.search(plain(value)) for value in narrative_values(row))


def infer_consumed_cad_homicide(row: dict[str, str]) -> str | None:
    """Confirma morte violenta expressa no relato; nunca resolve contradição explícita."""
    texts = [plain(value) for value in narrative_values(row)]
    if any(_EXCLUDED_DEATH.search(text) or _EXCLUDED_CAUSE.search(text) or _UNCERTAIN_DEATH.search(text)
           for text in texts):
        return None
    for text in texts:
        if _CONSUMED.search(text) or (_DEATH.search(text) and _VIOLENCE.search(text)):
            if 'latrocinio' in text:
                return 'Latrocínio'
            if 'feminicidio' in text:
                return 'Feminicídio'
            return 'Homicídio doloso'
    return None
