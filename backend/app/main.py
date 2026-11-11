from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from sqlalchemy import inspect, text

from .db import Base, engine
from .routers import autenticacao, cadastros, compras, movimentacoes, produtos, proprios

Base.metadata.create_all(engine)


def _migrar():
    """Ajustes de esquema em bancos já existentes (até adotarmos Alembic)."""
    insp = inspect(engine)
    pessoas = {c["name"] for c in insp.get_columns("pessoas")}
    movs = {c["name"] for c in insp.get_columns("movimentacoes")}
    produtos_cols = {c["name"] for c in insp.get_columns("produtos")}
    with engine.begin() as con:
        if "email" in pessoas and "usuario" not in pessoas:
            con.execute(text("ALTER TABLE pessoas RENAME COLUMN email TO usuario"))
        if "estorno_de_id" not in movs:
            con.execute(text("ALTER TABLE movimentacoes ADD COLUMN estorno_de_id INTEGER REFERENCES movimentacoes(id)"))
        if "foto" not in produtos_cols:
            con.execute(text("ALTER TABLE produtos ADD COLUMN foto VARCHAR(80)"))
        if "montagem_id" not in movs:
            con.execute(text("ALTER TABLE movimentacoes ADD COLUMN montagem_id INTEGER REFERENCES montagens(id)"))
        if "estornada" not in movs:
            con.execute(text("ALTER TABLE movimentacoes ADD COLUMN estornada BOOLEAN NOT NULL DEFAULT 0"))


_migrar()

app = FastAPI(
    title="Suprimentos API",
    description="Controle de estoque e suprimentos do escritório.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5180", "http://127.0.0.1:5180"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(autenticacao.router)
app.include_router(produtos.router)
app.include_router(cadastros.fornecedores)
app.include_router(cadastros.pessoas)
app.include_router(movimentacoes.router)
app.include_router(compras.router)
app.include_router(proprios.router)


@app.get("/api/saude", tags=["Sistema"])
def saude():
    return {"status": "ok"}


# Em produção o backend também entrega o frontend compilado (frontend/dist).
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{caminho:path}", include_in_schema=False)
    def spa(caminho: str):
        if caminho.startswith("api/"):
            raise HTTPException(404)
        arquivo = DIST / caminho
        if caminho and arquivo.is_file() and DIST in arquivo.resolve().parents:
            return FileResponse(arquivo)
        return FileResponse(DIST / "index.html")
