import math

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from .. import models, schemas, services
from ..auth import admin_requerido, usuario_atual
from ..db import get_db

router = APIRouter(prefix="/api/proprios", tags=["Produtos próprios"], dependencies=[Depends(usuario_atual)])
ADMIN = [Depends(admin_requerido)]


# ---------- Cálculo de capacidade ----------
def _componentes(proprio: models.ProdutoProprio) -> list[schemas.ComponenteOut]:
    itens = []
    for c in proprio.componentes:
        p = c.produto
        # Folga mínima para 0,1 + 0,2 não virar 0,30000000000000004 e perder uma unidade
        itens.append(
            schemas.ComponenteOut(
                produto_id=p.id,
                produto_nome=p.nome,
                produto_categoria=p.categoria,
                produto_unidade=p.unidade,
                produto_foto_url=f"/api/produtos/{p.id}/foto?v={p.foto}" if p.foto else None,
                produto_arquivado=p.arquivado,
                quantidade=c.quantidade,
                em_estoque=p.quantidade,
                da_para=math.floor(p.quantidade / c.quantidade + 1e-9),
                falta_para_mais_um=0,
            )
        )
    if itens:
        proxima = min(i.da_para for i in itens) + 1
        for i in itens:
            i.falta_para_mais_um = round(max(0.0, i.quantidade * proxima - i.em_estoque), 3)
    return itens


def _contagem(db: Session, ids: list[int]) -> dict[int, dict[str, int]]:
    linhas = db.execute(
        select(models.Unidade.proprio_id, models.Unidade.status, func.count())
        .where(models.Unidade.proprio_id.in_(ids))
        .group_by(models.Unidade.proprio_id, models.Unidade.status)
    )
    contagem: dict[int, dict[str, int]] = {i: {s: 0 for s in models.STATUS_UNIDADE} for i in ids}
    for pid, status, n in linhas:
        contagem[pid][status] = n
    return contagem


def _out(proprio: models.ProdutoProprio, por_status: dict[str, int], detalhe=False):
    comps = _componentes(proprio)
    gargalo = min(comps, key=lambda c: c.da_para) if comps else None
    base = dict(
        id=proprio.id,
        nome=proprio.nome,
        prefixo=proprio.prefixo,
        tipo=proprio.tipo,
        descricao=proprio.descricao,
        arquivado=proprio.arquivado,
        capacidade=gargalo.da_para if gargalo else None,
        gargalo=gargalo.produto_nome if gargalo else None,
        por_status=por_status,
        total_unidades=sum(por_status.values()),
        criado_em=proprio.criado_em,
    )
    return schemas.ProprioDetalhe(**base, componentes=comps) if detalhe else schemas.ProprioOut(**base)


def _query():
    return select(models.ProdutoProprio).options(
        selectinload(models.ProdutoProprio.componentes).joinedload(models.Componente.produto)
    )


def _carregar(db: Session, proprio_id: int) -> models.ProdutoProprio:
    proprio = db.scalar(_query().where(models.ProdutoProprio.id == proprio_id))
    if not proprio:
        raise HTTPException(404, "Produto próprio não encontrado")
    return proprio


def _unidade_out(u: models.Unidade) -> schemas.UnidadeOut:
    return schemas.UnidadeOut(
        id=u.id,
        proprio_id=u.proprio_id,
        proprio_nome=u.proprio.nome,
        numero_serie=u.numero_serie,
        status=u.status,
        projeto_id=u.projeto_id,
        projeto_nome=u.projeto.nome if u.projeto else None,
        local=u.local,
        observacao=u.observacao,
        montagem_id=u.montagem_id,
        criado_em=u.criado_em,
        atualizado_em=u.atualizado_em,
    )


# ---------- Unidades (declaradas antes de /{proprio_id} para não conflitar) ----------
@router.get("/unidades", response_model=list[schemas.UnidadeOut])
def listar_unidades(
    proprio_id: int | None = None,
    status: schemas.StatusUnidade | None = None,
    projeto_id: int | None = None,
    busca: str | None = None,
    db: Session = Depends(get_db),
):
    stmt = (
        select(models.Unidade)
        .outerjoin(models.Projeto, models.Projeto.id == models.Unidade.projeto_id)
        .options(joinedload(models.Unidade.proprio), joinedload(models.Unidade.projeto))
        .order_by(models.Unidade.atualizado_em.desc(), models.Unidade.id.desc())
    )
    if proprio_id:
        stmt = stmt.where(models.Unidade.proprio_id == proprio_id)
    if status:
        stmt = stmt.where(models.Unidade.status == status)
    if projeto_id:
        stmt = stmt.where(models.Unidade.projeto_id == projeto_id)
    if busca:
        termo = f"%{busca.strip()}%"
        stmt = stmt.where(
            or_(
                models.Unidade.numero_serie.ilike(termo),
                models.Projeto.nome.ilike(termo),
                models.Unidade.local.ilike(termo),
                models.Unidade.observacao.ilike(termo),
            )
        )
    return [_unidade_out(u) for u in db.scalars(stmt.limit(2000))]


@router.patch("/unidades/{unidade_id}", response_model=schemas.UnidadeOut)
def atualizar_unidade(
    unidade_id: int,
    dados: schemas.UnidadeUpdate,
    db: Session = Depends(get_db),
    usuario: models.Pessoa = Depends(usuario_atual),
):
    """Muda a situação/projeto. Membros também podem (quem leva para campo nem sempre é admin)."""
    u = db.scalar(select(models.Unidade).where(models.Unidade.id == unidade_id).options(joinedload(models.Unidade.proprio)))
    if not u:
        raise HTTPException(404, "Unidade não encontrada")
    if dados.projeto_id is not None and not db.get(models.Projeto, dados.projeto_id):
        raise HTTPException(422, "Projeto não encontrado")
    # Em campo exige o projeto (empresa) — a não ser que ainda não haja nenhum projeto lido do OneDrive
    ha_projetos = db.scalar(select(models.Projeto.id).where(models.Projeto.no_onedrive.is_(True)).limit(1)) is not None
    if dados.status == "em_campo" and not dados.projeto_id and ha_projetos:
        raise HTTPException(422, "Escolha o projeto (empresa) onde a unidade está")
    u.status, u.projeto_id, u.local, u.observacao = dados.status, dados.projeto_id, dados.local, dados.observacao
    u.atualizado_em = models.agora()
    u.eventos.append(
        models.EventoUnidade(
            status=dados.status, projeto_id=dados.projeto_id, local=dados.local, observacao=dados.observacao, registrado_por_id=usuario.id
        )
    )
    db.commit()
    db.refresh(u)
    return _unidade_out(u)


@router.get("/unidades/{unidade_id}/eventos", response_model=list[schemas.EventoOut])
def eventos_unidade(unidade_id: int, db: Session = Depends(get_db)):
    eventos = db.scalars(
        select(models.EventoUnidade)
        .where(models.EventoUnidade.unidade_id == unidade_id)
        .options(joinedload(models.EventoUnidade.registrado_por), joinedload(models.EventoUnidade.projeto))
        .order_by(models.EventoUnidade.id.desc())
    )
    return [
        schemas.EventoOut(
            id=e.id,
            status=e.status,
            projeto_nome=e.projeto.nome if e.projeto else None,
            local=e.local,
            observacao=e.observacao,
            registrado_por_nome=e.registrado_por.nome if e.registrado_por else None,
            criado_em=e.criado_em,
        )
        for e in eventos
    ]


@router.post("/montagens/{montagem_id}/cancelar", status_code=204, dependencies=ADMIN)
def cancelar_montagem(montagem_id: int, db: Session = Depends(get_db), usuario: models.Pessoa = Depends(usuario_atual)):
    """Devolve as peças ao estoque e apaga as unidades — só enquanto nenhuma saiu para campo."""
    m = db.scalar(
        select(models.Montagem)
        .where(models.Montagem.id == montagem_id)
        .options(selectinload(models.Montagem.movimentacoes))
    )
    if not m:
        raise HTTPException(404, "Montagem não encontrada")
    if m.cancelada:
        raise HTTPException(409, "Essa montagem já foi cancelada")
    unidades = list(db.scalars(select(models.Unidade).where(models.Unidade.montagem_id == m.id)))
    if any(u.status not in ("em_producao", "pronto") for u in unidades):
        raise HTTPException(409, "Alguma unidade desta montagem já foi para campo ou manutenção; mude a situação dela em vez de cancelar")
    try:
        for mov in m.movimentacoes:
            if mov.estornada or mov.estorno_de_id:
                continue
            services.aplicar_movimentacao(
                db,
                schemas.MovimentacaoIn(
                    produto_id=mov.produto_id,
                    tipo="entrada",
                    quantidade=abs(mov.quantidade),
                    pessoa_id=mov.pessoa_id,
                    motivo=f"Montagem cancelada: {mov.motivo}" if mov.motivo else "Montagem cancelada",
                ),
                registrado_por=usuario,
                estorno_de=mov,
            )
        for u in unidades:
            db.delete(u)
        m.cancelada = True
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    return Response(status_code=204)


# ---------- Produtos próprios ----------
@router.get("", response_model=list[schemas.ProprioOut])
def listar(arquivados: bool = False, db: Session = Depends(get_db)):
    proprios = list(
        db.scalars(_query().where(models.ProdutoProprio.arquivado == arquivados).order_by(func.lower(models.ProdutoProprio.nome)))
    )
    contagem = _contagem(db, [p.id for p in proprios])
    return [_out(p, contagem[p.id]) for p in proprios]


def _aplicar_dados(db: Session, proprio: models.ProdutoProprio, dados: schemas.ProprioIn):
    ids = [c.produto_id for c in dados.componentes]
    if len(ids) != len(set(ids)):
        raise HTTPException(422, "Uma peça aparece duas vezes na composição; some as quantidades numa linha só")
    existentes = set(db.scalars(select(models.Produto.id).where(models.Produto.id.in_(ids))))
    if faltando := set(ids) - existentes:
        raise HTTPException(404, f"Peça não encontrada: {sorted(faltando)}")
    proprio.nome, proprio.prefixo, proprio.tipo, proprio.descricao = dados.nome, dados.prefixo, dados.tipo, dados.descricao
    # Substitui a composição inteira pela enviada
    atuais = {c.produto_id: c for c in proprio.componentes}
    proprio.componentes = [
        (atuais[c.produto_id] if c.produto_id in atuais else models.Componente(produto_id=c.produto_id))
        for c in dados.componentes
    ]
    for comp, novo in zip(proprio.componentes, dados.componentes):
        comp.quantidade = novo.quantidade


def _salvar(db: Session):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Já existe um produto próprio com esse nome ou prefixo")


@router.post("", response_model=schemas.ProprioDetalhe, status_code=201, dependencies=ADMIN)
def criar(dados: schemas.ProprioIn, db: Session = Depends(get_db)):
    proprio = models.ProdutoProprio()
    db.add(proprio)
    _aplicar_dados(db, proprio, dados)
    _salvar(db)
    return _out(_carregar(db, proprio.id), _contagem(db, [proprio.id])[proprio.id], detalhe=True)


@router.get("/tipos", response_model=list[str])
def tipos(db: Session = Depends(get_db)):
    """Tipos já usados nos produtos próprios (sugestões do campo "Tipo" no cadastro)."""
    stmt = (
        select(models.ProdutoProprio.tipo)
        .where(models.ProdutoProprio.tipo.is_not(None))
        .distinct()
        .order_by(func.lower(models.ProdutoProprio.tipo))
    )
    return list(db.scalars(stmt))


@router.get("/{proprio_id}", response_model=schemas.ProprioDetalhe)
def obter(proprio_id: int, db: Session = Depends(get_db)):
    return _out(_carregar(db, proprio_id), _contagem(db, [proprio_id])[proprio_id], detalhe=True)


@router.put("/{proprio_id}", response_model=schemas.ProprioDetalhe, dependencies=ADMIN)
def atualizar(proprio_id: int, dados: schemas.ProprioIn, db: Session = Depends(get_db)):
    proprio = _carregar(db, proprio_id)
    if dados.prefixo != proprio.prefixo and proprio.unidades:
        raise HTTPException(409, "Não dá para mudar o prefixo depois que já existem unidades com número de série")
    _aplicar_dados(db, proprio, dados)
    _salvar(db)
    return _out(_carregar(db, proprio_id), _contagem(db, [proprio_id])[proprio_id], detalhe=True)


@router.delete("/{proprio_id}", status_code=204, dependencies=ADMIN)
def remover(proprio_id: int, db: Session = Depends(get_db)):
    """Sem unidades: apaga. Com unidades: arquiva (o histórico delas precisa continuar existindo)."""
    proprio = _carregar(db, proprio_id)
    if proprio.unidades:
        proprio.arquivado = True
    else:
        db.delete(proprio)
    db.commit()
    return Response(status_code=204)


@router.post("/{proprio_id}/restaurar", response_model=schemas.ProprioDetalhe, dependencies=ADMIN)
def restaurar(proprio_id: int, db: Session = Depends(get_db)):
    proprio = _carregar(db, proprio_id)
    proprio.arquivado = False
    db.commit()
    return _out(_carregar(db, proprio_id), _contagem(db, [proprio_id])[proprio_id], detalhe=True)


@router.post("/{proprio_id}/montar", response_model=schemas.MontagemOut, status_code=201)
def montar(
    proprio_id: int,
    dados: schemas.MontarIn,
    db: Session = Depends(get_db),
    usuario: models.Pessoa = Depends(usuario_atual),
):
    """Retira todas as peças de uma vez e cria as unidades. Se faltar qualquer peça, nada é retirado."""
    proprio = _carregar(db, proprio_id)
    if proprio.arquivado:
        raise HTTPException(409, "Produto próprio arquivado")
    if not proprio.componentes:
        raise HTTPException(422, "Cadastre a composição antes de montar")
    pessoa_id = dados.pessoa_id or usuario.id

    ultima = db.scalar(select(func.max(models.Unidade.sequencia)).where(models.Unidade.proprio_id == proprio.id)) or 0
    series = [f"{proprio.prefixo}-{n:04d}" for n in range(ultima + 1, ultima + dados.quantidade + 1)]
    faixa = series[0] if len(series) == 1 else f"{series[0]} a {series[-1]}"
    motivo = f"Montagem {proprio.nome} ({faixa})"

    try:
        montagem = models.Montagem(
            proprio_id=proprio.id,
            quantidade=dados.quantidade,
            pessoa_id=pessoa_id,
            registrado_por_id=usuario.id,
            observacao=dados.observacao,
        )
        db.add(montagem)
        db.flush()
        for comp in proprio.componentes:
            if comp.produto.arquivado:
                raise HTTPException(409, f"A peça “{comp.produto.nome}” está arquivada; restaure-a ou tire da composição")
            services.aplicar_movimentacao(
                db,
                schemas.MovimentacaoIn(
                    produto_id=comp.produto_id,
                    tipo="retirada",
                    quantidade=round(comp.quantidade * dados.quantidade, 6),
                    pessoa_id=pessoa_id,
                    motivo=motivo[:255],
                ),
                registrado_por=usuario,
                montagem_id=montagem.id,
            )
        unidades = []
        for i, serie in enumerate(series, start=ultima + 1):
            u = models.Unidade(
                proprio_id=proprio.id,
                montagem_id=montagem.id,
                sequencia=i,
                numero_serie=serie,
                status=dados.status_inicial,
                observacao=dados.observacao,
            )
            u.eventos.append(
                models.EventoUnidade(status=dados.status_inicial, observacao="Montado", registrado_por_id=usuario.id)
            )
            db.add(u)
            unidades.append(u)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Outra montagem foi registrada ao mesmo tempo; tente de novo")

    for u in unidades:
        db.refresh(u)
    return schemas.MontagemOut(id=montagem.id, quantidade=dados.quantidade, unidades=[_unidade_out(u) for u in unidades])
