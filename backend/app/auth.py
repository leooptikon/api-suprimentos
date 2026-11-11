import base64
import hashlib
import hmac
import os
import secrets
from datetime import timedelta

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from . import models
from .db import get_db
from .models import agora

COOKIE = "suprimentos_sessao"
DURACAO = timedelta(days=int(os.getenv("SESSAO_DIAS", "14")))
# Em produção atrás de HTTPS, defina COOKIE_SEGURO=1
COOKIE_SEGURO = os.getenv("COOKIE_SEGURO", "0") == "1"

_SCRYPT = {"n": 2**14, "r": 8, "p": 1}


# ---------- Senhas (scrypt da biblioteca padrão) ----------
def gerar_hash(senha: str) -> str:
    sal = secrets.token_bytes(16)
    dk = hashlib.scrypt(senha.encode(), salt=sal, dklen=32, **_SCRYPT)
    return f"scrypt${base64.b64encode(sal).decode()}${base64.b64encode(dk).decode()}"


def conferir_senha(senha: str, armazenado: str | None) -> bool:
    if not armazenado:
        return False
    try:
        _, sal_b64, dk_b64 = armazenado.split("$")
        dk = hashlib.scrypt(senha.encode(), salt=base64.b64decode(sal_b64), dklen=32, **_SCRYPT)
        return hmac.compare_digest(dk, base64.b64decode(dk_b64))
    except ValueError:
        return False


# Usado quando o usuário não existe, para o tempo de resposta não revelar quais usuários são válidos
_HASH_FALSO = gerar_hash(secrets.token_hex(8))


# ---------- Sessões ----------
def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def abrir_sessao(db: Session, pessoa: models.Pessoa, resposta: Response) -> None:
    token = secrets.token_urlsafe(32)
    db.execute(delete(models.Sessao).where(models.Sessao.expira_em < agora()))
    db.add(models.Sessao(token_hash=_hash_token(token), pessoa_id=pessoa.id, expira_em=agora() + DURACAO))
    db.commit()
    resposta.set_cookie(
        COOKIE,
        token,
        max_age=int(DURACAO.total_seconds()),
        httponly=True,
        samesite="lax",
        secure=COOKIE_SEGURO,
        path="/",
    )


def fechar_sessao(db: Session, request: Request, resposta: Response) -> None:
    token = request.cookies.get(COOKIE)
    if token:
        db.execute(delete(models.Sessao).where(models.Sessao.token_hash == _hash_token(token)))
        db.commit()
    resposta.delete_cookie(COOKIE, path="/")


def encerrar_sessoes_de(db: Session, pessoa_id: int) -> None:
    db.execute(delete(models.Sessao).where(models.Sessao.pessoa_id == pessoa_id))


# ---------- Dependências ----------
def usuario_atual(request: Request, db: Session = Depends(get_db)) -> models.Pessoa:
    token = request.cookies.get(COOKIE)
    if token:
        sessao = db.scalar(select(models.Sessao).where(models.Sessao.token_hash == _hash_token(token)))
        if sessao and sessao.expira_em > agora() and sessao.pessoa.tem_acesso:
            return sessao.pessoa
    raise HTTPException(401, "Faça login para continuar")


def admin_requerido(usuario: models.Pessoa = Depends(usuario_atual)) -> models.Pessoa:
    if usuario.papel != "admin":
        raise HTTPException(403, "Apenas administradores podem fazer isso")
    return usuario
