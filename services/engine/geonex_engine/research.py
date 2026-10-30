"""Couche de recherche externe (gratuite, sans clé) avec traçabilité.

- Wikipédia (FR) : contexte de la crise, avec URL et date de consultation.
- Wikidata : chefs d'État / de gouvernement des pays identifiés.

La recherche peut être désactivée (GEONEX_RESEARCH=off) ou échouer : le
scénario indique alors explicitement que le contexte n'a pas été vérifié.
"""
from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from typing import Optional

import httpx

from .models import Fact, SourceRef

TIMEOUT = 8.0


def user_agent() -> str:
    """Politique Wikimedia : User-Agent descriptif avec contact de l'exploitant
    (URL ou adresse). À définir via GEONEX_RESEARCH_CONTACT avant usage réel."""
    contact = os.environ.get("GEONEX_RESEARCH_CONTACT", "").strip()
    return f"GEONEX/0.1 ({contact or 'contact non configure'}) python-httpx"


USER_AGENT = user_agent()


CACHE_TTL = 3600.0
_cache: dict[tuple, tuple[float, object]] = {}
_blocked_until: dict[str, float] = {}


def _blocked(service: str) -> Optional[str]:
    """Respecte la limitation de débit de Wikimedia : plus aucune requête tant que le délai n'est pas écoulé."""
    remaining = _blocked_until.get(service, 0.0) - time.time()
    if remaining > 0:
        return f"Recherche {service} suspendue (limite de débit atteinte) : nouvel essai possible dans {int(remaining // 60) + 1} min"
    return None


def _remember_throttle(exc: Exception, service: str) -> None:
    resp = getattr(exc, "response", None)
    if getattr(resp, "status_code", None) == 429:
        try:
            wait = float(resp.headers.get("retry-after", "600"))
        except ValueError:
            wait = 600.0
        _blocked_until[service] = time.time() + min(wait, 3600.0)


def _cached(key: tuple):
    hit = _cache.get(key)
    return hit[1] if hit and time.time() - hit[0] < CACHE_TTL else None


def _explain(exc: Exception, service: str) -> str:
    status = getattr(getattr(exc, "response", None), "status_code", None)
    if status == 429:
        return f"Recherche {service} limitée par le service (429) : réessayez plus tard"
    if status == 403:
        hint = "" if os.environ.get("GEONEX_RESEARCH_CONTACT") else " — définissez GEONEX_RESEARCH_CONTACT (URL ou adresse de contact exigée par la politique User-Agent de Wikimedia)"
        return f"Recherche {service} refusée (403){hint}"
    return f"Recherche {service} indisponible : {exc.__class__.__name__}"


def enabled() -> bool:
    return os.environ.get("GEONEX_RESEARCH", "on").lower() not in {"off", "0", "false", "no"}


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


class ResearchResult:
    def __init__(self) -> None:
        self.facts: list[Fact] = []
        self.sources: list[SourceRef] = []
        self.leaders: dict[str, tuple[str, SourceRef]] = {}
        self.errors: list[str] = []
        self.summary: Optional[str] = None


def wikipedia_context(query: str, lang: str = "fr") -> tuple[Optional[str], Optional[SourceRef], Optional[str]]:
    """Retourne (extrait, source, erreur) pour l'article le plus pertinent."""
    if (msg := _blocked("Wikipédia")):
        return None, None, msg
    if (hit := _cached(("wp", query, lang))):
        return hit
    try:
        with httpx.Client(timeout=TIMEOUT, headers={"User-Agent": user_agent()}) as client:
            search = client.get(
                f"https://{lang}.wikipedia.org/w/api.php",
                params={"action": "query", "list": "search", "srsearch": query, "format": "json", "srlimit": 1},
            )
            search.raise_for_status()
            hits = search.json().get("query", {}).get("search", [])
            if not hits:
                return None, None, "Aucun article Wikipédia correspondant."
            title = hits[0]["title"]
            summary = client.get(f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title.replace(' ', '_')}")
            summary.raise_for_status()
            data = summary.json()
            extract = data.get("extract")
            url = data.get("content_urls", {}).get("desktop", {}).get("page")
            src = SourceRef(status="confirmed", label=f"Wikipédia — {title}", url=url, retrieved_at=_now())
            _cache[("wp", query, lang)] = (time.time(), (extract, src, None))
            return extract, src, None
    except Exception as exc:  # réseau indisponible, quota, format inattendu
        _remember_throttle(exc, "Wikipédia")
        return None, None, _explain(exc, "Wikipédia")


_SPARQL = """
SELECT ?iso ?roleLabel ?personLabel ?start WHERE {
  VALUES ?iso { %s }
  ?country wdt:P298 ?iso .
  { ?country p:P35 ?st . ?st ps:P35 ?person . BIND("Chef de l'État" AS ?roleLabel) }
  UNION
  { ?country p:P6 ?st . ?st ps:P6 ?person . BIND("Chef du gouvernement" AS ?roleLabel) }
  FILTER NOT EXISTS { ?st pq:P582 ?end . }
  OPTIONAL { ?st pq:P580 ?start . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
}
"""


def latest_leaders(rows: list[dict]) -> dict[str, list[tuple[str, str]]]:
    """Plusieurs mandats « sans fin » peuvent coexister dans Wikidata : on garde le plus récent par fonction."""
    latest: dict[tuple[str, str], tuple[str, str]] = {}
    for row in rows:
        iso, role = row["iso"]["value"], row["roleLabel"]["value"]
        start = row.get("start", {}).get("value", "")
        if (iso, role) not in latest or start > latest[(iso, role)][0]:
            latest[(iso, role)] = (start, row["personLabel"]["value"])
    leaders: dict[str, list[tuple[str, str]]] = {}
    for (iso, role), (_, person) in latest.items():
        leaders.setdefault(iso, []).append((role, person))
    return leaders


def wikidata_leaders(iso3_codes: list[str]) -> tuple[dict[str, list[tuple[str, str]]], Optional[SourceRef], Optional[str]]:
    if not iso3_codes:
        return {}, None, None
    if (msg := _blocked("Wikidata")):
        return {}, None, msg
    key = ("wd", tuple(sorted(iso3_codes)))
    if (hit := _cached(key)):
        return hit
    values = " ".join(f'"{code}"' for code in iso3_codes)
    try:
        with httpx.Client(timeout=TIMEOUT + 4, headers={"User-Agent": user_agent(), "Accept": "application/sparql-results+json"}) as client:
            resp = client.get("https://query.wikidata.org/sparql", params={"query": _SPARQL % values, "format": "json"})
            resp.raise_for_status()
            rows = resp.json().get("results", {}).get("bindings", [])
    except Exception as exc:
        _remember_throttle(exc, "Wikidata")
        return {}, None, _explain(exc, "Wikidata")
    src = SourceRef(status="confirmed", label="Wikidata — chefs d'État et de gouvernement en fonction", url="https://query.wikidata.org/", retrieved_at=_now())
    result = (latest_leaders(rows), src, None)
    _cache[key] = (time.time(), result)
    return result


def research_contemporary(topic: str, iso3_codes: list[str]) -> ResearchResult:
    result = ResearchResult()
    if not enabled():
        result.errors.append("Recherche externe désactivée (GEONEX_RESEARCH=off) : contexte non vérifié.")
        return result
    extract, src, err = wikipedia_context(topic)
    if err:
        result.errors.append(err)
    if extract and src:
        result.summary = extract
        result.sources.append(src)
        result.facts.append(Fact(text=extract[:600], source=src))
    leaders, lsrc, lerr = wikidata_leaders(iso3_codes)
    if lerr:
        result.errors.append(lerr)
    if lsrc:
        result.sources.append(lsrc)
        for iso, entries in leaders.items():
            state = next((name for role, name in entries if role == "Chef de l'État"), None)
            gov = next((name for role, name in entries if role == "Chef du gouvernement"), None)
            label = state if not gov or gov == state else f"{state} (chef de l'État), {gov} (gouvernement)" if state else gov
            if label:
                result.leaders[iso] = (label, lsrc)
    return result
