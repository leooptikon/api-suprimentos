"""Mapa: onde está cada unidade de produto próprio e cada envio de produto do estoque.

Local de cada coisa: a cidade escolhida nela (unidade ou envio); sem cidade, o local do projeto.
Fora do Brasil (cidade sem coordenadas): não vira alfinete, vai para a lista "Fora do Brasil".
Cada ponto do mapa junta as coisas do mesmo tipo no mesmo lugar (um alfinete por tipo).
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas, services
from ..auth import usuario_atual
from ..db import get_db

router = APIRouter(prefix="/api", tags=["Mapa"], dependencies=[Depends(usuario_atual)])


class ItemNoPonto(BaseModel):
    id: int  # da unidade ou da retirada (envio)
    tipo: Literal["unidade", "envio"]
    origem: Literal["cidade", "projeto"]  # o local vem da cidade dele ou do projeto
    texto: str  # nº de série, ou nome do produto
    detalhe: str | None = None  # situação, ou quantidade
    projeto_id: int | None = None
    projeto: str | None = None
    cidade: schemas.Cidade | None = None  # própria


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


class Fora(BaseModel):
    """Coisas do mesmo tipo no mesmo lugar fora do Brasil."""

    chave: str
    nome: str
    proprio: bool
    lugar: str  # "Portugal, Lisboa"
    total: float
    itens: list[ItemNoPonto]


class MapaOut(BaseModel):
    pontos: list[Ponto]
    sem_local: list[SemLocal]  # coisas num projeto sem local e sem cidade própria
    fora: list[Fora]  # coisas fora do Brasil (sem alfinete)


class CidadeIn(BaseModel):
    cidade: schemas.Cidade | None = None  # None = volta a usar o local do projeto


def _fora(obj) -> bool:
    """Tem lugar próprio, mas fora do Brasil (sem coordenadas)."""
    return bool(obj.cidade) and (obj.lat is None or obj.lng is None)


def _onde(obj, projeto: models.Projeto | None) -> tuple[float, float, str | None] | None:
    """Onde aparece no mapa do Brasil. Fora do Brasil = None (não usa o local do projeto)."""
    if _fora(obj):
        return None
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
    fora: dict[tuple, Fora] = {}

    def juntar(chave, nome, proprio, obj, projeto, qtd, item):
        if _fora(obj):
            k = (obj.cidade.casefold(), chave)
            f = fora.get(k) or Fora(chave=chave, nome=nome, proprio=proprio, lugar=obj.cidade, total=0, itens=[])
            f.total += qtd
            f.itens.append(item)
            fora[k] = f
            return
        onde = _onde(obj, projeto)
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
        juntar(u.proprio.prefixo, u.proprio.nome, True, u, u.projeto, 1,
               ItemNoPonto(id=u.id, tipo="unidade", origem="cidade" if services.cidade_de(u) else "projeto",
                           texto=u.numero_serie, detalhe=ROTULO.get(u.status), projeto_id=u.projeto_id,
                           projeto=u.projeto.nome if u.projeto else None, cidade=services.cidade_de(u)))

    envios = db.scalars(
        select(models.Movimentacao)
        .where(models.Movimentacao.tipo == "retirada", models.Movimentacao.estornada.is_(False),
               (models.Movimentacao.projeto_id.is_not(None)) | (models.Movimentacao.cidade.is_not(None)))
        .options(joinedload(models.Movimentacao.produto), joinedload(models.Movimentacao.projeto))
        .order_by(models.Movimentacao.criado_em)
    )
    for m in envios:
        qtd = abs(m.quantidade)
        juntar(f"P{m.produto_id}", m.produto.nome, False, m, m.projeto, qtd,
               ItemNoPonto(id=m.id, tipo="envio", origem="cidade" if services.cidade_de(m) else "projeto",
                           texto=m.produto.nome, detalhe=f"{services.formatar(qtd)} {m.produto.unidade}",
                           projeto_id=m.projeto_id, projeto=m.projeto.nome if m.projeto else None,
                           cidade=services.cidade_de(m)))

    return MapaOut(pontos=list(pontos.values()), sem_local=sorted(sem.values(), key=lambda s: (s.projeto_nome or "", s.nome)),
                   fora=sorted(fora.values(), key=lambda f: (f.lugar.casefold(), f.nome)))


@router.get("/mapa/lugares-fora", response_model=list[str])
def lugares_fora(db: Session = Depends(get_db)):
    """Lugares fora do Brasil já usados (para sugerir e não ter "EUA" e "Estados Unidos")."""
    nomes: dict[str, str] = {}
    for tabela in (models.Unidade, models.Movimentacao):
        for nome in db.scalars(select(tabela.cidade).where(tabela.cidade.is_not(None), tabela.lat.is_(None)).distinct()):
            nomes.setdefault(nome.casefold(), nome)
    return sorted(nomes.values(), key=str.casefold)


# ---------- Envios de um produto do estoque (aba "Localização" do produto) ----------
class EnvioOut(BaseModel):
    id: int
    criado_em: str
    quantidade: float
    pessoa_nome: str | None
    projeto_id: int | None
    projeto_nome: str | None
    cidade: schemas.Cidade | None  # própria
    lugar: str | None  # onde aparece no mapa (cidade própria ou do projeto); fora do Brasil: o lugar
    no_mapa: bool
    fora_do_brasil: bool = False


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
            lugar=m.cidade if _fora(m) else (onde[2] if onde else None), no_mapa=onde is not None,
            fora_do_brasil=_fora(m),
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
        lugar=m.cidade if _fora(m) else (onde[2] if onde else None), no_mapa=onde is not None,
        fora_do_brasil=_fora(m),
    )


@router.patch("/proprios/unidades/{unidade_id}/cidade", response_model=schemas.UnidadeOut)
def mudar_cidade_unidade(unidade_id: int, dados: CidadeIn, db: Session = Depends(get_db)):
    """Muda (ou tira) só a cidade de uma unidade, sem mexer na situação. Qualquer pessoa com login."""
    from .proprios import _unidade_out

    u = db.scalar(select(models.Unidade).where(models.Unidade.id == unidade_id).options(
        joinedload(models.Unidade.proprio), joinedload(models.Unidade.projeto)))
    if not u:
        raise HTTPException(404, "Unidade não encontrada")
    c = dados.cidade
    u.cidade, u.lat, u.lng = (c.nome, c.lat, c.lng) if c else (None, None, None)
    u.atualizado_em = models.agora()
    db.commit()
    db.refresh(u)
    return _unidade_out(u)
