"""Couche de recherche externe (gratuite, sans clé) avec traçabilité.

- Wikipédia (FR) : contexte de la crise, avec URL et date de consultation.
- Wikidata : chefs d'État / de gouvernement des pays identifiés.

La recherche peut être désactivée (GEONEX_RESEARCH=off) ou échouer : le
scénario indique alors explicitement que le contexte n'a pas été vérifié.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

import httpx

from .models import Fact, SourceRef

USER_AGENT = "GEONEX/0.1 (simulation geopolitique; contact: projet local de developpement)"
TIMEOUT = 8.0


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
    try:
        with httpx.Client(timeout=TIMEOUT, headers={"User-Agent": USER_AGENT}) as client:
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
            return extract, src, None
    except Exception as exc:  # réseau indisponible, quota, format inattendu
        return None, None, f"Recherche Wikipédia indisponible : {exc.__class__.__name__}"


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


def wikidata_leaders(iso3_codes: list[str]) -> tuple[dict[str, list[tuple[str, str]]], Optional[SourceRef], Optional[str]]:
    if not iso3_codes:
        return {}, None, None
    values = " ".join(f'"{code}"' for code in iso3_codes)
    try:
        with httpx.Client(timeout=TIMEOUT + 4, headers={"User-Agent": USER_AGENT, "Accept": "application/sparql-results+json"}) as client:
            resp = client.get("https://query.wikidata.org/sparql", params={"query": _SPARQL % values, "format": "json"})
            resp.raise_for_status()
            rows = resp.json().get("results", {}).get("bindings", [])
    except Exception as exc:
        return {}, None, f"Recherche Wikidata indisponible : {exc.__class__.__name__}"
    leaders: dict[str, list[tuple[str, str]]] = {}
    for row in rows:
        iso = row["iso"]["value"]
        leaders.setdefault(iso, []).append((row["roleLabel"]["value"], row["personLabel"]["value"]))
    src = SourceRef(status="confirmed", label="Wikidata — chefs d'État et de gouvernement en fonction", url="https://query.wikidata.org/", retrieved_at=_now())
    return leaders, src, None


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
