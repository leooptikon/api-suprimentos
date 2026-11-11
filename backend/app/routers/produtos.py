import secrets
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas, services
from ..auth import admin_requerido, usuario_atual
from ..db import DATA_DIR, get_db

router = APIRouter(prefix="/api/produtos", tags=["Produtos"], dependencies=[Depends(usuario_atual)])
ADMIN = [Depends(admin_requerido)]


def _carregar(db: Session, produto_id: int) -> models.Produto:
    produto = db.scalar(
        select(models.Produto)
        .where(models.Produto.id == produto_id)
        .options(selectinload(models.Produto.fornecedores).selectinload(models.ProdutoFornecedor.fornecedor))
    )
    if not produto:
        raise HTTPException(404, "Produto não encontrado")
    return produto


@router.get("", response_model=list[schemas.ProdutoOut])
def listar(
    busca: str | None = None,
    categoria: str | None = None,
    local: str | None = Query(None, description="Local (ex.: 'Armário A'). Use '__sem__' para produtos sem local."),
    status: Literal["ok", "baixo", "esgotado"] | None = None,
    arquivados: bool = False,
    db: Session = Depends(get_db),
):
    stmt = (
        select(models.Produto)
        .where(models.Produto.arquivado == arquivados)
        .options(selectinload(models.Produto.fornecedores).selectinload(models.ProdutoFornecedor.fornecedor))
        .order_by(func.lower(models.Produto.nome))
    )
    if busca:
        termo = f"%{busca.strip()}%"
        stmt = stmt.where(
            or_(
                models.Produto.nome.ilike(termo),
                models.Produto.categoria.ilike(termo),
                models.Produto.localizacao.ilike(termo),
                models.Produto.descricao.ilike(termo),
            )
        )
    if categoria:
        stmt = stmt.where(models.Produto.categoria == categoria)
    if local == SEM_LOCAL:
        stmt = stmt.where(models.Produto.localizacao.is_(None))
    elif local:
        stmt = stmt.where(func.lower(models.Produto.localizacao) == local.strip().lower())

    produtos = [services.produto_out(p) for p in db.scalars(stmt)]
    if status:
        produtos = [p for p in produtos if p.status == status]
    return produtos


SEM_LOCAL = "__sem__"


@router.get("/locais", response_model=list[str])
def locais(db: Session = Depends(get_db)):
    """Locais usados pelos produtos ativos (para o filtro e para sugerir ao cadastrar)."""
    stmt = (
        select(models.Produto.localizacao)
        .where(models.Produto.localizacao.is_not(None), models.Produto.arquivado.is_(False))
        .distinct()
        .order_by(func.lower(models.Produto.localizacao))
    )
    return list(db.scalars(stmt))


@router.get("/categorias", response_model=list[str])
def categorias(db: Session = Depends(get_db)):
    stmt = (
        select(models.Produto.categoria)
        .where(models.Produto.categoria.is_not(None), models.Produto.arquivado.is_(False))
        .distinct()
        .order_by(models.Produto.categoria)
    )
    return list(db.scalars(stmt))


@router.post("", response_model=schemas.ProdutoDetalhe, status_code=201, dependencies=ADMIN)
def criar(dados: schemas.ProdutoCreate, db: Session = Depends(get_db), usuario: models.Pessoa = Depends(usuario_atual)):
    if dados.pessoa_id is not None and not db.get(models.Pessoa, dados.pessoa_id):
        raise HTTPException(404, "Pessoa não encontrada")
    produto =models.Produto(**dados.model_dump(exclude={"quantidade_inicial", "pessoa_id"}), quantidade=0)
    db.add(produto)
    db.commit()
    if dados.quantidade_inicial > 0:
        services.registrar_movimentacao(
            db,
            schemas.MovimentacaoIn(
                produto_id=produto.id,
                tipo="entrada",
                quantidade=dados.quantidade_inicial,
                pessoa_id=dados.pessoa_id,
                motivo="Cadastro inicial",
            ),
            registrado_por=usuario,
        )
    return services.produto_detalhe(_carregar(db, produto.id))


@router.get("/{produto_id}", response_model=schemas.ProdutoDetalhe)
def obter(produto_id: int, db: Session = Depends(get_db)):
    return services.produto_detalhe(_carregar(db, produto_id))


@router.put("/{produto_id}", response_model=schemas.ProdutoDetalhe, dependencies=ADMIN)
def atualizar(produto_id: int, dados: schemas.ProdutoUpdate, db: Session = Depends(get_db)):
    produto = _carregar(db, produto_id)
    for campo, valor in dados.model_dump().items():
        setattr(produto, campo, valor)
    db.commit()
    return services.produto_detalhe(_carregar(db, produto_id))


@router.delete("/{produto_id}", status_code=204, dependencies=ADMIN)
def remover(produto_id: int, definitivo: bool = Query(False), db: Session = Depends(get_db)):
    """Por padrão arquiva (some das listas, mas o histórico fica).

    `definitivo=true` só é aceito para produtos já arquivados e apaga também o histórico.
    """
    produto = _carregar(db, produto_id)
    if not definitivo:
        produto.arquivado = True
        db.commit()
        return Response(status_code=204)

    if not produto.arquivado:
        raise HTTPException(409, "Arquive o produto antes de excluí-lo definitivamente")
    usado_em = db.scalars(
        select(models.ProdutoProprio.nome).join(models.Componente).where(models.Componente.produto_id == produto_id)
    ).all()
    if usado_em:
        raise HTTPException(409, f"Essa peça faz parte de: {', '.join(usado_em)}. Tire-a da composição antes de excluir.")
    db.execute(delete(models.Movimentacao).where(models.Movimentacao.produto_id == produto_id))
    foto = produto.foto
    db.delete(produto)
    db.commit()
    _apagar_foto(foto)
    return Response(status_code=204)


@router.post("/{produto_id}/restaurar", response_model=schemas.ProdutoDetalhe, dependencies=ADMIN)
def restaurar(produto_id: int, db: Session = Depends(get_db)):
    produto = _carregar(db, produto_id)
    produto.arquivado = False
    db.commit()
    return services.produto_detalhe(_carregar(db, produto_id))


# ---------- Fornecedores do produto ----------
@router.post("/{produto_id}/fornecedores", response_model=schemas.ProdutoDetalhe, status_code=201, dependencies=ADMIN)
def vincular_fornecedor(produto_id: int, dados: schemas.ProdutoFornecedorIn, db: Session = Depends(get_db)):
    produto = _carregar(db, produto_id)
    if not db.get(models.Fornecedor, dados.fornecedor_id):
        raise HTTPException(404, "Fornecedor não encontrado")
    if dados.preferido:
        for pf in produto.fornecedores:
            pf.preferido = False
    produto.fornecedores.append(models.ProdutoFornecedor(**dados.model_dump()))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Este fornecedor já está vinculado ao produto")
    return services.produto_detalhe(_carregar(db, produto_id))


@router.put("/{produto_id}/fornecedores/{vinculo_id}", response_model=schemas.ProdutoDetalhe, dependencies=ADMIN)
def atualizar_vinculo(
    produto_id: int, vinculo_id: int, dados: schemas.ProdutoFornecedorIn, db: Session = Depends(get_db)
):
    produto = _carregar(db, produto_id)
    vinculo = next((pf for pf in produto.fornecedores if pf.id == vinculo_id), None)
    if not vinculo:
        raise HTTPException(404, "Vínculo não encontrado")
    if dados.preferido:
        for pf in produto.fornecedores:
            pf.preferido = False
    if dados.url != vinculo.url:
        vinculo.preco_atualizado_em = vinculo.frete_gratis = vinculo.situacao_anuncio = vinculo.erro_coleta = None
    for campo, valor in dados.model_dump().items():
        setattr(vinculo, campo, valor)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Este fornecedor já está vinculado ao produto")
    return services.produto_detalhe(_carregar(db, produto_id))


@router.delete("/{produto_id}/fornecedores/{vinculo_id}", response_model=schemas.ProdutoDetalhe, dependencies=ADMIN)
def desvincular_fornecedor(produto_id: int, vinculo_id: int, db: Session = Depends(get_db)):
    produto = _carregar(db, produto_id)
    vinculo = next((pf for pf in produto.fornecedores if pf.id == vinculo_id), None)
    if not vinculo:
        raise HTTPException(404, "Vínculo não encontrado")
    produto.fornecedores.remove(vinculo)
    db.commit()
    return services.produto_detalhe(_carregar(db, produto_id))


# ---------- Foto ----------
FOTOS = DATA_DIR / "fotos"
FOTOS.mkdir(parents=True, exist_ok=True)
FOTO_MAX = 3 * 1024 * 1024
# Confere os primeiros bytes do arquivo, não só o Content-Type informado
_ASSINATURAS = {
    "jpg": lambda b: b.startswith(b"\xff\xd8\xff"),
    "png": lambda b: b.startswith(b"\x89PNG\r\n\x1a\n"),
    "webp": lambda b: b[:4] == b"RIFF" and b[8:12] == b"WEBP",
}
_MIME = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


def _apagar_foto(nome: str | None):
    if nome:
        (FOTOS / nome).unlink(missing_ok=True)


@router.put("/{produto_id}/foto", response_model=schemas.ProdutoDetalhe, dependencies=ADMIN)
async def enviar_foto(produto_id: int, request: Request, db: Session = Depends(get_db)):
    """Recebe a imagem crua no corpo (o site já reduz para ~800px em WebP antes de enviar)."""
    produto = _carregar(db, produto_id)
    dados = await request.body()
    if not dados:
        raise HTTPException(422, "Nenhuma imagem enviada")
    if len(dados) > FOTO_MAX:
        raise HTTPException(413, "A imagem deve ter no máximo 3 MB")
    ext = next((e for e, confere in _ASSINATURAS.items() if confere(dados)), None)
    if not ext:
        raise HTTPException(415, "Formato não suportado. Use JPG, PNG ou WebP")

    antiga = produto.foto
    produto.foto = f"{produto.id}-{secrets.token_hex(6)}.{ext}"
    (FOTOS / produto.foto).write_bytes(dados)
    db.commit()
    _apagar_foto(antiga)
    return services.produto_detalhe(_carregar(db, produto_id))


@router.get("/{produto_id}/foto", include_in_schema=False)
def ver_foto(produto_id: int, db: Session = Depends(get_db)):
    produto = db.get(models.Produto, produto_id)
    if not produto or not produto.foto or not (FOTOS / produto.foto).is_file():
        raise HTTPException(404, "Produto sem foto")
    return FileResponse(
        FOTOS / produto.foto,
        media_type=_MIME[produto.foto.rsplit(".", 1)[1]],
        headers={"Cache-Control": "private, max-age=31536000, immutable"},
    )


@router.delete("/{produto_id}/foto", response_model=schemas.ProdutoDetalhe, dependencies=ADMIN)
def remover_foto(produto_id: int, db: Session = Depends(get_db)):
    produto = _carregar(db, produto_id)
    antiga, produto.foto = produto.foto, None
    db.commit()
    _apagar_foto(antiga)
    return services.produto_detalhe(_carregar(db, produto_id))
