from datetime import datetime, timezone

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, String, Text, TypeDecorator, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def agora() -> datetime:
    return datetime.now(timezone.utc)


class UTCDateTime(TypeDecorator):
    """SQLite descarta o fuso; grava em UTC e devolve sempre com tzinfo=UTC."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None and value.tzinfo is not None:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value


class Produto(Base):
    __tablename__ = "produtos"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(160), index=True)
    categoria: Mapped[str | None] = mapped_column(String(80), index=True)
    descricao: Mapped[str | None] = mapped_column(Text)
    unidade: Mapped[str] = mapped_column(String(16), default="un")
    quantidade: Mapped[float] = mapped_column(Float, default=0)
    estoque_minimo: Mapped[float] = mapped_column(Float, default=0)
    localizacao: Mapped[str | None] = mapped_column(String(120))
    monitorar_preco: Mapped[bool] = mapped_column(Boolean, default=False)
    foto: Mapped[str | None] = mapped_column(String(80))
    arquivado: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    criado_em: Mapped[datetime] = mapped_column(UTCDateTime, default=agora)
    atualizado_em: Mapped[datetime] = mapped_column(UTCDateTime, default=agora, onupdate=agora)

    fornecedores: Mapped[list["ProdutoFornecedor"]] = relationship(
        back_populates="produto", cascade="all, delete-orphan", order_by="ProdutoFornecedor.preferido.desc()"
    )
    movimentacoes: Mapped[list["Movimentacao"]] = relationship(back_populates="produto")

    __table_args__ = (CheckConstraint("quantidade >= 0", name="ck_produto_quantidade_nao_negativa"),)


class Fornecedor(Base):
    __tablename__ = "fornecedores"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(120), unique=True)
    site: Mapped[str | None] = mapped_column(String(255))
    contato: Mapped[str | None] = mapped_column(String(160))
    observacoes: Mapped[str | None] = mapped_column(Text)
    criado_em: Mapped[datetime] = mapped_column(UTCDateTime, default=agora)

    produtos: Mapped[list["ProdutoFornecedor"]] = relationship(back_populates="fornecedor", cascade="all, delete-orphan")


class ProdutoFornecedor(Base):
    __tablename__ = "produto_fornecedor"

    id: Mapped[int] = mapped_column(primary_key=True)
    produto_id: Mapped[int] = mapped_column(ForeignKey("produtos.id", ondelete="CASCADE"))
    fornecedor_id: Mapped[int] = mapped_column(ForeignKey("fornecedores.id", ondelete="CASCADE"))
    url: Mapped[str | None] = mapped_column(String(500))
    preco: Mapped[float | None] = mapped_column(Float)
    preferido: Mapped[bool] = mapped_column(Boolean, default=False)
    # Preenchidos quando o preço vem da API do Mercado Livre (link de anúncio)
    preco_atualizado_em: Mapped[datetime | None] = mapped_column(UTCDateTime)
    frete_gratis: Mapped[bool | None] = mapped_column(Boolean)
    situacao_anuncio: Mapped[str | None] = mapped_column(String(24))
    erro_coleta: Mapped[str | None] = mapped_column(String(255))

    produto: Mapped[Produto] = relationship(back_populates="fornecedores")
    fornecedor: Mapped[Fornecedor] = relationship(back_populates="produtos")

    __table_args__ = (UniqueConstraint("produto_id", "fornecedor_id", name="uq_produto_fornecedor"),)


class Pessoa(Base):
    """Quem pode retirar itens. Se tiver usuário, senha e papel, também acessa o site."""

    __tablename__ = "pessoas"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(120), unique=True)
    setor: Mapped[str | None] = mapped_column(String(80))
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    usuario: Mapped[str | None] = mapped_column(String(40), unique=True)
    senha_hash: Mapped[str | None] = mapped_column(String(255))
    papel: Mapped[str | None] = mapped_column(String(16))
    criado_em: Mapped[datetime] = mapped_column(UTCDateTime, default=agora)

    __table_args__ = (CheckConstraint("papel IS NULL OR papel IN ('admin', 'membro')", name="ck_pessoa_papel"),)

    @property
    def tem_acesso(self) -> bool:
        return bool(self.ativo and self.usuario and self.senha_hash and self.papel)


class Sessao(Base):
    __tablename__ = "sessoes"

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    pessoa_id: Mapped[int] = mapped_column(ForeignKey("pessoas.id", ondelete="CASCADE"), index=True)
    expira_em: Mapped[datetime] = mapped_column(UTCDateTime)
    criado_em: Mapped[datetime] = mapped_column(UTCDateTime, default=agora)

    pessoa: Mapped[Pessoa] = relationship()


class Movimentacao(Base):
    """Toda alteração de saldo vira um registro. `quantidade` é o delta com sinal."""

    __tablename__ = "movimentacoes"

    id: Mapped[int] = mapped_column(primary_key=True)
    produto_id: Mapped[int] = mapped_column(ForeignKey("produtos.id"), index=True)
    pessoa_id: Mapped[int | None] = mapped_column(ForeignKey("pessoas.id"), index=True)
    registrado_por_id: Mapped[int | None] = mapped_column(ForeignKey("pessoas.id"))
    tipo: Mapped[str] = mapped_column(String(16), index=True)
    quantidade: Mapped[float] = mapped_column(Float)
    saldo_apos: Mapped[float] = mapped_column(Float)
    motivo: Mapped[str | None] = mapped_column(String(255))
    # "Desfazer" não apaga nada: cria o lançamento inverso e marca o original
    estorno_de_id: Mapped[int | None] = mapped_column(ForeignKey("movimentacoes.id"))
    estornada: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    # Retiradas feitas por uma montagem de produto próprio
    montagem_id: Mapped[int | None] = mapped_column(ForeignKey("montagens.id"), index=True)
    criado_em: Mapped[datetime] = mapped_column(UTCDateTime, default=agora, index=True)

    produto: Mapped[Produto] = relationship(back_populates="movimentacoes")
    pessoa: Mapped[Pessoa | None] = relationship(foreign_keys=[pessoa_id])
    registrado_por: Mapped[Pessoa | None] = relationship(foreign_keys=[registrado_por_id])

    __table_args__ = (CheckConstraint("tipo IN ('entrada', 'retirada', 'ajuste')", name="ck_movimentacao_tipo"),)


# ---------- Produtos próprios (o que a gente fabrica: Olie, sensores…) ----------
STATUS_UNIDADE = ("em_producao", "pronto", "em_campo", "manutencao", "desativado")


class ProdutoProprio(Base):
    __tablename__ = "produtos_proprios"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(120), unique=True)
    # Prefixo do número de série das unidades: OLIE → OLIE-0001
    prefixo: Mapped[str] = mapped_column(String(12), unique=True)
    tipo: Mapped[str | None] = mapped_column(String(60))
    descricao: Mapped[str | None] = mapped_column(Text)
    arquivado: Mapped[bool] = mapped_column(Boolean, default=False)
    criado_em: Mapped[datetime] = mapped_column(UTCDateTime, default=agora)

    componentes: Mapped[list["Componente"]] = relationship(
        back_populates="proprio", cascade="all, delete-orphan", order_by="Componente.id"
    )
    unidades: Mapped[list["Unidade"]] = relationship(back_populates="proprio")


class Componente(Base):
    """Quanto de cada peça do estoque vai em UMA unidade do produto próprio."""

    __tablename__ = "componentes"

    id: Mapped[int] = mapped_column(primary_key=True)
    proprio_id: Mapped[int] = mapped_column(ForeignKey("produtos_proprios.id", ondelete="CASCADE"))
    produto_id: Mapped[int] = mapped_column(ForeignKey("produtos.id"))
    quantidade: Mapped[float] = mapped_column(Float)

    proprio: Mapped[ProdutoProprio] = relationship(back_populates="componentes")
    produto: Mapped[Produto] = relationship()

    __table_args__ = (
        UniqueConstraint("proprio_id", "produto_id", name="uq_componente"),
        CheckConstraint("quantidade > 0", name="ck_componente_quantidade"),
    )


class Montagem(Base):
    """Um lote montado de uma vez: retira as peças e cria N unidades."""

    __tablename__ = "montagens"

    id: Mapped[int] = mapped_column(primary_key=True)
    proprio_id: Mapped[int] = mapped_column(ForeignKey("produtos_proprios.id"), index=True)
    quantidade: Mapped[int] = mapped_column(Integer)
    pessoa_id: Mapped[int | None] = mapped_column(ForeignKey("pessoas.id"))
    registrado_por_id: Mapped[int | None] = mapped_column(ForeignKey("pessoas.id"))
    observacao: Mapped[str | None] = mapped_column(String(255))
    cancelada: Mapped[bool] = mapped_column(Boolean, default=False)
    criado_em: Mapped[datetime] = mapped_column(UTCDateTime, default=agora)

    proprio: Mapped[ProdutoProprio] = relationship()
    pessoa: Mapped[Pessoa | None] = relationship(foreign_keys=[pessoa_id])
    movimentacoes: Mapped[list[Movimentacao]] = relationship()


class Unidade(Base):
    """Uma peça física montada (um Olie específico), com número de série e situação."""

    __tablename__ = "unidades"

    id: Mapped[int] = mapped_column(primary_key=True)
    proprio_id: Mapped[int] = mapped_column(ForeignKey("produtos_proprios.id"), index=True)
    montagem_id: Mapped[int | None] = mapped_column(ForeignKey("montagens.id"))
    sequencia: Mapped[int] = mapped_column(Integer)
    numero_serie: Mapped[str] = mapped_column(String(24), unique=True)
    status: Mapped[str] = mapped_column(String(16), index=True)
    local: Mapped[str | None] = mapped_column(String(160))
    observacao: Mapped[str | None] = mapped_column(Text)
    criado_em: Mapped[datetime] = mapped_column(UTCDateTime, default=agora)
    atualizado_em: Mapped[datetime] = mapped_column(UTCDateTime, default=agora, onupdate=agora)

    proprio: Mapped[ProdutoProprio] = relationship(back_populates="unidades")
    eventos: Mapped[list["EventoUnidade"]] = relationship(
        back_populates="unidade", cascade="all, delete-orphan", order_by="EventoUnidade.id.desc()"
    )

    __table_args__ = (
        UniqueConstraint("proprio_id", "sequencia", name="uq_unidade_sequencia"),
        CheckConstraint(f"status IN {STATUS_UNIDADE}", name="ck_unidade_status"),
    )


class EventoUnidade(Base):
    """Histórico: cada mudança de situação/local de uma unidade."""

    __tablename__ = "eventos_unidade"

    id: Mapped[int] = mapped_column(primary_key=True)
    unidade_id: Mapped[int] = mapped_column(ForeignKey("unidades.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(16))
    local: Mapped[str | None] = mapped_column(String(160))
    observacao: Mapped[str | None] = mapped_column(String(255))
    registrado_por_id: Mapped[int | None] = mapped_column(ForeignKey("pessoas.id"))
    criado_em: Mapped[datetime] = mapped_column(UTCDateTime, default=agora)

    unidade: Mapped[Unidade] = relationship(back_populates="eventos")
    registrado_por: Mapped[Pessoa | None] = relationship()


# ---------- Integração Mercado Livre ----------
class IntegracaoML(Base):
    """Uma linha só: a conta do Mercado Livre conectada e seus tokens (o refresh token é de uso único)."""

    __tablename__ = "integracao_ml"

    id: Mapped[int] = mapped_column(primary_key=True)
    access_token: Mapped[str | None] = mapped_column(String(255))
    refresh_token: Mapped[str | None] = mapped_column(String(255))
    expira_em: Mapped[datetime | None] = mapped_column(UTCDateTime)
    ml_user_id: Mapped[int | None] = mapped_column(Integer)
    nickname: Mapped[str | None] = mapped_column(String(120))
    conectado_em: Mapped[datetime | None] = mapped_column(UTCDateTime)
    # Autorização em andamento (OAuth com PKCE)
    estado_pendente: Mapped[str | None] = mapped_column(String(64))
    verificador_pendente: Mapped[str | None] = mapped_column(String(128))


class PrecoColetado(Base):
    """Histórico: cada leitura de preço de um anúncio."""

    __tablename__ = "precos_coletados"

    id: Mapped[int] = mapped_column(primary_key=True)
    vinculo_id: Mapped[int] = mapped_column(ForeignKey("produto_fornecedor.id", ondelete="CASCADE"), index=True)
    produto_id: Mapped[int] = mapped_column(ForeignKey("produtos.id", ondelete="CASCADE"), index=True)
    anuncio_id: Mapped[str] = mapped_column(String(24))
    titulo: Mapped[str | None] = mapped_column(String(255))
    preco: Mapped[float] = mapped_column(Float)
    frete_gratis: Mapped[bool | None] = mapped_column(Boolean)
    situacao: Mapped[str | None] = mapped_column(String(24))
    coletado_em: Mapped[datetime] = mapped_column(UTCDateTime, default=agora, index=True)


class ExecucaoColeta(Base):
    """Cada rodada de atualização (automática ou pelo botão)."""

    __tablename__ = "execucoes_coleta"

    id: Mapped[int] = mapped_column(primary_key=True)
    automatica: Mapped[bool] = mapped_column(Boolean, default=True)
    inicio: Mapped[datetime] = mapped_column(UTCDateTime, default=agora, index=True)
    fim: Mapped[datetime | None] = mapped_column(UTCDateTime)
    anuncios: Mapped[int] = mapped_column(Integer, default=0)
    atualizados: Mapped[int] = mapped_column(Integer, default=0)
    falhas: Mapped[int] = mapped_column(Integer, default=0)
    mensagem: Mapped[str | None] = mapped_column(String(255))
