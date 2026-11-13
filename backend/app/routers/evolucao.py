"""Evolução dos produtos próprios: versões (o que mudou em cada uma) e ideias/problemas para as próximas.

Qualquer pessoa com login anota ideias; o autor ou um administrador edita o texto;
só administradores mudam o status e cuidam das versões.
"""

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..auth import admin_requerido, usuario_atual
from ..db import get_db

router = APIRouter(prefix="/api/evolucao", tags=["Evolução"], dependencies=[Depends(usuario_atual)])
ADMIN = [Depends(admin_requerido)]
ABERTAS = ("ideia", "teste")


def _melhoria_out(m: models.Melhoria) -> schemas.MelhoriaOut:
    return schemas.MelhoriaOut(
        id=m.id, proprio_id=m.proprio_id, titulo=m.titulo, descricao=m.descricao, origem=m.origem, area=m.area,
        status=m.status, versao_id=m.versao_id, versao_nome=m.versao.nome if m.versao else None, decisao=m.decisao,
        autor_id=m.autor_id, autor_nome=m.autor.nome if m.autor else None,
        criado_em=m.criado_em, atualizado_em=m.atualizado_em,
    )


def _ordem_versao(v: models.VersaoProprio):
    # Pela data da versão (sem data, vale o dia do cadastro) e, empatando, pela ordem de cadastro
    return (v.data or v.criado_em.date(), v.id)


def _dados(db: Session, proprio_ids: list[int]):
    versoes = db.scalars(
        select(models.VersaoProprio)
        .where(models.VersaoProprio.proprio_id.in_(proprio_ids))
        .options(selectinload(models.VersaoProprio.criado_por))
    ).all()
    melhorias = db.scalars(
        select(models.Melhoria)
        .where(models.Melhoria.proprio_id.in_(proprio_ids))
        .options(selectinload(models.Melhoria.autor), selectinload(models.Melhoria.versao))
        .order_by(models.Melhoria.criado_em.desc(), models.Melhoria.id.desc())
    ).all()
    return versoes, melhorias


def _resumo(p: models.ProdutoProprio, versoes, melhorias) -> dict:
    vs = sorted((v for v in versoes if v.proprio_id == p.id), key=_ordem_versao, reverse=True)
    ms = [m for m in melhorias if m.proprio_id == p.id]
    datas = [m.atualizado_em for m in ms] + [v.criado_em for v in vs]
    return dict(
        proprio_id=p.id, nome=p.nome, prefixo=p.prefixo, tipo=p.tipo,
        versao_atual=vs[0].nome if vs else None, total_versoes=len(vs),
        abertas=sum(m.status in ABERTAS for m in ms), aplicadas=sum(m.status == "aplicada" for m in ms),
        ultima_atividade=max(datas) if datas else None,
    ), vs, ms


def _proprio(db: Session, proprio_id: int) -> models.ProdutoProprio:
    p = db.get(models.ProdutoProprio, proprio_id)
    if not p:
        raise HTTPException(404, "Produto próprio não encontrado")
    return p


def _melhoria(db: Session, melhoria_id: int) -> models.Melhoria:
    m = db.get(models.Melhoria, melhoria_id)
    if not m:
        raise HTTPException(404, "Anotação não encontrada")
    return m


def _pode_editar(m: models.Melhoria, usuario: models.Pessoa):
    if usuario.papel != "admin" and m.autor_id != usuario.id:
        raise HTTPException(403, "Só quem anotou ou um administrador pode alterar esta anotação")


@router.get("", response_model=list[schemas.EvolucaoResumo])
def listar(db: Session = Depends(get_db)):
    proprios = db.scalars(
        select(models.ProdutoProprio).where(models.ProdutoProprio.arquivado.is_(False)).order_by(models.ProdutoProprio.nome)
    ).all()
    versoes, melhorias = _dados(db, [p.id for p in proprios])
    return [schemas.EvolucaoResumo(**_resumo(p, versoes, melhorias)[0]) for p in proprios]


@router.get("/{proprio_id}", response_model=schemas.EvolucaoDetalhe)
def detalhe(proprio_id: int, db: Session = Depends(get_db)):
    p = _proprio(db, proprio_id)
    versoes, melhorias = _dados(db, [p.id])
    resumo, vs, ms = _resumo(p, versoes, melhorias)
    saida_versoes = [
        schemas.VersaoOut(
            id=v.id, proprio_id=v.proprio_id, nome=v.nome, data=v.data, resumo=v.resumo,
            criado_por_nome=v.criado_por.nome if v.criado_por else None, criado_em=v.criado_em,
            melhorias=[_melhoria_out(m) for m in ms if m.versao_id == v.id and m.status == "aplicada"],
        )
        for v in vs
    ]
    return schemas.EvolucaoDetalhe(**resumo, versoes=saida_versoes, melhorias=[_melhoria_out(m) for m in ms])


# ---------- Ideias e problemas ----------
@router.post("/{proprio_id}/melhorias", response_model=schemas.MelhoriaOut, status_code=201)
def anotar(proprio_id: int, dados: schemas.MelhoriaIn, db: Session = Depends(get_db),
           usuario: models.Pessoa = Depends(usuario_atual)):
    _proprio(db, proprio_id)
    m = models.Melhoria(proprio_id=proprio_id, autor_id=usuario.id, status="ideia", **dados.model_dump())
    db.add(m)
    db.commit()
    return _melhoria_out(m)


@router.put("/melhorias/{melhoria_id}", response_model=schemas.MelhoriaOut)
def editar(melhoria_id: int, dados: schemas.MelhoriaIn, db: Session = Depends(get_db),
           usuario: models.Pessoa = Depends(usuario_atual)):
    m = _melhoria(db, melhoria_id)
    _pode_editar(m, usuario)
    for campo, valor in dados.model_dump().items():
        setattr(m, campo, valor)
    db.commit()
    return _melhoria_out(m)


@router.patch("/melhorias/{melhoria_id}/status", response_model=schemas.MelhoriaOut, dependencies=ADMIN)
def mudar_status(melhoria_id: int, dados: schemas.StatusMelhoriaIn, db: Session = Depends(get_db)):
    m = _melhoria(db, melhoria_id)
    versao_id = None
    if dados.status == "aplicada":
        if dados.versao_id is None:
            raise HTTPException(422, "Escolha em qual versão a melhoria foi aplicada")
        v = db.get(models.VersaoProprio, dados.versao_id)
        if not v or v.proprio_id != m.proprio_id:
            raise HTTPException(404, "Versão não encontrada para este produto")
        versao_id = v.id
    m.status, m.versao_id, m.decisao = dados.status, versao_id, dados.decisao
    db.commit()
    db.refresh(m)
    return _melhoria_out(m)


@router.delete("/melhorias/{melhoria_id}", status_code=204)
def apagar(melhoria_id: int, db: Session = Depends(get_db), usuario: models.Pessoa = Depends(usuario_atual)):
    m = _melhoria(db, melhoria_id)
    _pode_editar(m, usuario)
    db.delete(m)
    db.commit()
    return Response(status_code=204)


# ---------- Versões ----------
def _salvar_versao(db: Session):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Este produto já tem uma versão com esse nome")


@router.post("/{proprio_id}/versoes", response_model=schemas.VersaoOut, status_code=201, dependencies=ADMIN)
def criar_versao(proprio_id: int, dados: schemas.VersaoIn, db: Session = Depends(get_db),
                 usuario: models.Pessoa = Depends(usuario_atual)):
    _proprio(db, proprio_id)
    v = models.VersaoProprio(proprio_id=proprio_id, criado_por_id=usuario.id, **dados.model_dump())
    db.add(v)
    _salvar_versao(db)
    return schemas.VersaoOut(**dados.model_dump(), id=v.id, proprio_id=proprio_id, criado_por_nome=usuario.nome,
                             criado_em=v.criado_em)


@router.put("/versoes/{versao_id}", response_model=schemas.VersaoOut, dependencies=ADMIN)
def editar_versao(versao_id: int, dados: schemas.VersaoIn, db: Session = Depends(get_db)):
    v = db.get(models.VersaoProprio, versao_id)
    if not v:
        raise HTTPException(404, "Versão não encontrada")
    for campo, valor in dados.model_dump().items():
        setattr(v, campo, valor)
    _salvar_versao(db)
    return schemas.VersaoOut(**dados.model_dump(), id=v.id, proprio_id=v.proprio_id,
                             criado_por_nome=v.criado_por.nome if v.criado_por else None, criado_em=v.criado_em)


@router.delete("/versoes/{versao_id}", status_code=204, dependencies=ADMIN)
def apagar_versao(versao_id: int, db: Session = Depends(get_db)):
    v = db.get(models.VersaoProprio, versao_id)
    if not v:
        raise HTTPException(404, "Versão não encontrada")
    # As melhorias que estavam nela não somem: voltam para "em teste", sem versão
    for m in db.scalars(select(models.Melhoria).where(models.Melhoria.versao_id == v.id)):
        m.versao_id = None
        if m.status == "aplicada":
            m.status = "teste"
    db.delete(v)
    db.commit()
    return Response(status_code=204)
