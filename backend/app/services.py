from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from . import mercadolivre, models, schemas


def status_estoque(p: models.Produto) -> schemas.StatusEstoque:
    if p.quantidade <= 0:
        return "esgotado"
    if p.estoque_minimo > 0 and p.quantidade <= p.estoque_minimo:
        return "baixo"
    return "ok"


def menor_preco(p: models.Produto) -> float | None:
    precos = [pf.preco for pf in p.fornecedores if pf.preco is not None]
    return min(precos) if precos else None


def link_compra(p: models.Produto) -> models.ProdutoFornecedor | None:
    """Onde comprar: o preferido; senão o mais barato; senão qualquer um — sempre entre os que têm link."""
    com_link = [v for v in p.fornecedores if v.url]
    if not com_link:
        return None
    return min(com_link, key=lambda v: (not v.preferido, v.preco is None, v.preco or 0))


def produto_out(p: models.Produto) -> schemas.ProdutoOut:
    preferido = next((pf.fornecedor.nome for pf in p.fornecedores if pf.preferido), None)
    compra = link_compra(p)
    return schemas.ProdutoOut(
        **schemas.ProdutoBase.model_validate(p).model_dump(),
        id=p.id,
        quantidade=p.quantidade,
        arquivado=p.arquivado,
        status=status_estoque(p),
        criado_em=p.criado_em,
        atualizado_em=p.atualizado_em,
        fornecedor_preferido=preferido,
        menor_preco=menor_preco(p),
        # O nome do arquivo muda a cada envio, então serve de versão para o cache do navegador
        foto_url=f"/api/produtos/{p.id}/foto?v={p.foto}" if p.foto else None,
        link_compra=compra.url if compra else None,
        loja_compra=compra.fornecedor.nome if compra else None,
    )


def produto_detalhe(p: models.Produto) -> schemas.ProdutoDetalhe:
    return schemas.ProdutoDetalhe(
        **produto_out(p).model_dump(),
        fornecedores=[
            schemas.ProdutoFornecedorOut(
                id=pf.id,
                fornecedor_id=pf.fornecedor_id,
                fornecedor_nome=pf.fornecedor.nome,
                url=pf.url,
                preco=pf.preco,
                preferido=pf.preferido,
                monitorado=mercadolivre.extrair_id(pf.url) is not None,
                preco_atualizado_em=pf.preco_atualizado_em,
                frete_gratis=pf.frete_gratis,
                situacao_anuncio=pf.situacao_anuncio,
                erro_coleta=pf.erro_coleta,
            )
            for pf in p.fornecedores
        ],
    )


def movimentacao_out(m: models.Movimentacao) -> schemas.MovimentacaoOut:
    return schemas.MovimentacaoOut(
        id=m.id,
        produto_id=m.produto_id,
        produto_nome=m.produto.nome,
        produto_unidade=m.produto.unidade,
        pessoa_id=m.pessoa_id,
        pessoa_nome=m.pessoa.nome if m.pessoa else None,
        registrado_por_nome=m.registrado_por.nome if m.registrado_por else None,
        tipo=m.tipo,
        quantidade=m.quantidade,
        saldo_apos=m.saldo_apos,
        motivo=m.motivo,
        criado_em=m.criado_em,
        estorno_de_id=m.estorno_de_id,
        estornada=m.estornada,
        registrado_por_id=m.registrado_por_id,
    )


def registrar_movimentacao(
    db: Session,
    dados: schemas.MovimentacaoIn,
    registrado_por: models.Pessoa | None = None,
    estorno_de: models.Movimentacao | None = None,
) -> models.Movimentacao:
    """Aplica uma movimentação e confirma. Em caso de erro, nada é gravado."""
    try:
        mov = aplicar_movimentacao(db, dados, registrado_por, estorno_de)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    db.refresh(mov)
    return mov


def aplicar_movimentacao(
    db: Session,
    dados: schemas.MovimentacaoIn,
    registrado_por: models.Pessoa | None = None,
    estorno_de: models.Movimentacao | None = None,
    montagem_id: int | None = None,
) -> models.Movimentacao:
    """Altera o saldo de forma atômica, sem dar commit — quem chama decide (ex.: montagem com várias peças).

    O UPDATE condicional garante que duas retiradas simultâneas nunca deixem o saldo negativo.
    Se lançar HTTPException, quem chama deve dar rollback.
    """
    produto = db.get(models.Produto, dados.produto_id)
    if not produto:
        raise HTTPException(404, "Produto não encontrado")
    if produto.arquivado:
        raise HTTPException(409, "Produto arquivado: restaure-o antes de movimentar")

    if dados.pessoa_id is not None and not db.get(models.Pessoa, dados.pessoa_id):
        raise HTTPException(404, "Pessoa não encontrada")
    if dados.tipo == "retirada" and dados.pessoa_id is None:
        raise HTTPException(422, "Informe quem está retirando")
    if dados.tipo != "ajuste" and dados.quantidade <= 0:
        raise HTTPException(422, "A quantidade deve ser maior que zero")

    tabela = models.Produto
    if dados.tipo == "entrada":
        delta = dados.quantidade
        stmt = update(tabela).where(tabela.id == produto.id).values(quantidade=tabela.quantidade + delta)
    elif dados.tipo == "retirada":
        delta = -dados.quantidade
        stmt = (
            update(tabela)
            .where(tabela.id == produto.id, tabela.quantidade >= dados.quantidade)
            .values(quantidade=tabela.quantidade - dados.quantidade)
        )
    else:  # ajuste: quantidade é o novo saldo contado fisicamente
        anterior = produto.quantidade
        delta = dados.quantidade - anterior
        if delta == 0:
            raise HTTPException(422, "O saldo informado é igual ao atual")
        stmt = (
            update(tabela)
            .where(tabela.id == produto.id, tabela.quantidade == anterior)
            .values(quantidade=dados.quantidade)
        )

    if estorno_de is not None:
        # Marca o original no mesmo UPDATE condicional: dois "desfazer" simultâneos não estornam duas vezes
        marcado = db.execute(
            update(models.Movimentacao)
            .where(models.Movimentacao.id == estorno_de.id, models.Movimentacao.estornada.is_(False))
            .values(estornada=True)
        ).rowcount
        if not marcado:
            raise HTTPException(409, "Essa movimentação já foi desfeita")

    novo_saldo = db.execute(stmt.returning(tabela.quantidade)).scalar_one_or_none()
    if novo_saldo is None:
        if dados.tipo == "retirada":
            saldo = db.scalar(select(tabela.quantidade).where(tabela.id == produto.id))
            prefixo = "Não dá para desfazer: " if estorno_de else f"{produto.nome}: " if montagem_id else ""
            raise HTTPException(409, f"{prefixo}saldo insuficiente, há {formatar(saldo)} {produto.unidade} em estoque")
        raise HTTPException(409, "O saldo mudou enquanto você editava. Atualize a página e tente novamente.")

    mov = models.Movimentacao(
        produto_id=produto.id,
        pessoa_id=dados.pessoa_id,
        registrado_por_id=registrado_por.id if registrado_por else None,
        tipo=dados.tipo,
        quantidade=delta,
        saldo_apos=novo_saldo,
        motivo=dados.motivo,
        estorno_de_id=estorno_de.id if estorno_de else None,
        montagem_id=montagem_id,
    )
    db.add(mov)
    if dados.tipo == "entrada" and estorno_de is None and montagem_id is None:
        _abater_compra_manual(db, produto.id, dados.quantidade)
    db.flush()
    return mov


def _abater_compra_manual(db: Session, produto_id: int, recebido: float) -> None:
    """A compra chegou: desconta do item adicionado à mão na lista de compras e tira da lista quando completar."""
    item = db.scalar(select(models.ItemCompraManual).where(models.ItemCompraManual.produto_id == produto_id))
    if item is None:
        return
    if item.quantidade <= recebido:
        db.delete(item)
    else:
        item.quantidade -= recebido


def formatar(n: float) -> str:
    return str(int(n)) if float(n).is_integer() else f"{n:.2f}".rstrip("0").replace(".", ",")
