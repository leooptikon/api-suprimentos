from datetime import date, datetime, time, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from .. import models, relatorios, schemas, services
from ..auth import usuario_atual
from ..db import get_db
from ..planilhas import FUSO, download, planilha

router = APIRouter(prefix="/api", tags=["Movimentações"], dependencies=[Depends(usuario_atual)])


def _query_movs():
    return select(models.Movimentacao).options(
        joinedload(models.Movimentacao.produto),
        joinedload(models.Movimentacao.pessoa),
        joinedload(models.Movimentacao.registrado_por),
    )


def _inicio_do_dia(d: date) -> datetime:
    return datetime.combine(d, time.min, tzinfo=FUSO).astimezone(timezone.utc)


@router.get("/movimentacoes", response_model=list[schemas.MovimentacaoOut])
def listar(
    produto_id: int | None = None,
    pessoa_id: int | None = None,
    tipo: Literal["entrada", "retirada", "ajuste"] | None = None,
    de: date | None = None,
    ate: date | None = None,
    limite: int = 200,
    db: Session = Depends(get_db),
):
    stmt = _query_movs().order_by(models.Movimentacao.criado_em.desc(), models.Movimentacao.id.desc())
    if produto_id:
        stmt = stmt.where(models.Movimentacao.produto_id == produto_id)
    if pessoa_id:
        stmt = stmt.where(models.Movimentacao.pessoa_id == pessoa_id)
    if tipo:
        stmt = stmt.where(models.Movimentacao.tipo == tipo)
    if de:
        stmt = stmt.where(models.Movimentacao.criado_em >= _inicio_do_dia(de))
    if ate:
        stmt = stmt.where(models.Movimentacao.criado_em < _inicio_do_dia(ate + timedelta(days=1)))
    return [services.movimentacao_out(m) for m in db.scalars(stmt.limit(min(limite, 2000)))]


@router.post("/movimentacoes", response_model=schemas.MovimentacaoOut, status_code=201)
def registrar(
    dados: schemas.MovimentacaoIn, db: Session = Depends(get_db), usuario: models.Pessoa = Depends(usuario_atual)
):
    if dados.tipo == "ajuste" and usuario.papel != "admin":
        raise HTTPException(403, "Apenas administradores podem corrigir a contagem")
    mov = services.registrar_movimentacao(db, dados, registrado_por=usuario)
    return services.movimentacao_out(db.scalar(_query_movs().where(models.Movimentacao.id == mov.id)))


JANELA_DESFAZER = timedelta(minutes=15)


@router.post("/movimentacoes/{mov_id}/desfazer", response_model=schemas.MovimentacaoOut, status_code=201)
def desfazer(mov_id: int, db: Session = Depends(get_db), usuario: models.Pessoa = Depends(usuario_atual)):
    """Cria o lançamento inverso de uma entrada/retirada. O histórico original é mantido.

    Membros só desfazem o que eles mesmos anotaram, nos primeiros 15 minutos; administradores, qualquer um.
    """
    original = db.get(models.Movimentacao, mov_id)
    if not original:
        raise HTTPException(404, "Movimentação não encontrada")
    if original.estorno_de_id is not None:
        raise HTTPException(409, "Isso já é um estorno e não pode ser desfeito")
    if original.montagem_id is not None:
        raise HTTPException(409, "Essa retirada faz parte de uma montagem; cancele a montagem em Produtos próprios")
    if original.tipo == "ajuste":
        raise HTTPException(422, "Correções de contagem não são desfeitas; faça uma nova contagem")
    if original.estornada:
        raise HTTPException(409, "Essa movimentação já foi desfeita")
    if usuario.papel != "admin":
        if original.registrado_por_id != usuario.id:
            raise HTTPException(403, "Você só pode desfazer o que você mesmo anotou")
        if models.agora() - original.criado_em > JANELA_DESFAZER:
            raise HTTPException(403, "Passou o prazo de 15 minutos; peça a um administrador")

    inverso = schemas.MovimentacaoIn(
        produto_id=original.produto_id,
        tipo="entrada" if original.tipo == "retirada" else "retirada",
        quantidade=abs(original.quantidade),
        pessoa_id=original.pessoa_id or usuario.id,
        motivo=f"Desfeito: {original.motivo}" if original.motivo else "Desfeito",
    )
    mov = services.registrar_movimentacao(db, inverso, registrado_por=usuario, estorno_de=original)
    return services.movimentacao_out(db.scalar(_query_movs().where(models.Movimentacao.id == mov.id)))


@router.get("/dashboard", response_model=schemas.DashboardOut, tags=["Dashboard"])
def dashboard(db: Session = Depends(get_db)):
    produtos = list(
        db.scalars(
            select(models.Produto)
            .where(models.Produto.arquivado.is_(False))
            .options(selectinload(models.Produto.fornecedores).selectinload(models.ProdutoFornecedor.fornecedor))
        )
    )
    saidas = [services.produto_out(p) for p in produtos]
    alertas = sorted(
        (p for p in saidas if p.status != "ok"),
        key=lambda p: (p.status != "esgotado", p.quantidade / p.estoque_minimo if p.estoque_minimo else 0),
    )

    hoje = datetime.now(FUSO).date()
    inicio = _inicio_do_dia(hoje - timedelta(days=13))
    movs = list(db.scalars(_query_movs().where(models.Movimentacao.criado_em >= inicio)))

    serie: dict[str, dict[str, int]] = {
        (hoje - timedelta(days=i)).isoformat(): {"entradas": 0, "retiradas": 0} for i in range(13, -1, -1)
    }
    ranking: dict[int, dict] = {}
    retiradas_7d = 0
    limite_7d = _inicio_do_dia(hoje - timedelta(days=6))
    for m in movs:
        if m.estornada or m.estorno_de_id is not None:
            continue  # lançamentos desfeitos e seus estornos não contam
        dia = m.criado_em.astimezone(FUSO).date().isoformat()
        if m.tipo == "entrada":
            serie[dia]["entradas"] += 1
        elif m.tipo == "retirada":
            serie[dia]["retiradas"] += 1
            r = ranking.setdefault(
                m.produto_id,
                {"produto_id": m.produto_id, "nome": m.produto.nome, "categoria": m.produto.categoria,
                 "retiradas": 0, "quantidade": 0.0, "unidade": m.produto.unidade},
            )
            r["retiradas"] += 1
            r["quantidade"] += -m.quantidade
            if m.criado_em >= limite_7d:
                retiradas_7d += 1

    ultimas = db.scalars(
        _query_movs().order_by(models.Movimentacao.criado_em.desc(), models.Movimentacao.id.desc()).limit(8)
    )

    return schemas.DashboardOut(
        total_produtos=len(produtos),
        total_categorias=len({p.categoria for p in produtos if p.categoria}),
        itens_com_preco=sum(1 for p in saidas if p.menor_preco is not None),
        abaixo_minimo=sum(1 for p in saidas if p.status == "baixo"),
        esgotados=sum(1 for p in saidas if p.status == "esgotado"),
        retiradas_7d=retiradas_7d,
        valor_estimado=round(sum(p.quantidade * (p.menor_preco or 0) for p in saidas), 2),
        alertas=alertas[:8],
        serie_14d=[schemas.SerieDia(dia=d, **v) for d, v in serie.items()],
        mais_retirados=[
            schemas.RankingItem(**r)
            for r in sorted(ranking.values(), key=lambda r: (-r["retiradas"], -r["quantidade"]))[:5]
        ],
        ultimas=[services.movimentacao_out(m) for m in ultimas],
    )


# ---------- Exportação para Excel ----------
@router.get("/exportar/estoque.xlsx", tags=["Exportação"])
def exportar_estoque(db: Session = Depends(get_db)):
    colunas, linhas = relatorios.estoque(db)
    return download(planilha("Estoque", colunas, linhas), "estoque")


@router.get("/exportar/movimentacoes.xlsx", tags=["Exportação"])
def exportar_movimentacoes(de: date | None = None, ate: date | None = None, db: Session = Depends(get_db)):
    movs = listar(de=de, ate=ate, limite=2000, db=db)
    rotulo = {"entrada": "Entrada", "retirada": "Retirada", "ajuste": "Correção de contagem"}

    def situacao(m: schemas.MovimentacaoOut) -> str:
        return "Desfeita" if m.estornada else "Estorno" if m.estorno_de_id else ""

    linhas = [
        [m.criado_em.astimezone(FUSO).strftime("%d/%m/%Y %H:%M"), rotulo[m.tipo], m.produto_nome, m.quantidade,
         m.produto_unidade, m.saldo_apos, m.pessoa_nome, m.motivo, m.registrado_por_nome, situacao(m)]
        for m in movs
    ]
    colunas = ["Data", "Tipo", "Produto", "Quantidade", "Unidade", "Saldo após", "Responsável", "Motivo",
               "Registrado por", "Situação"]
    return download(planilha("Movimentações", colunas, linhas), "movimentacoes")
