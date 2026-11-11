"""Integração com a API oficial do Mercado Livre (grátis).

Fluxo:
1. Um administrador conecta a conta (OAuth "authorization_code" com PKCE).
2. O access token dura 6 h; o refresh token dura 6 meses, é de USO ÚNICO e vem um novo a cada renovação.
3. Uma vez por dia (e pelo botão "Atualizar agora") lemos o preço de cada anúncio cujo link está
   cadastrado no fornecedor de um produto, via /items/bulk.

A API não oferece mais busca geral por palavra-chave (/sites/MLB/search?q= exige filtro de vendedor),
por isso o monitoramento é pelo link do anúncio que vocês já usam para comprar.
"""

import base64
import hashlib
import json
import logging
import os
import re
import secrets
import threading
import time
from typing import NamedTuple
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from . import models
from .models import agora
from .planilhas import FUSO

log = logging.getLogger("suprimentos.mercadolivre")

API = os.getenv("ML_API_URL", "https://api.mercadolibre.com")  # trocável só para testes locais
AUTH = "https://auth.mercadolivre.com.br/authorization"

CLIENT_ID = os.getenv("ML_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("ML_CLIENT_SECRET", "")
REDIRECT_URI = os.getenv("ML_REDIRECT_URI", "")
HORARIO = os.getenv("ML_HORARIO", "07:00")  # hora local (TZ_ESCRITORIO) da atualização diária


class ErroML(Exception):
    pass


def configurado() -> bool:
    return bool(CLIENT_ID and CLIENT_SECRET and REDIRECT_URI)


# ---------- Links de anúncio ----------
_ITEM_PARAM = re.compile(r"(?:item_id|wid)[=:](MLB-?\d+)", re.I)
_CATALOGO = re.compile(r"/p/(MLB\d+)", re.I)
_ITEM = re.compile(r"MLB-?(\d{6,})", re.I)


class Ref(NamedTuple):
    """produto: id do catálogo (/p/MLB…); item: anúncio específico escolhido (pode ser None)."""

    produto: str | None
    item: str | None


def extrair_id(url: str | None) -> Ref | None:
    """Identifica o link. None se não for do Mercado Livre ou não apontar para um produto/anúncio."""
    if not url or not re.search(r"mercadoli(vre|bre)\.com", url, re.I):
        return None
    alvo = urllib.parse.unquote(url)
    item = m.group(1).upper().replace("-", "") if (m := _ITEM_PARAM.search(alvo)) else None
    if m := _CATALOGO.search(alvo):
        return Ref(m.group(1).upper(), item)
    if item:
        return Ref(None, item)
    if m := _ITEM.search(alvo):
        return Ref(None, f"MLB{m.group(1)}")
    return None


# ---------- HTTP (biblioteca padrão; sem dependências extras) ----------
def _http(metodo: str, caminho: str, token: str | None = None, form: dict | None = None) -> dict | list:
    dados = urllib.parse.urlencode(form).encode() if form else None
    req = urllib.request.Request(API + caminho, data=dados, method=metodo)
    req.add_header("Accept", "application/json")
    if form:
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        corpo = e.read().decode(errors="replace")[:300]
        try:
            msg = json.loads(corpo).get("message") or corpo
        except ValueError:
            msg = corpo
        raise ErroML(f"Mercado Livre respondeu {e.code}: {msg}") from e
    except urllib.error.URLError as e:
        raise ErroML(f"Sem conexão com o Mercado Livre: {e.reason}") from e


# ---------- OAuth ----------
def _integracao(db: Session) -> models.IntegracaoML:
    reg = db.get(models.IntegracaoML, 1)
    if not reg:
        reg = models.IntegracaoML(id=1)
        db.add(reg)
        db.flush()
    return reg


def url_autorizacao(db: Session) -> str:
    if not configurado():
        raise ErroML("Integração não configurada no servidor (ML_CLIENT_ID, ML_CLIENT_SECRET e ML_REDIRECT_URI)")
    reg = _integracao(db)
    reg.estado_pendente = secrets.token_urlsafe(24)
    reg.verificador_pendente = secrets.token_urlsafe(64)[:96]
    desafio = base64.urlsafe_b64encode(hashlib.sha256(reg.verificador_pendente.encode()).digest()).rstrip(b"=").decode()
    db.commit()
    return AUTH + "?" + urllib.parse.urlencode(
        {
            "response_type": "code",
            "client_id": CLIENT_ID,
            "redirect_uri": REDIRECT_URI,
            "state": reg.estado_pendente,
            "code_challenge": desafio,
            "code_challenge_method": "S256",
        }
    )


def concluir_autorizacao(db: Session, code: str, state: str | None) -> models.IntegracaoML:
    reg = _integracao(db)
    if not reg.verificador_pendente:
        raise ErroML("Nenhuma conexão em andamento. Clique em “Conectar” de novo.")
    if state is not None and state != reg.estado_pendente:
        raise ErroML("A resposta do Mercado Livre não corresponde a esta conexão. Clique em “Conectar” de novo.")
    resp = _http(
        "POST",
        "/oauth/token",
        form={
            "grant_type": "authorization_code",
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "code": code,
            "redirect_uri": REDIRECT_URI,
            "code_verifier": reg.verificador_pendente,
        },
    )
    _guardar_tokens(reg, resp)
    reg.estado_pendente = reg.verificador_pendente = None
    reg.conectado_em = agora()
    try:
        eu = _http("GET", "/users/me", token=reg.access_token)
        reg.nickname = eu.get("nickname")
    except ErroML:
        pass
    db.commit()
    return reg


def extrair_code(texto: str) -> tuple[str, str | None]:
    """Aceita o código puro (TG-…) ou o endereço inteiro para onde o Mercado Livre redirecionou."""
    texto = texto.strip()
    if texto.startswith("http"):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(texto).query)
        if "code" not in q:
            raise ErroML("Esse endereço não tem o código de autorização (parâmetro “code”)")
        return q["code"][0], q.get("state", [None])[0]
    return texto, None


def _guardar_tokens(reg: models.IntegracaoML, resp: dict):
    reg.access_token = resp["access_token"]
    reg.refresh_token = resp.get("refresh_token") or reg.refresh_token
    reg.expira_em = agora() + timedelta(seconds=int(resp.get("expires_in", 21600)))
    reg.ml_user_id = resp.get("user_id") or reg.ml_user_id


_trava_token = threading.Lock()


def conectado(reg: models.IntegracaoML | None) -> bool:
    """Com refresh token a conexão se renova sozinha; sem ele (app sem "acesso offline") vale só até o token expirar."""
    if not reg:
        return False
    return bool(reg.refresh_token or (reg.access_token and reg.expira_em and reg.expira_em > agora()))


def token_valido(db: Session) -> str:
    """Devolve um access token válido, renovando se faltar menos de 10 min.

    A trava evita duas renovações simultâneas: o refresh token é de uso único e a segunda falharia.
    """
    with _trava_token:
        reg = _integracao(db)
        margem = timedelta(minutes=10) if reg.refresh_token else timedelta(0)
        if reg.access_token and reg.expira_em and reg.expira_em - agora() > margem:
            return reg.access_token
        if not reg.refresh_token:
            raise ErroML(
                "A conexão com o Mercado Livre expirou. Conecte de novo "
                "(ative “acesso offline” na aplicação para que ela se renove sozinha)"
            )
        resp = _http(
            "POST",
            "/oauth/token",
            form={
                "grant_type": "refresh_token",
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "refresh_token": reg.refresh_token,
            },
        )
        _guardar_tokens(reg, resp)
        db.commit()  # grava o novo refresh token imediatamente: o antigo já não vale
        return reg.access_token


def desconectar(db: Session):
    reg = _integracao(db)
    reg.access_token = reg.refresh_token = reg.expira_em = reg.ml_user_id = reg.nickname = None
    reg.conectado_em = reg.estado_pendente = reg.verificador_pendente = None
    db.commit()


# ---------- Leitura de preços ----------
# Testado na API real (nov/2026): /items/{id} e /items/bulk devolvem 403 para anúncios de OUTROS vendedores.
# O que funciona é a lista de ofertas do produto de catálogo: /products/{id}/items (preço, frete, vendedor).
SEM_CATALOGO = (
    "O Mercado Livre não libera o preço por este tipo de link. Abra o produto no site e copie o "
    "endereço da página dele (o que tem /p/MLB…)"
)


def _ofertas(token: str, produto_id: str) -> list[dict]:
    ofertas: list[dict] = []
    for offset in (0, 100, 200):  # até 300 vendedores é mais que suficiente
        resp = _http("GET", f"/products/{produto_id}/items?limit=100&offset={offset}", token=token)
        ofertas += resp.get("results") or []
        if len(ofertas) >= (resp.get("paging") or {}).get("total", 0):
            break
    return ofertas


def _ler(token: str, ref: Ref, nomes: dict[str, str]) -> dict:
    """Devolve {anuncio_id, titulo, preco, frete_gratis, situacao, ofertas}. Lança ErroML se não der."""
    if not ref.produto:
        raise ErroML(SEM_CATALOGO)
    ofertas = [o for o in _ofertas(token, ref.produto) if o.get("price") is not None]
    if not ofertas:
        raise ErroML("Nenhum vendedor com este produto à venda no momento")
    if ref.produto not in nomes:
        try:
            nomes[ref.produto] = (_http("GET", f"/products/{ref.produto}", token=token) or {}).get("name") or ""
        except ErroML:
            nomes[ref.produto] = ""
    escolhida = next((o for o in ofertas if o.get("item_id") == ref.item), None)
    situacao = "active"
    if escolhida is None:
        # Sem anúncio escolhido no link, ou o escolhido saiu do ar: usa a menor oferta (preferindo novos)
        escolhida = min(ofertas, key=lambda o: (o.get("condition") != "new", o["price"]))
        situacao = "outro_vendedor" if ref.item else "menor_oferta"
    return {
        "anuncio_id": escolhida.get("item_id") or ref.produto,
        "titulo": nomes[ref.produto] or None,
        "preco": float(escolhida["price"]),
        "frete_gratis": bool((escolhida.get("shipping") or {}).get("free_shipping")),
        "situacao": situacao,
    }


_trava_coleta = threading.Lock()


def atualizar_precos(db: Session, automatica: bool) -> models.ExecucaoColeta:
    """Atualiza o preço de todos os vínculos com link do Mercado Livre em produtos ativos."""
    if not _trava_coleta.acquire(blocking=False):
        raise ErroML("Já existe uma atualização em andamento")
    try:
        execucao = models.ExecucaoColeta(automatica=automatica)
        db.add(execucao)
        db.commit()
        vinculos = list(
            db.scalars(
                select(models.ProdutoFornecedor)
                .join(models.Produto)
                .where(models.Produto.arquivado.is_(False), models.ProdutoFornecedor.url.is_not(None))
                .options(joinedload(models.ProdutoFornecedor.produto))
            )
        )
        alvos = [(v, extrair_id(v.url)) for v in vinculos]
        alvos = [(v, ref) for v, ref in alvos if ref]
        execucao.anuncios = len(alvos)
        if not alvos:
            execucao.mensagem = "Nenhum link do Mercado Livre cadastrado nos fornecedores"
            execucao.fim = agora()
            db.commit()
            return execucao

        try:
            token = token_valido(db)
        except ErroML as e:
            execucao.mensagem = str(e)[:255]
            execucao.falhas = len(alvos)
            execucao.fim = agora()
            db.commit()
            return execucao

        nomes: dict[str, str] = {}
        for v, ref in alvos:
            try:
                dados = _ler(token, ref, nomes)
            except ErroML as e:
                v.erro_coleta = str(e)[:255]
                execucao.falhas += 1
                continue
            v.preco = dados["preco"]
            v.frete_gratis = dados["frete_gratis"]
            v.situacao_anuncio = dados["situacao"]
            v.preco_atualizado_em = agora()
            v.erro_coleta = None
            db.add(
                models.PrecoColetado(
                    vinculo_id=v.id,
                    produto_id=v.produto_id,
                    anuncio_id=dados["anuncio_id"],
                    titulo=(dados["titulo"] or "")[:255] or None,
                    preco=dados["preco"],
                    frete_gratis=dados["frete_gratis"],
                    situacao=dados["situacao"],
                )
            )
            execucao.atualizados += 1
        execucao.fim = agora()
        if execucao.falhas:
            execucao.mensagem = f"{execucao.falhas} anúncio(s) não puderam ser lidos"
        db.commit()
        return execucao
    finally:
        _trava_coleta.release()


# ---------- Agendamento diário (thread simples; sem dependências) ----------
def _ja_rodou_hoje(db: Session) -> bool:
    hoje = datetime.now(FUSO).date()
    inicio = datetime.combine(hoje, datetime.min.time(), tzinfo=FUSO)
    return (
        db.scalar(
            select(models.ExecucaoColeta.id).where(
                models.ExecucaoColeta.automatica.is_(True), models.ExecucaoColeta.inicio >= inicio
            )
        )
        is not None
    )


def proxima_execucao() -> datetime:
    h, m = (int(x) for x in HORARIO.split(":"))
    agora_local = datetime.now(FUSO)
    alvo = agora_local.replace(hour=h, minute=m, second=0, microsecond=0)
    return alvo if alvo > agora_local else alvo + timedelta(days=1)


def iniciar_agendador(fabrica_sessao):
    """Confere a cada 5 min se já passou do horário e se a rodada do dia ainda não aconteceu."""

    def laco():
        while True:
            try:
                h, m = (int(x) for x in HORARIO.split(":"))
                agora_local = datetime.now(FUSO)
                if (agora_local.hour, agora_local.minute) >= (h, m):
                    with fabrica_sessao() as db:
                        reg = db.get(models.IntegracaoML, 1)
                        if conectado(reg) and not _ja_rodou_hoje(db):
                            ex = atualizar_precos(db, automatica=True)
                            log.info("Coleta diária: %s de %s anúncios atualizados", ex.atualizados, ex.anuncios)
            except Exception:  # o agendador nunca pode morrer por causa de uma rodada com erro
                log.exception("Falha na coleta diária do Mercado Livre")
            time.sleep(300)

    threading.Thread(target=laco, name="coleta-mercadolivre", daemon=True).start()
