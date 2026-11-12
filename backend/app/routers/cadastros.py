from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .. import auth, models, relatorios, schemas
from ..auth import admin_requerido, usuario_atual
from ..db import get_db
from ..planilhas import download, planilha

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
def _query_fornecedores():
    return select(models.Fornecedor).options(
        selectinload(models.Fornecedor.responsavel),
        selectinload(models.Fornecedor.proprios),
        selectinload(models.Fornecedor.produtos).selectinload(models.ProdutoFornecedor.produto),
    )


def _sugeridos(db: Session) -> dict[int, list[schemas.ProprioResumo]]:
    """Fornecedor → produtos próprios que usam alguma peça vinculada a ele."""
    linhas = db.execute(
        select(models.ProdutoFornecedor.fornecedor_id, models.ProdutoProprio.id, models.ProdutoProprio.nome)
        .join(models.Componente, models.Componente.produto_id == models.ProdutoFornecedor.produto_id)
        .join(models.ProdutoProprio, models.ProdutoProprio.id == models.Componente.proprio_id)
        .where(models.ProdutoProprio.arquivado.is_(False))
        .distinct()
        .order_by(func.lower(models.ProdutoProprio.nome))
    )
    mapa: dict[int, list[schemas.ProprioResumo]] = {}
    for fid, pid, nome in linhas:
        mapa.setdefault(fid, []).append(schemas.ProprioResumo(id=pid, nome=nome))
    return mapa


def fornecedor_out(f: models.Fornecedor, sugeridos: list[schemas.ProprioResumo]) -> schemas.FornecedorOut:
    ativos = sorted((v.produto.nome for v in f.produtos if not v.produto.arquivado), key=str.lower)
    return schemas.FornecedorOut(
        id=f.id, nome=f.nome, site=f.site, contato=f.contato, localizacao=f.localizacao, observacoes=f.observacoes,
        produto_fornecido=f.produto_fornecido, prazo_producao=f.prazo_producao, situacao=f.situacao,
        responsavel_id=f.responsavel_id, responsavel_nome=f.responsavel.nome if f.responsavel else None,
        proprios_ids=[p.id for p in f.proprios], proprios_nomes=[p.nome for p in f.proprios],
        proprios_sugeridos=sugeridos, produtos_vinculados=ativos, total_produtos=len(ativos),
        criado_em=f.criado_em, atualizado_em=f.atualizado_em,
    )


def listar(db: Session) -> list[schemas.FornecedorOut]:
    sugeridos = _sugeridos(db)
    lista = db.scalars(_query_fornecedores().order_by(func.lower(models.Fornecedor.nome)))
    return [fornecedor_out(f, sugeridos.get(f.id, [])) for f in lista]


def _aplicar(db: Session, f: models.Fornecedor, dados: schemas.FornecedorIn):
    if dados.responsavel_id is not None and not db.get(models.Pessoa, dados.responsavel_id):
        raise HTTPException(404, "Responsável não encontrado")
    proprios = list(db.scalars(select(models.ProdutoProprio).where(models.ProdutoProprio.id.in_(dados.proprios_ids))))
    if len(proprios) != len(set(dados.proprios_ids)):
        raise HTTPException(404, "Produto Optikon não encontrado")
    for campo, valor in dados.model_dump(exclude={"proprios_ids"}).items():
        setattr(f, campo, valor)
    f.proprios = proprios
    f.atualizado_em = models.agora()


def _obter(db: Session, fornecedor_id: int) -> schemas.FornecedorOut:
    f = db.scalar(_query_fornecedores().where(models.Fornecedor.id == fornecedor_id))
    return fornecedor_out(f, _sugeridos(db).get(f.id, []))


@fornecedores.get("", response_model=list[schemas.FornecedorOut])
def listar_fornecedores(db: Session = Depends(get_db)):
    return listar(db)


@fornecedores.get("/exportar.xlsx", tags=["Exportação"])
def exportar_fornecedores(db: Session = Depends(get_db)):
    colunas, linhas = relatorios.fornecedores(db)
    return download(planilha("Cadastro de Fornecedores", colunas, linhas), "fornecedores")


@fornecedores.post("", response_model=schemas.FornecedorOut, status_code=201, dependencies=ADMIN)
def criar_fornecedor(dados: schemas.FornecedorIn, db: Session = Depends(get_db)):
    f = models.Fornecedor()
    _aplicar(db, f, dados)
    db.add(f)
    _salvar(db, "Já existe um fornecedor com esse nome")
    return _obter(db, f.id)


@fornecedores.put("/{fornecedor_id}", response_model=schemas.FornecedorOut, dependencies=ADMIN)
def atualizar_fornecedor(fornecedor_id: int, dados: schemas.FornecedorIn, db: Session = Depends(get_db)):
    f = db.get(models.Fornecedor, fornecedor_id)
    if not f:
        raise HTTPException(404, "Fornecedor não encontrado")
    _aplicar(db, f, dados)
    _salvar(db, "Já existe um fornecedor com esse nome")
    return _obter(db, f.id)


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
