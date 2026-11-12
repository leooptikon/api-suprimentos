"""Linhas das planilhas (usadas na exportação para Excel e no espelho do OneDrive)."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from . import models, services

Tabela = tuple[list[str], list[list]]  # (colunas, linhas)

_SITUACAO_ESTOQUE = {"ok": "OK", "baixo": "Estoque baixo", "esgotado": "Esgotado"}
_SITUACAO_UNIDADE = {
    "em_producao": "Em produção",
    "pronto": "Pronto",
    "em_campo": "Em campo",
    "manutencao": "Manutenção",
    "desativado": "Desativado",
}


def _num(valor: float) -> float | int:
    """3.0 → 3 para a planilha não mostrar casas decimais à toa."""
    return int(valor) if float(valor).is_integer() else valor


def estoque(db: Session) -> Tabela:
    produtos = db.scalars(
        select(models.Produto)
        .where(models.Produto.arquivado.is_(False))
        .options(selectinload(models.Produto.fornecedores).selectinload(models.ProdutoFornecedor.fornecedor))
        .order_by(func.lower(models.Produto.nome))
    )
    linhas = []
    for p in produtos:
        out = services.produto_out(p)
        linhas.append([p.nome, p.categoria, p.quantidade, p.unidade, p.estoque_minimo, _SITUACAO_ESTOQUE[out.status],
                       p.localizacao, out.fornecedor_preferido, out.menor_preco, p.descricao])
    colunas = ["Produto", "Categoria", "Quantidade", "Unidade", "Estoque mínimo", "Situação",
               "Localização", "Fornecedor preferido", "Menor preço (R$)", "Descrição"]
    return colunas, linhas


def proprios(db: Session) -> Tabela:
    # Import aqui dentro: o router de produtos próprios já tem o cálculo de "dá para montar"
    from .routers.proprios import _contagem, _out, _query

    lista = list(
        db.scalars(_query().where(models.ProdutoProprio.arquivado.is_(False)).order_by(func.lower(models.ProdutoProprio.nome)))
    )
    contagem = _contagem(db, [p.id for p in lista])
    linhas = []
    for proprio in lista:
        out = _out(proprio, contagem[proprio.id], detalhe=True)
        pecas = "; ".join(f"{_num(c.quantidade)} {c.produto_unidade} {c.produto_nome}" for c in out.componentes)
        linhas.append(
            [proprio.nome, proprio.prefixo, proprio.tipo, out.capacidade, out.gargalo, pecas or None, out.total_unidades]
            + [out.por_status[s] for s in models.STATUS_UNIDADE]
            + [proprio.descricao]
        )
    colunas = (
        ["Produto", "Prefixo do nº de série", "Tipo", "Dá para montar", "Peça que limita", "Peças por unidade", "Unidades montadas"]
        + [_SITUACAO_UNIDADE[s] for s in models.STATUS_UNIDADE]
        + ["Descrição"]
    )
    return colunas, linhas
