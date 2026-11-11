import math

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas, services
from ..auth import usuario_atual
from ..db import get_db
from ..planilhas import download, planilha

router = APIRouter(prefix="/api/compras", tags=["Compras"], dependencies=[Depends(usuario_atual)])

# Comprar o suficiente para chegar ao dobro do estoque mínimo
FATOR_META = 2

# Unidades que só existem inteiras: a sugestão é arredondada para cima
INTEIRAS = {"un", "par", "cx", "pct", "rolo"}


def _query():
    return (
        select(models.Produto)
        .where(models.Produto.arquivado.is_(False))
        .options(selectinload(models.Produto.fornecedores).selectinload(models.ProdutoFornecedor.fornecedor))
        .order_by(func.lower(models.Produto.nome))
    )


def _opcoes(p: models.Produto) -> list[schemas.OpcaoCompra]:
    # Preferido primeiro, depois do mais barato para o mais caro (sem preço por último)
    vinculos = sorted(p.fornecedores, key=lambda v: (not v.preferido, v.preco is None, v.preco or 0))
    return [
        schemas.OpcaoCompra(
            fornecedor_id=v.fornecedor_id, fornecedor_nome=v.fornecedor.nome, preco=v.preco, url=v.url, preferido=v.preferido
        )
        for v in vinculos
    ]


def _sugestao(p: models.Produto) -> tuple[float, float]:
    meta = max(p.estoque_minimo * FATOR_META, 1)
    falta = max(meta - p.quantidade, 0)
    if p.unidade in INTEIRAS:
        falta = math.ceil(falta)
    return round(falta, 2), meta


@router.get("", response_model=list[schemas.ItemCompra])
def lista(db: Session = Depends(get_db)):
    """Itens esgotados ou no mínimo, com quanto comprar e as opções de fornecedor."""
    itens = []
    for p in db.scalars(_query()):
        if services.status_estoque(p) == "ok":
            continue
        sugestao, meta = _sugestao(p)
        opcoes = _opcoes(p)
        itens.append(
            schemas.ItemCompra(
                produto=services.produto_out(p),
                sugestao=sugestao,
                meta=meta,
                opcoes=opcoes,
                fornecedor_sugerido_id=opcoes[0].fornecedor_id if opcoes else None,
            )
        )
    # Esgotados primeiro
    itens.sort(key=lambda i: (i.produto.status != "esgotado", i.produto.nome.lower()))
    return itens


@router.post("/exportar.xlsx", tags=["Exportação"])
def exportar(dados: schemas.ExportarComprasIn, db: Session = Depends(get_db)):
    """Gera a planilha com as quantidades e fornecedores escolhidos na tela."""
    produtos = {p.id: p for p in db.scalars(_query().where(models.Produto.id.in_([i.produto_id for i in dados.itens])))}
    linhas, total = [], 0.0
    for item in dados.itens:
        p = produtos.get(item.produto_id)
        if not p:
            continue
        opcao = next((o for o in _opcoes(p) if o.fornecedor_id == item.fornecedor_id), None)
        subtotal = round(item.quantidade * opcao.preco, 2) if opcao and opcao.preco is not None else None
        total += subtotal or 0
        linhas.append([
            p.nome, p.categoria, item.quantidade, p.unidade, p.quantidade, p.estoque_minimo,
            opcao.fornecedor_nome if opcao else None, opcao.preco if opcao else None, subtotal, opcao.url if opcao else None,
        ])
    colunas = ["Produto", "Categoria", "Comprar", "Unidade", "Saldo atual", "Estoque mínimo",
               "Fornecedor", "Preço unitário (R$)", "Subtotal (R$)", "Link"]
    rodape = ["Total estimado", None, None, None, None, None, None, None, round(total, 2), None]
    return download(planilha("Lista de compras", colunas, linhas, rodape), "lista-de-compras")
