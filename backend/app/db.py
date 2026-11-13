import os
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

def _carregar_env():
    """Lê backend/.env (CHAVE=valor por linha) sem sobrescrever variáveis já definidas no ambiente."""
    arquivo = Path(__file__).resolve().parent.parent / ".env"
    if not arquivo.is_file():
        return
    for linha in arquivo.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, valor = linha.split("=", 1)
        os.environ.setdefault(chave.strip(), valor.strip().strip('"').strip("'"))


# Precisa rodar antes de qualquer módulo ler os.getenv (ex.: mercadolivre.py)
_carregar_env()

DATA_DIR = Path(os.getenv("SUPRIMENTOS_DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

def _url_do_banco() -> str:
    """DATABASE_URL (ex.: Postgres do Supabase) ou, sem ela, o SQLite local em data/estoque.db."""
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        return f"sqlite:///{DATA_DIR / 'estoque.db'}"
    # O Supabase mostra "postgresql://…"; o SQLAlchemy precisa saber que o driver é o psycopg 3
    for prefixo in ("postgres://", "postgresql://"):
        if url.startswith(prefixo):
            return "postgresql+psycopg://" + url[len(prefixo):]
    return url


DATABASE_URL = _url_do_banco()
POSTGRES = DATABASE_URL.startswith("postgresql")

engine = create_engine(
    DATABASE_URL,
    connect_args=(
        # prepare_threshold=None: o pooler do Supabase (porta 6543) não aceita prepared statements
        {"prepare_threshold": None, "connect_timeout": 10}
        if POSTGRES
        else {"check_same_thread": False}
    ),
    # Banco na nuvem: testa a conexão antes de usar (o pooler derruba conexões paradas) e usa poucas conexões
    **({"pool_pre_ping": True, "pool_size": 5, "max_overflow": 5, "pool_recycle": 1800} if POSTGRES else {}),
)


if DATABASE_URL.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
