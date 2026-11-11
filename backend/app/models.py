from datetime import datetime, timezone

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, String, Text, TypeDecorator, UniqueConstraint
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
    criado_em: Mapped[datetime] = mapped_column(UTCDateTime, default=agora, index=True)

    produto: Mapped[Produto] = relationship(back_populates="movimentacoes")
    pessoa: Mapped[Pessoa | None] = relationship(foreign_keys=[pessoa_id])
    registrado_por: Mapped[Pessoa | None] = relationship(foreign_keys=[registrado_por_id])

    __table_args__ = (CheckConstraint("tipo IN ('entrada', 'retirada', 'ajuste')", name="ck_movimentacao_tipo"),)
