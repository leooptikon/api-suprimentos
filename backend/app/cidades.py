"""Busca de cidades do Brasil, sem internet.

A lista (cidades.csv) tem os 5.571 municípios do IBGE com coordenadas — fonte pública:
github.com/kelvins/municipios-brasileiros. Antes a busca usava o Nominatim (OpenStreetMap),
mas ele costuma bloquear servidores na nuvem (como o Render), e aí nenhuma cidade era achada.
"""

import csv
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

ARQUIVO = Path(__file__).with_name("cidades.csv")

UFS = {
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
    "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
}


def normalizar(texto: str) -> str:
    """ "São  Paulo-SP" → "sao paulo sp" (sem acento, minúsculo, só letras/números)."""
    t = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", t).split())


@lru_cache(maxsize=1)
def _lista() -> list[tuple[str, str, float, float, bool, str]]:
    """(nome, uf, lat, lng, capital, nome normalizado) — lido uma vez só."""
    with ARQUIVO.open(encoding="utf-8") as f:
        return [
            (r["nome"], r["uf"], float(r["lat"]), float(r["lng"]), r["capital"] == "1", normalizar(r["nome"]))
            for r in csv.DictReader(f)
        ]


def buscar(q: str, limite: int = 6) -> list[dict]:
    """Cidades que combinam com o texto. Aceita "sao paulo", "Macaé, RJ", "rio de janeiro rj"."""
    palavras = normalizar(q).split()
    uf = None
    if len(palavras) > 1 and palavras[-1].upper() in UFS:  # última palavra é a sigla do estado
        uf = palavras.pop().upper()
    alvo = " ".join(palavras)
    if not alvo:
        return []

    achados = []
    for nome, sigla, lat, lng, capital, norm in _lista():
        if uf and sigla != uf:
            continue
        if norm == alvo:
            nota = 0  # nome igual
        elif norm.startswith(alvo):
            nota = 1  # começa com o texto
        elif (" " + norm).find(" " + alvo) >= 0:
            nota = 2  # alguma palavra começa com o texto
        elif alvo in norm:
            nota = 3  # aparece no meio
        else:
            continue
        # capitais primeiro em cada grupo; depois os nomes mais curtos
        achados.append(((nota, not capital, len(norm), nome), nome, sigla, lat, lng))

    achados.sort(key=lambda a: a[0])
    return [
        {"nome": f"{nome}, {sigla}, Brasil", "curto": f"{nome}, {sigla}", "lat": lat, "lng": lng}
        for _, nome, sigla, lat, lng in achados[:limite]
    ]
