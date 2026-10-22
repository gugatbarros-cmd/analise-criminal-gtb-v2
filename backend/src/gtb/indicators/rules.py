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
    if not re.search(r"tentativa|tentado|tentada", text):
        return False
    if not re.search(r"homicidio|feminicidio|assassinato", text):
        return False
    return not bool(re.search(r"improcedente|nao constatad|descartad", plain(solution)))


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
