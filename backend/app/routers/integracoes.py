from datetime import datetime, timedelta

from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import mercadolivre as ml
from .. import models
from ..auth import admin_requerido, usuario_atual
from ..db import get_db
from ..models import agora

router = APIRouter(prefix="/api/mercadolivre", tags=["Mercado Livre"], dependencies=[Depends(usuario_atual)])
ADMIN = [Depends(admin_requerido)]


class ExecucaoOut(BaseModel):
    id: int
    automatica: bool
    inicio: datetime
    fim: datetime | None
    anuncios: int
    atualizados: int
    falhas: int
    mensagem: str | None


class StatusOut(BaseModel):
    configurado: bool
    conectado: bool
    renovacao_automatica: bool
    expira_em: datetime | None
    nickname: str | None
    conectado_em: datetime | None
    redirect_uri: str | None
    horario: str
    proxima_execucao: datetime | None
    ultima: ExecucaoOut | None
    anuncios_monitorados: int
    # O refresh token vale 6 meses; avisamos quando estiver perto de vencer
    reconectar_ate: datetime | None


class ConcluirIn(BaseModel):
    codigo_ou_url: str = Field(min_length=4, max_length=2000)


class PontoPreco(BaseModel):
    vinculo_id: int
    fornecedor_nome: str
    preco: float
    frete_gratis: bool | None
    situacao: str | None
    titulo: str | None
    coletado_em: datetime


def _execucao(e: models.ExecucaoColeta | None) -> ExecucaoOut | None:
    return ExecucaoOut.model_validate(e, from_attributes=True) if e else None


@router.get("/status", response_model=StatusOut)
def status(db: Session = Depends(get_db)):
    reg = db.get(models.IntegracaoML, 1)
    conectado = ml.conectado(reg)
    ultima = db.scalar(select(models.ExecucaoColeta).order_by(models.ExecucaoColeta.id.desc()).limit(1))
    urls = db.scalars(
        select(models.ProdutoFornecedor.url)
        .join(models.Produto)
        .where(models.Produto.arquivado.is_(False), models.ProdutoFornecedor.url.is_not(None))
    )
    return StatusOut(
        configurado=ml.configurado(),
        conectado=conectado,
        renovacao_automatica=bool(reg and reg.refresh_token),
        expira_em=reg.expira_em if conectado and reg and not reg.refresh_token else None,
        nickname=reg.nickname if reg else None,
        conectado_em=reg.conectado_em if reg else None,
        redirect_uri=ml.REDIRECT_URI or None,
        horario=ml.HORARIO,
        proxima_execucao=ml.proxima_execucao() if conectado else None,
        ultima=_execucao(ultima),
        anuncios_monitorados=sum(1 for u in urls if ml.extrair_id(u)),
        reconectar_ate=reg.conectado_em + timedelta(days=180) if reg and reg.refresh_token and reg.conectado_em else None,
    )


@router.post("/conectar", dependencies=ADMIN)
def conectar(db: Session = Depends(get_db)):
    """Gera o endereço de autorização. O admin abre, entra com a conta da empresa e autoriza."""
    try:
        return {"url": ml.url_autorizacao(db)}
    except ml.ErroML as e:
        raise HTTPException(409, str(e))


@router.post("/concluir", response_model=StatusOut, dependencies=ADMIN)
def concluir(dados: ConcluirIn, db: Session = Depends(get_db)):
    """Recebe o endereço para onde o Mercado Livre redirecionou (ou só o código) e troca por tokens."""
    try:
        code, state = ml.extrair_code(dados.codigo_ou_url)
        ml.concluir_autorizacao(db, code, state)
    except ml.ErroML as e:
        raise HTTPException(422, str(e))
    return status(db)


@router.get("/callback", include_in_schema=False, dependencies=ADMIN)
def callback(code: str, state: str | None = None, db: Session = Depends(get_db)):
    """Quando o ML_REDIRECT_URI aponta para este servidor, o Mercado Livre volta direto para cá
    e mandamos a pessoa de volta para a tela de integrações."""
    try:
        ml.concluir_autorizacao(db, code, state)
    except ml.ErroML as e:
        return RedirectResponse(f"/integracoes?{urlencode({'erro': str(e)})}", status_code=303)
    return RedirectResponse("/integracoes?conectado=1", status_code=303)


@router.post("/desconectar", status_code=204, dependencies=ADMIN)
def desconectar(db: Session = Depends(get_db)):
    ml.desconectar(db)


@router.post("/atualizar", response_model=ExecucaoOut, dependencies=ADMIN)
def atualizar(db: Session = Depends(get_db)):
    try:
        return _execucao(ml.atualizar_precos(db, automatica=False))
    except ml.ErroML as e:
        raise HTTPException(409, str(e))


@router.get("/historico/{produto_id}", response_model=list[PontoPreco])
def historico(produto_id: int, dias: int = 90, db: Session = Depends(get_db)):
    linhas = db.execute(
        select(models.PrecoColetado, models.Fornecedor.nome)
        .join(models.ProdutoFornecedor, models.ProdutoFornecedor.id == models.PrecoColetado.vinculo_id)
        .join(models.Fornecedor)
        .where(
            models.PrecoColetado.produto_id == produto_id,
            models.PrecoColetado.coletado_em >= agora() - timedelta(days=min(dias, 730)),
        )
        .order_by(models.PrecoColetado.coletado_em)
    )
    return [
        PontoPreco(
            vinculo_id=p.vinculo_id,
            fornecedor_nome=nome,
            preco=p.preco,
            frete_gratis=p.frete_gratis,
            situacao=p.situacao,
            titulo=p.titulo,
            coletado_em=p.coletado_em,
        )
        for p, nome in linhas
    ]
