"""Triagem documental equivalente ao classificador doméstico do legado, regra 4."""
import re
import unicodedata
from functools import lru_cache


def _plain(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    return re.sub(r"\s+", " ", "".join(c for c in text if not unicodedata.combining(c)).lower()).strip()


SCOPE = r"violencia\s+(?:domestica|familiar|contra\s+(?:a\s+)?mulher)|maria\s+da\s+penha|lei\s*11[.\s]*340|feminicidio"
EVENT = r"violencia\s+(?:domestica|familiar|contra\s+(?:a\s+)?mulher)|feminicidio"
FAMILY = (r"\b(?:ex[ -]*)?(?:companheir[oa]|conjuge|espos[oa]|namorad[oa])\b|relacao intima|"
          r"ambito familiar|vinculo familiar|\b(?:mae|pai|filha|filho|irma|irmao|padrasto|madrasta)\b")
WOMAN = (r"violencia\s+contra\s+(?:a\s+)?mulher|maria\s+da\s+penha|lei\s*11[.\s]*340|feminicidio|"
         r"\bvitima\s+(?:e\s+)?(?:mulher|feminina|do sexo feminino)|"
         r"\b(?:a mulher|a esposa|a companheira|a ex[ -]companheira|a namorada|a filha|a mae)\b|"
         r"\b(?:agredida|ameacada|estuprada|ofendida)\b")
TYPES = [r"tentativa\s+de\s+feminicidio", r"(?<!tentativa de )\bfeminicidio\b",
         r"tentativa\s+de\s+homicidio", r"descumprimento\s+(?:de\s+)?medida\s+protetiva|descumpri\w*\s+(?:a\s+)?medida\s+protetiva",
         r"\bestupro\b|\bestuprad[oa]\b|violencia sexual|abuso sexual", r"lesao corporal|lesoes corporais",
         r"\bagressao\b|\bagressoes\b|\bagred(?:iu|ida|ido)\b|vias de fato|espanc(?:amento|ada|ou)",
         r"\bameac(?:a|as|ou|ada|ado)\b", r"\bperseguicao\b|\bpersegui(?:u|da)\b",
         r"violencia psicologica|\bhumilh(?:acao|ou|ada)\b|\bchantagem\b",
         r"\binjuria\b|\bdifamacao\b|\bcalunia\b|violencia moral",
         r"violencia patrimonial|\bdano\b|destruiu\s+(?:o\s+|os\s+|a\s+)?(?:celular|documentos|bens)|reteve\s+(?:os\s+)?documentos",
         r"violencia fisica"]
DENIAL = (r"(?:fato|ocorrencia|denuncia)\s+(?:nao\s+(?:constatad[oa]|confirmad[oa])|improcedente)|"
          r"nada\s+constatado|sem\s+ilicitude|\btrote\b|denuncia\s+falsa|nao\s+(?:se\s+)?trata\s+de\s+violencia|"
          r"nao\s+(?:houve|ha|ocorreu|se\s+configura|configura|se\s+caracteriza|caracteriza)\s+(?:a\s+)?"
          r"violencia\s+(?:domestica|familiar|contra\s+(?:a\s+)?mulher)|"
          r"violencia\s+(?:domestica|familiar|contra\s+(?:a\s+)?mulher)\s+(?:nao\s+(?:constatada|confirmada|caracterizada)|descartada|inexistente)|"
          r"sem\s+contexto\s+(?:domestico|familiar)")
DENIAL_EXCEPTION = r"nao\s+(?:foi\s+)?(?:trote|improcedente)|nao\s+(?:se\s+)?descart"


def _clauses(text: str) -> list[str]:
    return [part.strip() for part in re.split(r"[.;\n]|\b(?:mas|porem|contudo|entretanto)\b", text) if part.strip()]


def _affirmed(text: str, pattern: str) -> bool:
    for clause in _clauses(text):
        if re.search(r"\b(?:historico de|anteriormente|no passado|ocorrencia anterior|fato anterior|fatos anteriores|sem novo fato)\b", clause):
            continue
        for match in re.finditer(pattern, clause):
            before, after = clause[:match.start()], clause[match.end():]
            if re.search(r"(?:nega|negou|nao\s+(?:houve|foi|ter sido|ter sofrido|sofreu)|sem)\s+(?:(?:a|o|ter|sido|sofrido|agressao|agressoes|ameaca|ameacas|lesao|lesoes|corporal|corporais|agredida|ameacada|violencia|fisica|psicologica|sexual|e|ou|nem)\s+)*$", before):
                continue
            if re.search(r"(?:nao\s+(?:houve|ha|havia|ocorreu|ocorreram|sofreu|sofria|foi|foram|apresenta|apresentava|constatou|confirmou)(?:\s+(?:qualquer|nenhuma?|sinais?|indicios?|de|a|o|as|os))*|sem(?:\s+(?:sinais?|indicios?|relatos?|qualquer|de|a|o))*|nega|negou(?:\s+(?:ter|sido|sofrido|a|ocorrencia|de))*|descartad[oa](?:\s+(?:a|hipotese|de))*)\s*$", before):
                continue
            if re.match(r"\s+(?:nao\s+(?:constatad[oa]|confirmad[oa]|ocorreu)|descartad[oa]|inexistente)\b", after):
                continue
            if re.search(r"\b(?:suspeita de|possivel|supost[oa]|hipotese de|averiguar|verificar denuncia)\b", clause):
                continue
            return True
    return False


@lru_cache(maxsize=512)
def _column_name(column: str) -> str:
    return _plain(column)


def classify(row: dict) -> dict[str, str]:
    fields = [(column, _column_name(column), _plain(value)) for column, value in row.items()
              if not column.startswith('__siopm')]
    nature = [f for f in fields if re.search(r"natureza|tipificacao|tipicidade|classificacao", f[1])]
    final = [f for f in nature if re.search(r"final|no atendimento|constatada|confirmada|tipificacao|tipicidade", f[1])
             and not re.search(r"inicial|solicitad|comunicad|despacho", f[1])]
    solutions = [f for f in fields if re.search(r"solucao|desfecho|resultado do atendimento|conclusao", f[1])]
    narratives = [f for f in fields if re.search(r"relato|historico|narrativa|texto do complemento|descricao|observac", f[1])
                  and not re.search(r"nome|autor do registro", f[1])]
    relationship = any(re.search(r"parentesco|vinculo|relacao", name) and re.search(FAMILY, value) for _, name, value in fields)
    text = ' . '.join(f[2] for f in [*nature, *solutions, *narratives])
    context = bool(re.search(SCOPE, text) or 'medida protetiva' in text or relationship
                   or any(re.search(FAMILY, f[2]) for f in narratives))
    female_role = any(re.fullmatch(r"envolvimento|tipo de envolvimento|papel", name)
                      and re.fullmatch(r"vitima|ofendida", value) for _, name, value in fields)
    sex = [value for _, name, value in fields if re.fullmatch(r"(?:sexo|genero)(?: da| de)? vitima", name)
           or female_role and name in {'sexo', 'genero'}]
    female = any(value in {'f', 'feminino', 'feminina', 'mulher'} for value in sex)
    male = any(value in {'m', 'masculino', 'masculina', 'homem'} for value in sex)
    woman = female or bool(re.search(WOMAN, text))

    def decision(status: str, reason: str, evidence: str = '') -> dict[str, str]:
        return {'status': status, 'reason': reason, 'evidence': evidence}

    candidate = re.search(SCOPE, text) or 'medida protetiva' in text or any(re.search(p, text) for p in TYPES) and (context or woman)
    if not candidate:
        return decision('unrelated', 'Sem indicação relacionada ao tema nos campos do fato')

    def negative(field: tuple) -> bool:
        return bool((re.search(DENIAL, field[2]) or re.search(r"\bimprocedente\b|^(?:nao constatad[oa]|nao configurad[oa])$", field[2]))
                    and not re.search(DENIAL_EXCEPTION, field[2]))

    denial = next((f for f in [*solutions, *final, *nature] if negative(f)), None)
    if denial is None:
        denial = next((f for f in narratives if any(re.search(DENIAL, part) and not re.search(
            r"\b(?:autor|agressor|suspeito|acusado)\b.{0,45}\b(?:negou|alegou|disse|afirmou)\b|" + DENIAL_EXCEPTION, part)
            for part in _clauses(f[2]))), None)
    affirmative = [f for f in final if not negative(f) and (not re.search(r"visita|fiscalizacao|orientacao|acompanhamento", f[2])
                   or re.search(r"descumprimento|constatad|flagrante|novo fato", f[2]))]
    asserted = [f for f in narratives if re.search(r"\bvitima\b.{0,45}\b(?:relatou|informou|afirmou|declarou)|\b(?:foi|era)\s+(?:agredida|ameacada|estuprada)|\bagrediu\s+(?:a\s+)?(?:esposa|companheira|namorada)|\b(?:equipe|guarnicao)\b.{0,60}\b(?:constatou|presenciou|confirmou)", f[2])]
    evidence = [*affirmative, *asserted]
    positive = any(_affirmed(f[2], p) for f in evidence for p in TYPES) or any(_affirmed(f[2], EVENT) for f in affirmative)
    if denial:
        return decision('pending' if positive else 'excluded', 'Informações conflitantes' if positive else 'Atendimento registrou não configuração', f'{denial[0]}: {row[denial[0]]}')
    if male and woman:
        return decision('pending', 'Perfil da vítima conflitante entre campos e descrição')
    if male and not female:
        return decision('outside', 'Campo específico identifica vítima masculina')
    if not woman:
        return decision('pending', 'Sem identificação suficiente de vítima mulher')
    if not context:
        return decision('pending', 'Sem contexto doméstico, familiar ou íntimo confirmado')
    if not positive:
        return decision('pending', 'Menção ou hipótese sem novo fato afirmativo')
    origin = next((f for f in affirmative if _affirmed(f[2], EVENT)), None)
    origin = origin or next(f for f in evidence if any(_affirmed(f[2], p) for p in TYPES))
    return decision('recognized', 'Fato descrito ou tipificado; sujeito à revisão humana', f'{origin[0]}: {row[origin[0]]}')
