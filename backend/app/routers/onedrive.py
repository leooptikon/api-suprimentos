from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import models
from .. import onedrive as od
from ..auth import admin_requerido, usuario_atual
from ..db import get_db

router = APIRouter(prefix="/api/onedrive", tags=["OneDrive"], dependencies=[Depends(usuario_atual)])
ADMIN = [Depends(admin_requerido)]


class LoginPendente(BaseModel):
    codigo: str
    link: str
    expira_em: datetime


class StatusOut(BaseModel):
    configurado: bool
    conectado: bool
    conta: str | None
    nome_conta: str | None
    conectado_em: datetime | None
    login_pendente: LoginPendente | None
    destino_definido: bool
    pasta_nome: str | None
    pasta_url: str | None
    arquivo_nome: str | None
    arquivo_url: str | None
    ultimo_envio: datetime | None
    ultima_tentativa: datetime | None
    erro: str | None
    intervalo_segundos: int


class PastaIn(BaseModel):
    link: str = Field(min_length=8, max_length=2000)


@router.get("/status", response_model=StatusOut)
def status(db: Session = Depends(get_db)):
    reg = db.get(models.IntegracaoOneDrive, 1)
    pendente = od.login_pendente(reg)
    return StatusOut(
        configurado=od.configurado(),
        conectado=od.conectado(reg),
        conta=reg.conta if reg else None,
        nome_conta=reg.nome_conta if reg else None,
        conectado_em=reg.conectado_em if reg else None,
        login_pendente=LoginPendente(codigo=reg.codigo_usuario, link=reg.link_verificacao, expira_em=reg.codigo_expira_em)
        if pendente
        else None,
        destino_definido=od.destino_definido(reg),
        pasta_nome=reg.pasta_nome if reg else None,
        pasta_url=reg.pasta_url if reg else None,
        arquivo_nome=reg.arquivo_nome if reg else None,
        arquivo_url=reg.arquivo_url if reg else None,
        ultimo_envio=reg.ultimo_envio if reg else None,
        ultima_tentativa=reg.ultima_tentativa if reg else None,
        erro=reg.erro if reg else None,
        intervalo_segundos=od.INTERVALO,
    )


@router.post("/conectar", response_model=StatusOut, dependencies=ADMIN)
def conectar(db: Session = Depends(get_db)):
    """Gera o código para digitar em microsoft.com/devicelogin."""
    try:
        od.iniciar_login(db)
    except od.ErroOneDrive as e:
        raise HTTPException(409, str(e))
    return status(db)


@router.post("/verificar", response_model=StatusOut, dependencies=ADMIN)
def verificar(db: Session = Depends(get_db)):
    """A tela chama a cada poucos segundos enquanto mostra o código; `conectado` vira true quando a pessoa entrar."""
    try:
        od.verificar_login(db)
    except od.ErroOneDrive as e:
        raise HTTPException(422, str(e))
    return status(db)


@router.post("/pasta", response_model=StatusOut, dependencies=ADMIN)
def pasta(dados: PastaIn, db: Session = Depends(get_db)):
    """Define a pasta pelo link e já envia a planilha (se o envio falhar, o motivo vem em `erro`)."""
    try:
        od.definir_destino(db, dados.link)
    except od.ErroOneDrive as e:
        raise HTTPException(422, str(e))
    return status(db)


@router.post("/sincronizar", response_model=StatusOut, dependencies=ADMIN)
def sincronizar(db: Session = Depends(get_db)):
    try:
        od.sincronizar(db, forcar=True)
    except od.ErroOneDrive as e:
        raise HTTPException(409, str(e))
    return status(db)


@router.post("/desconectar", status_code=204, dependencies=ADMIN)
def desconectar(db: Session = Depends(get_db)):
    od.desconectar(db)
