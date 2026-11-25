from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from .. import cidades, models
from .. import onedrive as od
from ..auth import admin_requerido, usuario_atual
from ..db import get_db
from ..schemas import StatusUnidade

router = APIRouter(prefix="/api/projetos", tags=["Projetos"], dependencies=[Depends(usuario_atual)])
ADMIN = [Depends(admin_requerido)]


class UnidadeNoProjeto(BaseModel):
    id: int
    numero_serie: str
    proprio_id: int
    proprio_nome: str
    proprio_prefixo: str
    status: StatusUnidade


class ItemNoProjeto(BaseModel):
    """Produto do estoque mandado para o projeto por retirada (somado; retiradas desfeitas não contam)."""

    produto_id: int
    produto_nome: str
    unidade: str
    quantidade: float


class ProjetoOut(BaseModel):
    id: int
    nome: str  # exatamente o nome da pasta: "21.40 - TM ENGENHARIA"
    url: str | None
    no_onedrive: bool  # False = a pasta sumiu do OneDrive (não aparece mais para escolher)
    lat: float | None = None
    lng: float | None = None
    local_nome: str | None = None
    unidades: list[UnidadeNoProjeto]
    itens: list[ItemNoProjeto] = []


class OrigemOut(BaseModel):
    conectado: bool
    pasta_definida: bool
    pasta_nome: str | None
    pasta_url: str | None
    lidos_em: datetime | None
    erro: str | None


class LeituraOut(BaseModel):
    total: int
    novos: int
    renomeados: int
    sumiram: int


class PastaIn(BaseModel):
    link: str = Field(min_length=8, max_length=2000)


class LocalIn(BaseModel):
    """Sem coordenadas = projeto fora do Brasil: só o nome ("Portugal, Lisboa"), sem alfinete."""

    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    local_nome: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def _confere(self):
        if (self.lat is None) != (self.lng is None):
            raise ValueError("Informe latitude e longitude juntas")
        self.local_nome = " ".join((self.local_nome or "").split()) or None
        if self.lat is None and not self.local_nome:
            raise ValueError("Informe o lugar fora do Brasil")
        return self


class LugarOut(BaseModel):
    nome: str
    lat: float | None  # None = fora do Brasil
    lng: float | None
    curto: str | None = None  # "Macaé, RJ"


# ---------- Localização (para o mapa) ----------
@router.get("/geocodificar", response_model=list[LugarOut])
def geocodificar(q: str = Query(min_length=2, max_length=200)):
    """Busca uma cidade do Brasil na lista embutida (sem internet) para posicionar no mapa."""
    return [LugarOut(**c) for c in cidades.buscar(q)]


@router.put("/{projeto_id}/local", response_model=LugarOut, dependencies=ADMIN)
def definir_local(projeto_id: int, dados: LocalIn, db: Session = Depends(get_db)):
    p = db.get(models.Projeto, projeto_id)
    if not p:
        raise HTTPException(404, "Projeto não encontrado")
    p.lat, p.lng, p.local_nome = dados.lat, dados.lng, dados.local_nome
    db.commit()
    return LugarOut(nome=p.local_nome or "", lat=p.lat, lng=p.lng)


@router.delete("/{projeto_id}/local", status_code=204, dependencies=ADMIN)
def tirar_local(projeto_id: int, db: Session = Depends(get_db)):
    p = db.get(models.Projeto, projeto_id)
    if not p:
        raise HTTPException(404, "Projeto não encontrado")
    p.lat = p.lng = p.local_nome = None
    db.commit()
    return Response(status_code=204)


@router.get("", response_model=list[ProjetoOut])
def listar(db: Session = Depends(get_db)):
    projetos = sorted(db.scalars(select(models.Projeto)), key=lambda p: (od.chave_codigo(p.codigo), p.nome))
    unidades = db.scalars(
        select(models.Unidade)
        .where(models.Unidade.projeto_id.is_not(None))
        .options(joinedload(models.Unidade.proprio))
        .order_by(models.Unidade.numero_serie)
    )
    por_projeto: dict[int, list[UnidadeNoProjeto]] = {}
    for u in unidades:
        por_projeto.setdefault(u.projeto_id, []).append(
            UnidadeNoProjeto(id=u.id, numero_serie=u.numero_serie, proprio_id=u.proprio_id, proprio_nome=u.proprio.nome,
                             proprio_prefixo=u.proprio.prefixo, status=u.status)
        )
    # Retiradas com projeto, somadas por produto (as desfeitas ficam de fora)
    linhas = db.execute(
        select(models.Movimentacao.projeto_id, models.Produto.id, models.Produto.nome, models.Produto.unidade,
               func.sum(models.Movimentacao.quantidade))
        .join(models.Produto, models.Produto.id == models.Movimentacao.produto_id)
        .where(models.Movimentacao.projeto_id.is_not(None), models.Movimentacao.tipo == "retirada",
               models.Movimentacao.estornada.is_(False))
        .group_by(models.Movimentacao.projeto_id, models.Produto.id, models.Produto.nome, models.Produto.unidade)
    )
    itens: dict[int, list[ItemNoProjeto]] = {}
    for projeto_id, pid, nome, unidade, total in linhas:
        if abs(total) > 1e-9:
            itens.setdefault(projeto_id, []).append(
                ItemNoProjeto(produto_id=pid, produto_nome=nome, unidade=unidade, quantidade=abs(total))
            )
    return [
        ProjetoOut(id=p.id, nome=p.nome, url=p.url, no_onedrive=p.no_onedrive, lat=p.lat, lng=p.lng,
                   local_nome=p.local_nome, unidades=por_projeto.get(p.id, []),
                   itens=sorted(itens.get(p.id, []), key=lambda i: i.produto_nome.lower()))
        for p in projetos
    ]


@router.get("/origem", response_model=OrigemOut)
def origem(db: Session = Depends(get_db)):
    reg = db.get(models.IntegracaoOneDrive, 1)
    return OrigemOut(
        conectado=od.conectado(reg),
        pasta_definida=bool(reg and reg.projetos_pasta_id),
        pasta_nome=reg.projetos_pasta_nome if reg else None,
        pasta_url=reg.projetos_pasta_url if reg else None,
        lidos_em=reg.projetos_lidos_em if reg else None,
        erro=reg.projetos_erro if reg else None,
    )


@router.post("/pasta", response_model=LeituraOut, dependencies=ADMIN)
def pasta(dados: PastaIn, db: Session = Depends(get_db)):
    """Define a pasta cujas subpastas são os projetos e já lê os projetos."""
    try:
        return od.definir_pasta_projetos(db, dados.link)
    except od.ErroOneDrive as e:
        raise HTTPException(422, str(e))


@router.post("/atualizar", response_model=LeituraOut, dependencies=ADMIN)
def atualizar(db: Session = Depends(get_db)):
    try:
        return od.ler_projetos(db)
    except od.ErroOneDrive as e:
        raise HTTPException(409, str(e))
