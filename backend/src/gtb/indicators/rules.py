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
    for fmt in ("%d/%m/%Y", "%d/%m/%Y %H:%M", "%d/%m/%Y %H:%M:%S",
                "%Y-%m-%d", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None
