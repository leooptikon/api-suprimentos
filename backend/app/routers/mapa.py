"""Mapa: onde está cada unidade de produto próprio e cada envio de produto do estoque.

Local de cada coisa: a cidade escolhida nela (unidade ou envio); sem cidade, o local do projeto.
Cada ponto do mapa junta as coisas do mesmo tipo no mesmo lugar (um alfinete por tipo).
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas, services
from ..auth import usuario_atual
from ..db import get_db

router = APIRouter(prefix="/api", tags=["Mapa"], dependencies=[Depends(usuario_atual)])


class ItemNoPonto(BaseModel):
    texto: str  # nº de série, ou nome do produto
    detalhe: str | None = None  # situação, ou quantidade
    projeto: str | None = None


class Ponto(BaseModel):
    chave: str  # prefixo do produto próprio ("OLIE") ou "P<id>" do produto do estoque
    nome: str  # "OLIE" / "Mikrotik"
    proprio: bool  # produto próprio (unidade) ou item do estoque (envio)
    lat: float
    lng: float
    lugar: str | None  # "Macaé, RJ"
    total: float
    itens: list[ItemNoPonto]


class SemLocal(BaseModel):
    projeto_id: int | None
    projeto_nome: str | None
    chave: str
    nome: str
    proprio: bool
    total: float


class MapaOut(BaseModel):
    pontos: list[Ponto]
    sem_local: list[SemLocal]  # coisas num projeto sem local e sem cidade própria


class CidadeIn(BaseModel):
    cidade: schemas.Cidade | None = None  # None = volta a usar o local do projeto


def _onde(obj, projeto: models.Projeto | None) -> tuple[float, float, str | None] | None:
    if obj.cidade and obj.lat is not None and obj.lng is not None:
        return obj.lat, obj.lng, obj.cidade
    if projeto and projeto.lat is not None and projeto.lng is not None:
        return projeto.lat, projeto.lng, projeto.local_nome
    return None


ROTULO = {"em_producao": "Em produção", "pronto": "Pronto", "em_campo": "Em campo", "manutencao": "Manutenção"}


@router.get("/mapa", response_model=MapaOut)
def mapa(db: Session = Depends(get_db)):
    pontos: dict[tuple, Ponto] = {}
    sem: dict[tuple, SemLocal] = {}

    def juntar(chave, nome, proprio, onde, projeto, qtd, item):
        if onde is None:
            if projeto is None:
                return  # sem projeto e sem cidade: está no escritório, fora do mapa
            k = (projeto.id, chave)
            atual = sem.get(k) or SemLocal(projeto_id=projeto.id, projeto_nome=projeto.nome, chave=chave, nome=nome,
                                           proprio=proprio, total=0)
            atual.total += qtd
            sem[k] = atual
            return
        lat, lng, lugar = onde
        k = (round(lat, 4), round(lng, 4), chave)
        p = pontos.get(k) or Ponto(chave=chave, nome=nome, proprio=proprio, lat=lat, lng=lng, lugar=lugar, total=0, itens=[])
        p.total += qtd
        p.itens.append(item)
        pontos[k] = p

    unidades = db.scalars(
        select(models.Unidade)
        .where(models.Unidade.status != "desativado")
        .options(joinedload(models.Unidade.proprio), joinedload(models.Unidade.projeto))
        .order_by(models.Unidade.numero_serie)
    )
    for u in unidades:
        juntar(u.proprio.prefixo, u.proprio.nome, True, _onde(u, u.projeto), u.projeto, 1,
               ItemNoPonto(texto=u.numero_serie, detalhe=ROTULO.get(u.status), projeto=u.projeto.nome if u.projeto else None))

    envios = db.scalars(
        select(models.Movimentacao)
        .where(models.Movimentacao.tipo == "retirada", models.Movimentacao.estornada.is_(False),
               (models.Movimentacao.projeto_id.is_not(None)) | (models.Movimentacao.cidade.is_not(None)))
        .options(joinedload(models.Movimentacao.produto), joinedload(models.Movimentacao.projeto))
        .order_by(models.Movimentacao.criado_em)
    )
    for m in envios:
        qtd = abs(m.quantidade)
        juntar(f"P{m.produto_id}", m.produto.nome, False, _onde(m, m.projeto), m.projeto, qtd,
               ItemNoPonto(texto=m.produto.nome, detalhe=f"{services.formatar(qtd)} {m.produto.unidade}",
                           projeto=m.projeto.nome if m.projeto else None))

    return MapaOut(pontos=list(pontos.values()), sem_local=sorted(sem.values(), key=lambda s: (s.projeto_nome or "", s.nome)))


# ---------- Envios de um produto do estoque (aba "Localização" do produto) ----------
class EnvioOut(BaseModel):
    id: int
    criado_em: str
    quantidade: float
    pessoa_nome: str | None
    projeto_id: int | None
    projeto_nome: str | None
    cidade: schemas.Cidade | None  # própria
    lugar: str | None  # onde aparece no mapa (cidade própria ou do projeto)
    no_mapa: bool


@router.get("/produtos/{produto_id}/envios", response_model=list[EnvioOut])
def envios(produto_id: int, db: Session = Depends(get_db)):
    movs = db.scalars(
        select(models.Movimentacao)
        .where(models.Movimentacao.produto_id == produto_id, models.Movimentacao.tipo == "retirada",
               models.Movimentacao.estornada.is_(False))
        .options(joinedload(models.Movimentacao.projeto), joinedload(models.Movimentacao.pessoa))
        .order_by(models.Movimentacao.criado_em.desc())
        .limit(200)
    )
    saida = []
    for m in movs:
        onde = _onde(m, m.projeto)
        saida.append(EnvioOut(
            id=m.id, criado_em=m.criado_em.isoformat(), quantidade=abs(m.quantidade),
            pessoa_nome=m.pessoa.nome if m.pessoa else None, projeto_id=m.projeto_id,
            projeto_nome=m.projeto.nome if m.projeto else None, cidade=services.cidade_de(m),
            lugar=onde[2] if onde else None, no_mapa=onde is not None,
        ))
    return saida


@router.patch("/movimentacoes/{mov_id}/cidade", response_model=EnvioOut)
def mudar_cidade(mov_id: int, dados: CidadeIn, db: Session = Depends(get_db)):
    """Muda (ou tira) a cidade de um envio. Qualquer pessoa com login, como a própria retirada."""
    m = db.get(models.Movimentacao, mov_id)
    if not m or m.tipo != "retirada":
        raise HTTPException(404, "Retirada não encontrada")
    c = dados.cidade
    m.cidade, m.lat, m.lng = (c.nome, c.lat, c.lng) if c else (None, None, None)
    db.commit()
    onde = _onde(m, m.projeto)
    return EnvioOut(
        id=m.id, criado_em=m.criado_em.isoformat(), quantidade=abs(m.quantidade),
        pessoa_nome=m.pessoa.nome if m.pessoa else None, projeto_id=m.projeto_id,
        projeto_nome=m.projeto.nome if m.projeto else None, cidade=services.cidade_de(m),
        lugar=onde[2] if onde else None, no_mapa=onde is not None,
    )
