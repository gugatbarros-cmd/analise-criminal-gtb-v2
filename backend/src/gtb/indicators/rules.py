"""Classificações explícitas; cada fonte preserva sua unidade estatística."""

import re
import unicodedata
from datetime import date, datetime, timedelta


def plain(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"\s+", " ", text.lower()).strip()


def key(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", "", plain(value))


def meaningful(value: object) -> bool:
    text = plain(value)
    return bool(text) and not re.search(
        r"desconhecid|indeterminad|nao identificad|nao informad|sem (?:nome|identifica)|ignorad",
        text,
    )


def domestic_triage(row: dict[str, str]) -> dict[str, str]:
    """Triagem documental conservadora baseada no classificador do legado."""
    def affirmed(value: str, pattern: str) -> bool:
        for clause in re.split(r"[.;\n]|\b(?:mas|porem|contudo|entretanto)\b", value):
            if re.search(r"historico de|anteriormente|no passado|sem novo fato|"
                         r"suspeita de|possivel|hipotese de|averiguar", clause):
                continue
            for match in re.finditer(pattern, clause):
                before = clause[:match.start()]
                after = clause[match.end():]
                if re.search(r"(?:nao\s+(?:houve|foi|ha|ocorreu|sofreu|constatou|"
                             r"confirmou)|sem|nega|negou|descartad[oa])(?:\s+\w+){0,5}\s*$", before):
                    continue
                if re.match(r"\s+(?:nao\s+(?:constatad[oa]|confirmad[oa])|"
                            r"descartad[oa]|inexistente)\b", after):
                    continue
                return True
        return False

    fields = [(column, plain(value)) for column, value in row.items() if value]
    nature = [(column, value) for column, value in fields if re.search(
        r"natureza|tipificacao|tipicidade|classificacao", plain(column))]
    final = [(column, value) for column, value in nature if re.search(
        r"final|no atendimento|constatada|confirmada|tipificacao|tipicidade", plain(column))
        and not re.search(r"inicial|solicitad|comunicad|despacho", plain(column))]
    solution = [(column, value) for column, value in fields if re.search(
        r"solucao|desfecho|resultado do atendimento|conclusao", plain(column))]
    narrative = [(column, value) for column, value in fields if re.search(
        r"relato|historico|narrativa|texto do complemento|descricao|observac", plain(column))
        and not re.search(r"nome|autor do registro", plain(column))]
    relationship = [(column, value) for column, value in fields if re.search(
        r"parentesco|vinculo|relacao", plain(column))]
    text = " . ".join(value for _, value in [*nature, *solution, *narrative])
    scope = (r"violencia\s+(?:domestica|familiar|contra\s+(?:a\s+)?mulher)|"
             r"maria\s+da\s+penha|lei\s*11[.\s]*340|feminicidio")
    family = (r"\b(?:ex[ -]*)?(?:companheir[oa]|conjuge|espos[oa]|namorad[oa])\b|"
              r"relacao intima|ambito familiar|vinculo familiar|"
              r"\b(?:mae|pai|filha|filho|irma|irmao|padrasto|madrasta)\b")
    woman_words = (r"violencia\s+contra\s+(?:a\s+)?mulher|maria\s+da\s+penha|"
                   r"lei\s*11[.\s]*340|feminicidio|\bvitima\s+(?:e\s+)?"
                   r"(?:mulher|feminina|do sexo feminino)|\b(?:a mulher|a esposa|"
                   r"a companheira|a ex[ -]companheira|a namorada|a filha|a mae)\b|"
                   r"\b(?:agredida|ameacada|estuprada|ofendida)\b")
    conduct = (r"tentativa\s+de\s+feminicidio|\bfeminicidio\b|tentativa\s+de\s+homicidio|"
               r"descumprimento\s+(?:de\s+)?medida\s+protetiva|estupro|violencia sexual|"
               r"lesao corporal|agressao|agrediu|vias de fato|ameac(?:a|ou|ada)|"
               r"perseguicao|violencia psicologica|humilhacao|chantagem|injuria|"
               r"difamacao|calunia|violencia moral|violencia patrimonial|violencia fisica")
    sex = [value for column, value in fields if re.fullmatch(
        r"(?:sexo|genero)(?: da| de)? vitima", plain(column))]
    female = any(value in {"f", "feminino", "feminina", "mulher"} for value in sex)
    male = any(value in {"m", "masculino", "masculina", "homem"} for value in sex)
    woman = female or bool(re.search(woman_words, text))
    context = bool(re.search(scope, text) or re.search(r"medida protetiva", text)
                   or any(re.search(family, value) for _, value in [*relationship, *narrative]))
    candidate = bool(re.search(scope, text) or re.search(r"medida protetiva", text)
                     or re.search(conduct, text) and (context or woman))

    def decision(status: str, reason: str, evidence: str = "") -> dict[str, str]:
        return {"status": status, "reason": reason, "evidence": evidence}

    if not candidate:
        return decision("unrelated", "Sem indicação do tema nos campos do fato")
    denial = (r"(?:fato|ocorrencia|denuncia)\s+(?:nao\s+(?:constatad[oa]|"
              r"confirmad[oa])|improcedente)|nada\s+constatado|sem\s+ilicitude|"
              r"\btrote\b|denuncia\s+falsa|nao\s+(?:se\s+)?trata\s+de\s+"
              r"violencia|nao\s+(?:houve|ha|ocorreu|se\s+configura|configura)\s+"
              r"(?:a\s+)?violencia|violencia\s+(?:domestica|familiar)\s+"
              r"(?:nao\s+(?:constatada|confirmada)|descartada|inexistente)")
    negative = next(((column, value) for column, value in [*solution, *final]
                     if re.search(denial, value) or re.fullmatch(
                         r"nao constatad[oa]|nao configurad[oa]|improcedente", value)), None)
    affirmative_final = [(column, value) for column, value in final
                         if not re.search(denial, value) and not re.search(
                             r"visita|fiscalizacao|orientacao|acompanhamento", value)]
    affirmative_narrative = [(column, value) for column, value in narrative if re.search(
        r"\bvitima\b.{0,45}\b(?:relatou|informou|afirmou|declarou)|"
        r"\b(?:foi|era)\s+(?:agredida|ameacada|estuprada)|"
        r"\bagrediu\s+(?:a\s+)?(?:esposa|companheira|namorada)|"
        r"\b(?:equipe|guarnicao)\b.{0,60}\b(?:constatou|presenciou|confirmou)", value)]
    positive = next(((column, value) for column, value in [
        *affirmative_final, *affirmative_narrative] if affirmed(value, conduct) or
        (column, value) in affirmative_final and affirmed(value, scope)), None)
    if negative:
        evidence = f"{negative[0]}: {row[negative[0]]}"
        if positive:
            return decision("pending", "Tipificação e conclusão do atendimento conflitantes", evidence)
        return decision("excluded", "Atendimento registrou não configuração ou fato não constatado", evidence)
    if male and woman:
        return decision("pending", "Perfil da vítima conflitante; conferir o registro original")
    if male:
        return decision("outside", "Campo específico identifica vítima masculina")
    if not woman:
        return decision("pending", "Sem identificação suficiente de vítima mulher")
    if not context:
        return decision("pending", "Sem contexto doméstico, familiar ou íntimo confirmado")
    if not positive:
        return decision("pending", "Menção, natureza inicial ou medida sem novo fato afirmativo")
    return decision("recognized", "Fato descrito ou tipificado; sujeito à revisão humana",
                    f"{positive[0]}: {row[positive[0]]}")


def mvi_instrument(value: str) -> str:
    """Agrupa apenas o meio explicitamente informado; texto narrativo requer revisão."""
    text = plain(value)
    if not text or re.search(r"nao informad|nao identificad|ignorado|indeterminad|^outros?(?: meios?)?$", text):
        return "Não identificado"
    if re.search(r"arma de fogo|pistola|revolver|espingarda|garrucha|fuzil|carabina|"
                 r"submetralhadora|\bdisparo\b|\btiro\b|\bpaf\b", text):
        return "Arma de fogo"
    if re.search(r"arma branca|perfuro.?cortante|perfurante|\bfaca\b|\bfacao\b|"
                 r"canivete|punhal|foice|machado|estilete|tesoura", text):
        return "Arma branca"
    if re.search(r"objeto contundente|instrumento contundente|contundente|paulada|"
                 r"pedrada|porrete|martelo|pedra|madeira|garrafa|asfixia|"
                 r"estrangulamento|enforcamento|sufocamento|esganadura|"
                 r"agressao fisica|espancamento|atropelamento|veiculo|"
                 r"intoxicacao|veneno|explosivo|queimadura|incendio|\bfogo\b", text):
        return "Outros meios"
    return "Não identificado"


def operational_action(row: dict[str, str], kind: str) -> tuple[bool, str]:
    """Reconhece ações e perturbação do sossego na base geral."""
    if kind not in {"Mandados", "Visitas", "Sossego"}:
        raise ValueError("Ação operacional desconhecida")
    if kind == "Sossego":
        classification_fields = ("natureza", "tipificacao", "tipicidade",
                                 "tipo de ocorrencia", "indicador criminal")
        classification = plain(" ".join(str(value) for column, value in row.items()
                                        if value and any(term in plain(column)
                                                         for term in classification_fields)))
        if not re.search(r"\bpertur?bacao\b.{0,100}\b(?:sossego|tranquilidade|"
                         r"trabalho|descanso)\b", classification):
            return False, "Sem natureza de perturbação do sossego ou trabalho"
        solution = plain(" ".join(str(value) for column, value in row.items()
                                  if value and "solucao" in key(column)))
        if re.search(r"nao constatad|nao confirmad|cancelad|duplicad|trote|"
                     r"sem ilicitude|fato inexistente|improcedente|engano", solution):
            return False, "Ocorrência descartada pela solução"
        return True, "Natureza ou tipificação de perturbação do sossego ou trabalho"
    relevant = ("natureza", "tipificacao", "tipicidade", "classificacao", "solucao",
                "relato", "historico", "narrativa", "descricao", "complemento",
                "providencia", "desfecho", "modalidade", "acao")
    text = plain(" ".join(str(value) for column, value in row.items()
                          if value and any(term in key(column) for term in relevant)))
    excluded = (r"nao\s+(?:cumprid[oa]|realizad[oa]|localizad[oa]|encontrad[oa])|"
                r"sem\s+exito|cancelad[oa]|improcedente|trote|nada\s+constatado|"
                r"fato\s+nao\s+constatado")
    if kind == "Mandados":
        excluded += (r"|mandado\s+(?:apenas\s+)?(?:expedid[oa]|solicitad[oa]|"
                     r"pendente|a\s+cumprir)|(?:expedid[oa]|solicitad[oa]|"
                     r"pendente|a\s+cumprir)\s+mandado")
    if re.search(excluded, text):
        return False, "Ação não realizada, sem êxito ou pendente"
    if kind == "Mandados":
        rules = (
            (r"\b(?:cumprimento|execucao)\s+(?:d[eo]|ao)\s+mandado\b",
             "Cumprimento ou execução de mandado"),
            (r"\b(?:deu|foi\s+dado)\s+cumprimento\s+ao\s+mandado\b",
             "Cumprimento confirmado no relato"),
            ((r"\bmandado\s+(?:judicial|de\s+prisao|de\s+busca(?:\s+e\s+apreensao)?)\b"
              r".{0,100}\b(?:cumprid[oa]|executad[oa]|efetivad[oa]|concluid[oa])\b"),
             "Mandado registrado como executado"),
            ((r"\b(?:cumprid[oa]|executad[oa]|efetivad[oa]|concluid[oa])\b"
              r".{0,100}\bmandado\b"), "Execução de mandado confirmada"),
            ((r"\bmandado\b.{0,140}\b(?:prisao\s+efetuada|preso|capturado|"
              r"conduzido|localizado\s+e\s+preso|com\s+exito)\b"),
             "Mandado com resultado operacional efetivo"),
        )
    else:
        rules = (
            (r"\bvisita\s+orientativa\b", "Visita orientativa registrada"),
            (r"\bvisita\s+preventiva\b", "Visita preventiva registrada"),
            (r"\bvisita\s+comunitaria\b", "Visita comunitária registrada"),
            (r"\bvisita\s+tranquilizadora\b", "Visita tranquilizadora registrada"),
            (r"\bvisita\s+(?:de\s+)?acompanhamento\b",
             "Visita de acompanhamento registrada"),
        )
    for pattern, reason in rules:
        if re.search(pattern, text):
            return True, reason
    return False, "Sem confirmação textual da ação"


def mvi_class(nature: str) -> str | None:
    text = plain(nature)
    if re.search(r"tentativa|tentado|tentada|culpos|transito|intervencao policial|resistencia", text):
        return None
    if "feminicidio" in text:
        return "Feminicídio"
    if "latrocinio" in text or ("roubo" in text and "morte" in text):
        return "Latrocínio"
    if "lesao corporal" in text and "morte" in text:
        return "Lesão corporal seguida de morte"
    if re.search(r"\bhomicidio\b|\bmvi\b|morte violenta intencional", text):
        return "Homicídio doloso"
    return None


def death_confirmed(value: str) -> bool:
    return key(value) in {"s", "sim", "yes", "true", "1"}


def victim_role(value: str) -> bool:
    return not re.search(
        r"autor|suspeito|agressor|acusado|indiciado|testemunha|solicitante|comunicante",
        plain(value),
    )


def cvp_class(nature: str) -> str | None:
    text = plain(nature)
    if re.search(r"latrocinio|roubo (?:seguido de|com resultado) morte", text):
        return None
    if re.search(r"\broubo\b|\bcvp\b", text):
        return ("Tentado" if re.search(r"tentativa|tentado|tentada|forma tentada|"
                                      r"nao consumado", text) else "Consumado")
    return None


def homicide_attempt(nature: str, solution: str = "") -> bool:
    text = plain(nature)
    explicit = re.search(
        r"tentativa (?:de |do crime de )?(?:homicidio|feminicidio|assassinato)|"
        r"(?:homicidio|feminicidio) (?:doloso )?(?:tentad[ao]|na forma tentada|"
        r"em sua forma tentada)|tentou matar|atentado contra a vida",
        text,
    )
    has_homicide = re.search(r"\bhomicidio\b|\bfeminicidio\b|\bassassinato\b", text)
    has_attempt = re.search(
        r"\btentativa\b|\btentad[ao]\b|\bforma tentada\b|"
        r"\bmodalidade tentada\b|\btentou matar\b|\batentado contra a vida\b", text,
    )
    if not (explicit or (has_homicide and has_attempt)):
        return False
    discarded = re.search(
        r"(?:tentativa (?:de )?(?:homicidio|feminicidio)|"
        r"(?:homicidio|feminicidio).{0,30}tentad[ao]).{0,60}"
        r"(?:descartad[ao]|nao confirmad[ao]|nao configurad[ao]|sem indicios)|"
        r"(?:nao se trata|nao se tratava|descartada? a hipotese|"
        r"afastada? a hipotese).{0,60}(?:tentativa (?:de )?"
        r"(?:homicidio|feminicidio)|(?:homicidio|feminicidio).{0,30}tentad[ao])",
        text,
    )
    if discarded:
        return False
    return not bool(re.search(
        r"nao constatad|nao confirmad|cancelad|duplicad|trote|sem ilicitude|"
        r"nada constatado|fato inexistente|improcedente|engano", plain(solution),
    ))


def elaborated_tco(value: str) -> bool:
    status = re.sub(r"[^a-z0-9]+", " ", plain(value)).strip()
    compact = key(value)
    if not status or "naoelaborou" in compact:
        return False
    return ("elaboroutcopm" in compact or
            all(word in compact for word in ("elaborou", "tco", "pm")))


def event_date(value: object) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, (int, float)) and 1 <= value <= 100000:
        return date(1899, 12, 30) + timedelta(days=int(value))
    text = str(value or "").strip()
    if not text:
        return None
    if text.isdigit() and 1 <= int(text) <= 100000:
        return date(1899, 12, 30) + timedelta(days=int(text))
    text = re.sub(r"\s+às\s+", " ", text, flags=re.IGNORECASE)
    for fmt in ("%d/%m/%Y", "%d/%m/%Y %H:%M", "%d/%m/%Y %H:%M:%S",
                "%Y-%m-%d", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None
