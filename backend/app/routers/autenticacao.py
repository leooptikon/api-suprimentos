import threading
import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import auth, models, schemas
from ..db import get_db

router = APIRouter(prefix="/api/auth", tags=["Autenticação"])

# ---------- Proteção contra tentativa de senha em massa (o site também fica aberto na internet) ----------
# Depois de MAX_ERROS senhas erradas em JANELA segundos, o usuário e o IP ficam bloqueados até a janela passar.
# Fica na memória do processo (o site roda com 1 worker); reiniciar o container zera a contagem.
MAX_ERROS = 5
JANELA = 15 * 60
_erros: dict[str, deque] = defaultdict(deque)
_trava = threading.Lock()


def _chaves(request: Request, usuario: str) -> list[str]:
    ip = request.client.host if request.client else "?"
    return [f"ip:{ip}", f"usuario:{usuario}"]


def _bloqueado(chaves: list[str]) -> int:
    """Segundos que faltam para liberar (0 = liberado)."""
    agora = time.monotonic()
    with _trava:
        falta = 0
        for c in chaves:
            fila = _erros.get(c)
            while fila and agora - fila[0] > JANELA:
                fila.popleft()
            if fila and len(fila) >= MAX_ERROS:
                falta = max(falta, int(JANELA - (agora - fila[0])) + 1)
        return falta


def _anotar_erro(chaves: list[str]):
    with _trava:
        for c in chaves:
            _erros[c].append(time.monotonic())


def _existe_admin(db: Session) -> bool:
    return db.scalar(
        select(models.Pessoa.id).where(
            models.Pessoa.papel == "admin", models.Pessoa.ativo.is_(True), models.Pessoa.senha_hash.is_not(None)
        )
    ) is not None


@router.get("/estado", response_model=schemas.EstadoAuth)
def estado(db: Session = Depends(get_db)):
    """`configurado=false` enquanto não existir nenhum administrador (primeiro acesso)."""
    return schemas.EstadoAuth(configurado=_existe_admin(db))


@router.post("/configurar", response_model=schemas.UsuarioOut, status_code=201)
def configurar(dados: schemas.ConfigurarIn, resposta: Response, db: Session = Depends(get_db)):
    """Cria o primeiro administrador. Só funciona enquanto não houver nenhum."""
    if _existe_admin(db):
        raise HTTPException(409, "O sistema já foi configurado. Faça login.")
    pessoa = db.scalar(select(models.Pessoa).where(func.lower(models.Pessoa.nome) == dados.nome.lower()))
    if pessoa is None:
        pessoa = models.Pessoa(nome=dados.nome)
        db.add(pessoa)
    pessoa.usuario, pessoa.papel, pessoa.ativo = dados.usuario, "admin", True
    pessoa.senha_hash = auth.gerar_hash(dados.senha)
    db.commit()
    auth.abrir_sessao(db, pessoa, resposta)
    return pessoa


@router.post("/login", response_model=schemas.UsuarioOut)
def login(dados: schemas.LoginIn, request: Request, resposta: Response, db: Session = Depends(get_db)):
    usuario = dados.usuario.strip().lower()
    chaves = _chaves(request, usuario)
    if falta := _bloqueado(chaves):
        minutos = max(1, round(falta / 60))
        raise HTTPException(429, f"Muitas tentativas erradas. Tente de novo em {minutos} min.")
    pessoa = db.scalar(select(models.Pessoa).where(models.Pessoa.usuario == usuario))
    senha_ok = auth.conferir_senha(dados.senha, pessoa.senha_hash if pessoa else auth._HASH_FALSO)
    if not pessoa or not senha_ok or not pessoa.tem_acesso:
        _anotar_erro(chaves)
        raise HTTPException(401, "Usuário ou senha incorretos")
    with _trava:
        _erros.pop(chaves[1], None)  # acertou: zera a contagem desse usuário
    auth.abrir_sessao(db, pessoa, resposta)
    return pessoa


@router.post("/logout", status_code=204)
def logout(request: Request, db: Session = Depends(get_db)):
    resposta = Response(status_code=204)
    auth.fechar_sessao(db, request, resposta)
    return resposta


@router.get("/eu", response_model=schemas.UsuarioOut)
def eu(usuario: models.Pessoa = Depends(auth.usuario_atual)):
    return usuario


@router.post("/senha", status_code=204)
def trocar_senha(
    dados: schemas.TrocarSenhaIn,
    request: Request,
    usuario: models.Pessoa = Depends(auth.usuario_atual),
    db: Session = Depends(get_db),
):
    if not auth.conferir_senha(dados.atual, usuario.senha_hash):
        raise HTTPException(422, "A senha atual está incorreta")
    usuario = db.merge(usuario)
    usuario.senha_hash = auth.gerar_hash(dados.nova)
    # Derruba as outras sessões, mantendo só a atual
    atual = auth._hash_token(request.cookies.get(auth.COOKIE, ""))
    db.query(models.Sessao).filter(models.Sessao.pessoa_id == usuario.id, models.Sessao.token_hash != atual).delete()
    db.commit()
    return Response(status_code=204)
