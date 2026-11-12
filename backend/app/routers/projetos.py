from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from .. import models
from .. import onedrive as od
from ..auth import admin_requerido, usuario_atual
from ..db import get_db
from ..schemas import StatusUnidade

router = APIRouter(prefix="/api/projetos", tags=["Projetos"], dependencies=[Depends(usuario_atual)])
ADMIN = [Depends(admin_requerido)]


class UnidadeNoProjeto(BaseModel):
    id: int
    numero_serie: str
    proprio_nome: str
    status: StatusUnidade


class ProjetoOut(BaseModel):
    id: int
    nome: str  # exatamente o nome da pasta: "21.40 - TM ENGENHARIA"
    url: str | None
    no_onedrive: bool  # False = a pasta sumiu do OneDrive (não aparece mais para escolher)
    unidades: list[UnidadeNoProjeto]


class OrigemOut(BaseModel):
    conectado: bool
    pasta_definida: bool
    pasta_nome: str | None
    pasta_url: str | None
    lidos_em: datetime | None
    erro: str | None


class LeituraOut(BaseModel):
    total: int
    novos: int
    renomeados: int
    sumiram: int


class PastaIn(BaseModel):
    link: str = Field(min_length=8, max_length=2000)


@router.get("", response_model=list[ProjetoOut])
def listar(db: Session = Depends(get_db)):
    projetos = sorted(db.scalars(select(models.Projeto)), key=lambda p: (od.chave_codigo(p.codigo), p.nome))
    unidades = db.scalars(
        select(models.Unidade)
        .where(models.Unidade.projeto_id.is_not(None))
        .options(joinedload(models.Unidade.proprio))
        .order_by(models.Unidade.numero_serie)
    )
    por_projeto: dict[int, list[UnidadeNoProjeto]] = {}
    for u in unidades:
        por_projeto.setdefault(u.projeto_id, []).append(
            UnidadeNoProjeto(id=u.id, numero_serie=u.numero_serie, proprio_nome=u.proprio.nome, status=u.status)
        )
    return [
        ProjetoOut(id=p.id, nome=p.nome, url=p.url, no_onedrive=p.no_onedrive, unidades=por_projeto.get(p.id, []))
        for p in projetos
    ]


@router.get("/origem", response_model=OrigemOut)
def origem(db: Session = Depends(get_db)):
    reg = db.get(models.IntegracaoOneDrive, 1)
    return OrigemOut(
        conectado=od.conectado(reg),
        pasta_definida=bool(reg and reg.projetos_pasta_id),
        pasta_nome=reg.projetos_pasta_nome if reg else None,
        pasta_url=reg.projetos_pasta_url if reg else None,
        lidos_em=reg.projetos_lidos_em if reg else None,
        erro=reg.projetos_erro if reg else None,
    )


@router.post("/pasta", response_model=LeituraOut, dependencies=ADMIN)
def pasta(dados: PastaIn, db: Session = Depends(get_db)):
    """Define a pasta cujas subpastas são os projetos e já lê os projetos."""
    try:
        return od.definir_pasta_projetos(db, dados.link)
    except od.ErroOneDrive as e:
        raise HTTPException(422, str(e))


@router.post("/atualizar", response_model=LeituraOut, dependencies=ADMIN)
def atualizar(db: Session = Depends(get_db)):
    try:
        return od.ler_projetos(db)
    except od.ErroOneDrive as e:
        raise HTTPException(409, str(e))
