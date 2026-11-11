from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import auth, models, schemas
from ..auth import admin_requerido, usuario_atual
from ..db import get_db

fornecedores = APIRouter(prefix="/api/fornecedores", tags=["Fornecedores"], dependencies=[Depends(usuario_atual)])
pessoas = APIRouter(prefix="/api/pessoas", tags=["Pessoas"], dependencies=[Depends(usuario_atual)])
ADMIN = [Depends(admin_requerido)]


def _salvar(db: Session, msg_duplicado: str):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, msg_duplicado)


# ---------- Fornecedores ----------
def _fornecedor_out(f: models.Fornecedor, total: int) -> schemas.FornecedorOut:
    return schemas.FornecedorOut(**schemas.FornecedorIn.model_validate(f).model_dump(), id=f.id,
                                 criado_em=f.criado_em, total_produtos=total)


@fornecedores.get("", response_model=list[schemas.FornecedorOut])
def listar_fornecedores(db: Session = Depends(get_db)):
    total = (
        select(func.count(models.ProdutoFornecedor.id))
        .join(models.Produto)
        .where(models.ProdutoFornecedor.fornecedor_id == models.Fornecedor.id, models.Produto.arquivado.is_(False))
        .scalar_subquery()
    )
    linhas = db.execute(select(models.Fornecedor, total).order_by(func.lower(models.Fornecedor.nome)))
    return [_fornecedor_out(f, n) for f, n in linhas]


@fornecedores.post("", response_model=schemas.FornecedorOut, status_code=201, dependencies=ADMIN)
def criar_fornecedor(dados: schemas.FornecedorIn, db: Session = Depends(get_db)):
    f = models.Fornecedor(**dados.model_dump())
    db.add(f)
    _salvar(db, "Já existe um fornecedor com esse nome")
    return _fornecedor_out(f, 0)


@fornecedores.put("/{fornecedor_id}", response_model=schemas.FornecedorOut, dependencies=ADMIN)
def atualizar_fornecedor(fornecedor_id: int, dados: schemas.FornecedorIn, db: Session = Depends(get_db)):
    f = db.get(models.Fornecedor, fornecedor_id)
    if not f:
        raise HTTPException(404, "Fornecedor não encontrado")
    for campo, valor in dados.model_dump().items():
        setattr(f, campo, valor)
    _salvar(db, "Já existe um fornecedor com esse nome")
    return _fornecedor_out(f, len(f.produtos))


@fornecedores.delete("/{fornecedor_id}", status_code=204, dependencies=ADMIN)
def remover_fornecedor(fornecedor_id: int, db: Session = Depends(get_db)):
    f = db.get(models.Fornecedor, fornecedor_id)
    if not f:
        raise HTTPException(404, "Fornecedor não encontrado")
    db.delete(f)
    db.commit()
    return Response(status_code=204)


# ---------- Pessoas ----------
@pessoas.get("", response_model=list[schemas.PessoaOut])
def listar_pessoas(incluir_inativos: bool = False, db: Session = Depends(get_db)):
    stmt = select(models.Pessoa).order_by(func.lower(models.Pessoa.nome))
    if not incluir_inativos:
        stmt = stmt.where(models.Pessoa.ativo.is_(True))
    return list(db.scalars(stmt))


@pessoas.post("", response_model=schemas.PessoaOut, status_code=201, dependencies=ADMIN)
def criar_pessoa(dados: schemas.PessoaIn, db: Session = Depends(get_db)):
    p = models.Pessoa(**dados.model_dump())
    db.add(p)
    _salvar(db, "Já existe uma pessoa com esse nome")
    return p


@pessoas.put("/{pessoa_id}", response_model=schemas.PessoaOut, dependencies=ADMIN)
def atualizar_pessoa(
    pessoa_id: int, dados: schemas.PessoaIn, db: Session = Depends(get_db), eu: models.Pessoa = Depends(usuario_atual)
):
    p = _pessoa(db, pessoa_id)
    if not dados.ativo and p.id == eu.id:
        raise HTTPException(409, "Você não pode desativar a si mesmo")
    if not dados.ativo and p.papel == "admin":
        _garantir_outro_admin(db, p)
    for campo, valor in dados.model_dump().items():
        setattr(p, campo, valor)
    if not p.ativo:
        auth.encerrar_sessoes_de(db, p.id)
    _salvar(db, "Já existe uma pessoa com esse nome")
    return p


# ---------- Acesso ao site ----------
def _pessoa(db: Session, pessoa_id: int) -> models.Pessoa:
    p = db.get(models.Pessoa, pessoa_id)
    if not p:
        raise HTTPException(404, "Pessoa não encontrada")
    return p


def _garantir_outro_admin(db: Session, p: models.Pessoa):
    outros = db.scalar(
        select(func.count(models.Pessoa.id)).where(
            models.Pessoa.papel == "admin",
            models.Pessoa.ativo.is_(True),
            models.Pessoa.senha_hash.is_not(None),
            models.Pessoa.id != p.id,
        )
    )
    if not outros:
        raise HTTPException(409, "É preciso ter pelo menos um administrador ativo")


@pessoas.put("/{pessoa_id}/acesso", response_model=schemas.PessoaOut, dependencies=ADMIN)
def definir_acesso(pessoa_id: int, dados: schemas.AcessoIn, db: Session = Depends(get_db)):
    """Libera ou altera o login de uma pessoa. A senha é obrigatória na primeira liberação."""
    p = _pessoa(db, pessoa_id)
    if not p.ativo:
        raise HTTPException(409, "Reative a pessoa antes de liberar o acesso")
    if not p.senha_hash and not dados.senha:
        raise HTTPException(422, "Defina uma senha inicial")
    if p.papel == "admin" and dados.papel != "admin":
        _garantir_outro_admin(db, p)
    p.usuario, p.papel = dados.usuario, dados.papel
    if dados.senha:
        p.senha_hash = auth.gerar_hash(dados.senha)
        auth.encerrar_sessoes_de(db, p.id)
    _salvar(db, "Esse nome de usuário já está em uso")
    return p


@pessoas.delete("/{pessoa_id}/acesso", response_model=schemas.PessoaOut, dependencies=ADMIN)
def remover_acesso(pessoa_id: int, db: Session = Depends(get_db), eu: models.Pessoa = Depends(usuario_atual)):
    p = _pessoa(db, pessoa_id)
    if p.id == eu.id:
        raise HTTPException(409, "Você não pode remover o seu próprio acesso")
    if p.papel == "admin":
        _garantir_outro_admin(db, p)
    p.usuario = p.senha_hash = p.papel = None
    auth.encerrar_sessoes_de(db, p.id)
    db.commit()
    return p
