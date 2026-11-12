import math

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

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
            fornecedor_id=v.fornecedor_id,
            fornecedor_nome=v.fornecedor.nome,
            fornecedor_localizacao=v.fornecedor.localizacao,
            preco=v.preco,
            url=v.url,
            preferido=v.preferido,
        )
        for v in vinculos
    ]


def _sugestao(p: models.Produto) -> tuple[float, float]:
    meta = max(p.estoque_minimo * FATOR_META, 1)
    falta = max(meta - p.quantidade, 0)
    if p.unidade in INTEIRAS:
        falta = math.ceil(falta)
    return round(falta, 2), meta


def _manual_out(m: models.ItemCompraManual) -> schemas.CompraManualOut:
    return schemas.CompraManualOut(
        id=m.id,
        quantidade=m.quantidade,
        motivo=m.motivo,
        criado_por_nome=m.criado_por.nome if m.criado_por else None,
        atualizado_em=m.atualizado_em,
    )


@router.get("", response_model=list[schemas.ItemCompra])
def lista(db: Session = Depends(get_db)):
    """Itens esgotados ou no mínimo + os adicionados à mão, com quanto comprar e as opções de fornecedor."""
    manuais = {
        m.produto_id: m
        for m in db.scalars(select(models.ItemCompraManual).options(joinedload(models.ItemCompraManual.criado_por)))
    }
    itens = []
    for p in db.scalars(_query()):
        automatico = services.status_estoque(p) != "ok"
        manual = manuais.get(p.id)
        if not automatico and not manual:
            continue
        reposicao, meta = _sugestao(p)
        sugestao = (reposicao if automatico else 0) + (manual.quantidade if manual else 0)
        opcoes = _opcoes(p)
        itens.append(
            schemas.ItemCompra(
                produto=services.produto_out(p),
                sugestao=round(sugestao, 2),
                meta=meta,
                automatico=automatico,
                manual=_manual_out(manual) if manual else None,
                opcoes=opcoes,
                fornecedor_sugerido_id=opcoes[0].fornecedor_id if opcoes else None,
            )
        )
    # Esgotados primeiro
    itens.sort(key=lambda i: (i.produto.status != "esgotado", i.produto.nome.lower()))
    return itens


@router.post("/manuais", response_model=schemas.CompraManualOut, status_code=201)
def adicionar(
    dados: schemas.CompraManualIn, db: Session = Depends(get_db), usuario: models.Pessoa = Depends(usuario_atual)
):
    """Coloca um produto na lista de compras à mão. Se ele já estava, troca a quantidade e o motivo."""
    produto = db.get(models.Produto, dados.produto_id)
    if not produto or produto.arquivado:
        raise HTTPException(404, "Produto não encontrado")
    m = db.scalar(select(models.ItemCompraManual).where(models.ItemCompraManual.produto_id == produto.id))
    if m is None:
        m = models.ItemCompraManual(produto_id=produto.id)
        db.add(m)
    m.quantidade, m.motivo, m.criado_por_id = dados.quantidade, dados.motivo, usuario.id
    m.atualizado_em = models.agora()
    db.commit()
    db.refresh(m)
    return _manual_out(m)


@router.delete("/manuais/{item_id}", status_code=204)
def remover(item_id: int, db: Session = Depends(get_db)):
    m = db.get(models.ItemCompraManual, item_id)
    if not m:
        raise HTTPException(404, "Item não encontrado na lista")
    db.delete(m)
    db.commit()
    return Response(status_code=204)


@router.post("/exportar.xlsx", tags=["Exportação"])
def exportar(dados: schemas.ExportarComprasIn, db: Session = Depends(get_db)):
    """Gera a planilha com as quantidades e fornecedores escolhidos na tela."""
    ids = [i.produto_id for i in dados.itens]
    produtos = {p.id: p for p in db.scalars(_query().where(models.Produto.id.in_(ids)))}
    motivos = {
        m.produto_id: m.motivo
        for m in db.scalars(select(models.ItemCompraManual).where(models.ItemCompraManual.produto_id.in_(ids)))
    }
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
            opcao.fornecedor_nome if opcao else None, opcao.fornecedor_localizacao if opcao else None,
            opcao.preco if opcao else None, subtotal, opcao.url if opcao else None, motivos.get(p.id),
        ])
    colunas = ["Produto", "Categoria", "Comprar", "Unidade", "Saldo atual", "Estoque mínimo",
               "Fornecedor", "Localização do fornecedor", "Preço unitário (R$)", "Subtotal (R$)", "Link", "Motivo"]
    rodape = ["Total estimado", None, None, None, None, None, None, None, None, round(total, 2), None, None]
    return download(planilha("Lista de compras", colunas, linhas, rodape), "lista-de-compras")
