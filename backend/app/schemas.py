from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)


def _vazio_para_none(v):
    return None if isinstance(v, str) and not v.strip() else v


# ---------- Fornecedor ----------
class FornecedorIn(_Base):
    nome: str = Field(min_length=1, max_length=120)
    site: str | None = Field(default=None, max_length=255)
    contato: str | None = Field(default=None, max_length=160)
    observacoes: str | None = None

    _limpa = field_validator("site", "contato", "observacoes", mode="before")(_vazio_para_none)


class FornecedorOut(FornecedorIn):
    id: int
    criado_em: datetime
    total_produtos: int = 0


# ---------- Pessoa ----------
class PessoaIn(_Base):
    nome: str = Field(min_length=1, max_length=120)
    setor: str | None = Field(default=None, max_length=80)
    ativo: bool = True

    _limpa = field_validator("setor", mode="before")(_vazio_para_none)


Papel = Literal["admin", "membro"]
SENHA_MIN = 4


def _normaliza_usuario(v):
    return v.strip().lower() if isinstance(v, str) else v


USUARIO_REGRA = dict(min_length=3, max_length=40, pattern=r"^[a-z0-9._-]+$")


class PessoaOut(PessoaIn):
    id: int
    usuario: str | None = None
    papel: Papel | None = None
    tem_acesso: bool = False


class AcessoIn(_Base):
    usuario: str = Field(**USUARIO_REGRA, description="Letras minúsculas, números, ponto, hífen ou _")
    papel: Papel
    senha: str | None = Field(default=None, min_length=SENHA_MIN, max_length=128, description="Obrigatória ao liberar o acesso pela primeira vez")

    _usuario = field_validator("usuario", mode="before")(_normaliza_usuario)


# ---------- Autenticação ----------
class LoginIn(_Base):
    usuario: str = Field(min_length=1, max_length=40)
    senha: str = Field(min_length=1, max_length=128)


class ConfigurarIn(_Base):
    nome: str = Field(min_length=1, max_length=120)
    usuario: str = Field(**USUARIO_REGRA)
    senha: str = Field(min_length=SENHA_MIN, max_length=128)

    _usuario = field_validator("usuario", mode="before")(_normaliza_usuario)


class TrocarSenhaIn(BaseModel):
    atual: str = Field(min_length=1, max_length=128)
    nova: str = Field(min_length=SENHA_MIN, max_length=128)


class UsuarioOut(_Base):
    id: int
    nome: str
    usuario: str
    papel: Papel
    setor: str | None = None


class EstadoAuth(BaseModel):
    configurado: bool


# ---------- Produto ----------
StatusEstoque = Literal["ok", "baixo", "esgotado"]


class ProdutoFornecedorIn(_Base):
    fornecedor_id: int
    url: str | None = Field(default=None, max_length=500)
    preco: float | None = Field(default=None, ge=0)
    preferido: bool = False

    _limpa = field_validator("url", mode="before")(_vazio_para_none)


class ProdutoFornecedorOut(ProdutoFornecedorIn):
    id: int
    fornecedor_nome: str


class ProdutoBase(_Base):
    nome: str = Field(min_length=1, max_length=160)
    categoria: str | None = Field(default=None, max_length=80)
    descricao: str | None = None
    unidade: str = Field(default="un", min_length=1, max_length=16)
    estoque_minimo: float = Field(default=0, ge=0)
    localizacao: str | None = Field(default=None, max_length=120)
    monitorar_preco: bool = False

    _limpa = field_validator("categoria", "descricao", "localizacao", mode="before")(_vazio_para_none)


class ProdutoCreate(ProdutoBase):
    quantidade_inicial: float = Field(default=0, ge=0)
    pessoa_id: int | None = None


class ProdutoUpdate(ProdutoBase):
    pass


class ProdutoOut(ProdutoBase):
    id: int
    quantidade: float
    arquivado: bool
    status: StatusEstoque
    criado_em: datetime
    atualizado_em: datetime
    fornecedor_preferido: str | None = None
    menor_preco: float | None = None
    foto_url: str | None = None


class ProdutoDetalhe(ProdutoOut):
    fornecedores: list[ProdutoFornecedorOut]


# ---------- Movimentação ----------
class MovimentacaoIn(_Base):
    produto_id: int
    tipo: Literal["entrada", "retirada", "ajuste"]
    quantidade: float = Field(ge=0, description="Entrada/retirada: quantidade movimentada. Ajuste: novo saldo contado.")
    pessoa_id: int | None = None
    motivo: str | None = Field(default=None, max_length=255)

    _limpa = field_validator("motivo", mode="before")(_vazio_para_none)


class MovimentacaoOut(_Base):
    id: int
    produto_id: int
    produto_nome: str
    produto_unidade: str
    pessoa_id: int | None
    pessoa_nome: str | None
    registrado_por_nome: str | None = None
    tipo: str
    quantidade: float
    saldo_apos: float
    motivo: str | None
    criado_em: datetime
    estorno_de_id: int | None = None
    estornada: bool = False
    registrado_por_id: int | None = None


# ---------- Dashboard ----------
class SerieDia(BaseModel):
    """Número de lançamentos no dia (não soma quantidades, que têm unidades diferentes)."""

    dia: str
    entradas: int
    retiradas: int


class RankingItem(BaseModel):
    produto_id: int
    nome: str
    categoria: str | None
    retiradas: int
    quantidade: float
    unidade: str


class DashboardOut(BaseModel):
    total_produtos: int
    total_categorias: int
    itens_com_preco: int
    abaixo_minimo: int
    esgotados: int
    retiradas_7d: int
    valor_estimado: float
    alertas: list[ProdutoOut]
    serie_14d: list[SerieDia]
    mais_retirados: list[RankingItem]
    ultimas: list[MovimentacaoOut]
