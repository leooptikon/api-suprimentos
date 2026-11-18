"""Onde ficam as fotos dos produtos.

- Sem SUPABASE_URL: no disco, em data/fotos (servidor do escritório, desenvolvimento).
- Com SUPABASE_URL + SUPABASE_SECRET_KEY: no Supabase Storage (bucket privado), porque na nuvem
  (Render) o disco é apagado a cada atualização. O site continua pedindo a foto ao backend,
  que busca no Storage — o bucket não precisa ser público.
"""

import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request

from .db import DATA_DIR, env

log = logging.getLogger(__name__)

# Aceita o endereço como o painel mostra em "Data API" (…supabase.co/rest/v1/) ou só o do projeto
SUPABASE_URL = env("SUPABASE_URL").rstrip("/").removesuffix("/rest/v1").rstrip("/")
SUPABASE_KEY = env("SUPABASE_SECRET_KEY")
BUCKET = os.getenv("SUPABASE_BUCKET_FOTOS", "fotos").strip() or "fotos"
NA_NUVEM = bool(SUPABASE_URL and SUPABASE_KEY)

PASTA = DATA_DIR / "fotos"
if not NA_NUVEM:
    PASTA.mkdir(parents=True, exist_ok=True)

_bucket_ok = False


class ErroFoto(Exception):
    pass


def _cabecalhos(extra: dict | None = None) -> dict:
    h = {"apikey": SUPABASE_KEY}
    # Chave antiga (JWT "service_role") também vai no Authorization; as novas (sb_secret_…) só no apikey
    if not SUPABASE_KEY.startswith("sb_"):
        h["Authorization"] = f"Bearer {SUPABASE_KEY}"
    return {**h, **(extra or {})}


def _req(metodo: str, caminho: str, corpo: bytes | None = None, tipo: str | None = None, extra: dict | None = None):
    req = urllib.request.Request(
        f"{SUPABASE_URL}/storage/v1/{caminho}",
        data=corpo,
        method=metodo,
        headers=_cabecalhos({**({"Content-Type": tipo} if tipo else {}), **(extra or {})}),
    )
    return urllib.request.urlopen(req, timeout=20)


def _garantir_bucket():
    """Cria o bucket privado na primeira vez (se já existir, segue)."""
    global _bucket_ok
    if _bucket_ok:
        return
    try:
        _req("POST", "bucket", json.dumps({"id": BUCKET, "name": BUCKET, "public": False}).encode(), "application/json")
    except urllib.error.HTTPError as e:
        corpo = e.read().decode(errors="replace")
        if e.code not in (400, 409) or "exist" not in corpo.lower():
            raise ErroFoto(f"Não foi possível preparar o armazenamento de fotos ({e.code})") from e
    _bucket_ok = True


def _objeto(nome: str) -> str:
    return f"object/{BUCKET}/{urllib.parse.quote(nome)}"


def salvar(nome: str, dados: bytes, mime: str):
    if not NA_NUVEM:
        (PASTA / nome).write_bytes(dados)
        return
    try:
        _garantir_bucket()
        _req("POST", _objeto(nome), dados, mime, {"x-upsert": "true", "cache-control": "31536000"}).read()
    except urllib.error.HTTPError as e:
        raise ErroFoto(f"Não foi possível guardar a foto ({e.code})") from e
    except urllib.error.URLError as e:
        raise ErroFoto("Não foi possível falar com o armazenamento de fotos") from e


def ler(nome: str) -> bytes | None:
    if not NA_NUVEM:
        arquivo = PASTA / nome
        return arquivo.read_bytes() if arquivo.is_file() else None
    try:
        with _req("GET", _objeto(nome)) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        if e.code in (400, 404):
            return None
        raise ErroFoto(f"Não foi possível buscar a foto ({e.code})") from e


def apagar(nome: str | None):
    if not nome:
        return
    if not NA_NUVEM:
        (PASTA / nome).unlink(missing_ok=True)
        return
    try:
        _req("DELETE", f"object/{BUCKET}", json.dumps({"prefixes": [nome]}).encode(), "application/json").read()
    except Exception:  # foto antiga que não sai do Storage não pode travar o cadastro
        log.warning("Não consegui apagar a foto antiga %s do Storage", nome)
