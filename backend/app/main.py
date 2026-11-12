from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from sqlalchemy import inspect, text

from .db import Base, engine
from . import mercadolivre, onedrive
from .db import SessionLocal
from .routers import autenticacao, cadastros, compras, integracoes, movimentacoes, produtos, proprios
from .routers import onedrive as rotas_onedrive
from .routers import projetos

Base.metadata.create_all(engine)


def _migrar():
    """Ajustes de esquema em bancos já existentes (até adotarmos Alembic)."""
    insp = inspect(engine)
    pessoas = {c["name"] for c in insp.get_columns("pessoas")}
    movs = {c["name"] for c in insp.get_columns("movimentacoes")}
    produtos_cols = {c["name"] for c in insp.get_columns("produtos")}
    vinculo_cols = {c["name"] for c in insp.get_columns("produto_fornecedor")}
    fornecedor_cols = {c["name"] for c in insp.get_columns("fornecedores")}
    with engine.begin() as con:
        if "email" in pessoas and "usuario" not in pessoas:
            con.execute(text("ALTER TABLE pessoas RENAME COLUMN email TO usuario"))
        if "estorno_de_id" not in movs:
            con.execute(text("ALTER TABLE movimentacoes ADD COLUMN estorno_de_id INTEGER REFERENCES movimentacoes(id)"))
        if "localizacao" not in fornecedor_cols:
            con.execute(text("ALTER TABLE fornecedores ADD COLUMN localizacao VARCHAR(120)"))
        # Colunas do cadastro de fornecedores da Optikon (os já cadastrados contam como "já utilizado")
        for col, tipo in [("produto_fornecido", "VARCHAR(255)"), ("prazo_producao", "VARCHAR(60)"),
                          ("situacao", "VARCHAR(20) NOT NULL DEFAULT 'utilizado'"),
                          ("responsavel_id", "INTEGER REFERENCES pessoas(id) ON DELETE SET NULL"),
                          ("atualizado_em", "DATETIME")]:
            if col not in fornecedor_cols:
                con.execute(text(f"ALTER TABLE fornecedores ADD COLUMN {col} {tipo}"))
                if col == "atualizado_em":
                    con.execute(text("UPDATE fornecedores SET atualizado_em = criado_em"))
        for col, tipo in [("preco_atualizado_em", "DATETIME"), ("frete_gratis", "BOOLEAN"),
                          ("situacao_anuncio", "VARCHAR(24)"), ("erro_coleta", "VARCHAR(255)")]:
            if col not in vinculo_cols:
                con.execute(text(f"ALTER TABLE produto_fornecedor ADD COLUMN {col} {tipo}"))
        if "foto" not in produtos_cols:
            con.execute(text("ALTER TABLE produtos ADD COLUMN foto VARCHAR(80)"))
        if "montagem_id" not in movs:
            con.execute(text("ALTER TABLE movimentacoes ADD COLUMN montagem_id INTEGER REFERENCES montagens(id)"))
        if "estornada" not in movs:
            con.execute(text("ALTER TABLE movimentacoes ADD COLUMN estornada BOOLEAN NOT NULL DEFAULT 0"))
        # Projetos (pastas do OneDrive) no lugar do "local" das unidades
        for tabela in ("unidades", "eventos_unidade"):
            if "projeto_id" not in {c["name"] for c in insp.get_columns(tabela)}:
                con.execute(text(f"ALTER TABLE {tabela} ADD COLUMN projeto_id INTEGER REFERENCES projetos(id)"))
        onedrive_cols = {c["name"] for c in insp.get_columns("integracao_onedrive")}
        for col, tipo in [("projetos_drive_id", "VARCHAR(200)"), ("projetos_pasta_id", "VARCHAR(200)"),
                          ("projetos_pasta_nome", "VARCHAR(255)"), ("projetos_pasta_url", "VARCHAR(1000)"),
                          ("projetos_lidos_em", "DATETIME"), ("projetos_erro", "VARCHAR(500)")]:
            if col not in onedrive_cols:
                con.execute(text(f"ALTER TABLE integracao_onedrive ADD COLUMN {col} {tipo}"))


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
app.include_router(integracoes.router)
app.include_router(rotas_onedrive.router)
app.include_router(projetos.router)


@app.on_event("startup")
def _agendar_coleta():
    # Atualização diária dos preços do Mercado Livre (só age se a conta estiver conectada)
    mercadolivre.iniciar_agendador(SessionLocal)
    # Espelho do estoque na planilha do OneDrive (só age com a conta conectada e a pasta escolhida)
    onedrive.iniciar_agendador(SessionLocal)


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
