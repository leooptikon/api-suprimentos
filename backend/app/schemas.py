from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)


def _vazio_para_none(v):
    return None if isinstance(v, str) and not v.strip() else v


# ---------- Fornecedor ----------
SituacaoFornecedor = Literal["utilizado", "avaliacao", "nao_homologado"]


class ProprioResumo(BaseModel):
    id: int
    nome: str


class FornecedorIn(_Base):
    nome: str = Field(min_length=1, max_length=120)
    site: str | None = Field(default=None, max_length=255)
    contato: str | None = Field(default=None, max_length=160)
    localizacao: str | None = Field(default=None, max_length=120, description="Cidade")
    observacoes: str | None = None
    produto_fornecido: str | None = Field(default=None, max_length=255)
    prazo_producao: str | None = Field(default=None, max_length=60)
    situacao: SituacaoFornecedor = "utilizado"
    responsavel_id: int | None = None
    proprios_ids: list[int] = Field(default_factory=list, max_length=100, description="Produtos Optikon relacionados")

    _limpa = field_validator(
        "site", "contato", "localizacao", "observacoes", "produto_fornecido", "prazo_producao", mode="before"
    )(_vazio_para_none)


class FornecedorOut(FornecedorIn):
    id: int
    criado_em: datetime
    atualizado_em: datetime | None = None
    responsavel_nome: str | None = None
    proprios_nomes: list[str] = []
    # Produtos próprios que usam peças vinculadas a este fornecedor (sugestão para "Produto Optikon relacionado")
    proprios_sugeridos: list[ProprioResumo] = []
    produtos_vinculados: list[str] = []
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
    monitorado: bool = False
    preco_atualizado_em: datetime | None = None
    frete_gratis: bool | None = None
    situacao_anuncio: str | None = None
    erro_coleta: str | None = None


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
    link_compra: str | None = None
    loja_compra: str | None = None


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


# ---------- Lista de compras ----------
class OpcaoCompra(BaseModel):
    fornecedor_id: int
    fornecedor_nome: str
    fornecedor_localizacao: str | None = None
    preco: float | None
    url: str | None
    preferido: bool


class CompraManualOut(BaseModel):
    id: int
    quantidade: float
    motivo: str | None
    criado_por_nome: str | None
    atualizado_em: datetime


class CompraManualIn(_Base):
    produto_id: int
    quantidade: float = Field(gt=0)
    motivo: str | None = Field(default=None, max_length=160)

    _limpa = field_validator("motivo", mode="before")(_vazio_para_none)


class ItemCompra(BaseModel):
    produto: ProdutoOut
    # sugestão = reposição automática (se estiver no mínimo) + quantidade adicionada à mão
    sugestao: float
    meta: float
    automatico: bool = True  # está na lista por estar esgotado/no mínimo
    manual: CompraManualOut | None = None  # alguém adicionou à mão
    opcoes: list[OpcaoCompra]
    fornecedor_sugerido_id: int | None


class ItemExportar(BaseModel):
    produto_id: int
    quantidade: float = Field(gt=0)
    fornecedor_id: int | None = None


class ExportarComprasIn(BaseModel):
    itens: list[ItemExportar] = Field(min_length=1, max_length=500)


# ---------- Produtos próprios ----------
StatusUnidade = Literal["em_producao", "pronto", "em_campo", "manutencao", "desativado"]


class ComponenteIn(BaseModel):
    produto_id: int
    quantidade: float = Field(gt=0)


class ProprioIn(_Base):
    nome: str = Field(min_length=1, max_length=120)
    prefixo: str = Field(min_length=1, max_length=12, pattern=r"^[A-Z0-9]+$", description="Ex.: OLIE → OLIE-0001")
    tipo: str | None = Field(default=None, max_length=60)
    descricao: str | None = None
    componentes: list[ComponenteIn] = Field(default_factory=list, max_length=200)

    _limpa = field_validator("tipo", "descricao", mode="before")(_vazio_para_none)
    _prefixo = field_validator("prefixo", mode="before")(
        lambda v: "".join(ch for ch in v.upper() if ch.isalnum()) if isinstance(v, str) else v
    )


class ComponenteOut(BaseModel):
    produto_id: int
    produto_nome: str
    produto_categoria: str | None
    produto_unidade: str
    produto_foto_url: str | None
    produto_arquivado: bool
    quantidade: float
    em_estoque: float
    da_para: int
    falta_para_mais_um: float


class ProprioOut(BaseModel):
    id: int
    nome: str
    prefixo: str
    tipo: str | None
    descricao: str | None
    arquivado: bool
    capacidade: int | None
    gargalo: str | None
    por_status: dict[str, int]
    total_unidades: int
    criado_em: datetime


class ProprioDetalhe(ProprioOut):
    componentes: list[ComponenteOut]


class MontarIn(_Base):
    quantidade: int = Field(ge=1, le=500)
    pessoa_id: int | None = None
    status_inicial: Literal["em_producao", "pronto"] = "em_producao"
    observacao: str | None = Field(default=None, max_length=255)

    _limpa = field_validator("observacao", mode="before")(_vazio_para_none)


class UnidadeOut(BaseModel):
    id: int
    proprio_id: int
    proprio_nome: str
    numero_serie: str
    status: StatusUnidade
    projeto_id: int | None
    projeto_nome: str | None
    local: str | None  # texto livre antigo (antes dos projetos)
    observacao: str | None
    montagem_id: int | None
    criado_em: datetime
    atualizado_em: datetime


class UnidadeUpdate(_Base):
    status: StatusUnidade
    projeto_id: int | None = None
    local: str | None = Field(default=None, max_length=160)
    observacao: str | None = Field(default=None, max_length=255)

    _limpa = field_validator("local", "observacao", mode="before")(_vazio_para_none)


class EventoOut(BaseModel):
    id: int
    status: StatusUnidade
    projeto_nome: str | None
    local: str | None
    observacao: str | None
    registrado_por_nome: str | None
    criado_em: datetime


class MontagemOut(BaseModel):
    id: int
    quantidade: int
    unidades: list[UnidadeOut]
