"""Copia o banco SQLite local (data/estoque.db) para o Postgres da DATABASE_URL (ex.: Supabase).

Uso (de dentro de backend/, com DATABASE_URL no .env):
    python scripts/copiar_para_postgres.py [caminho/do/estoque.db]

No servidor (Docker):
    docker exec suprimentos_app python scripts/copiar_para_postgres.py

Só copia para um banco vazio: se o Postgres já tiver dados, para sem mexer em nada.
O SQLite não é alterado.
"""
import sys
from pathlib import Path

from sqlalchemy import create_engine, func, inspect, select, text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app import models  # noqa: E402,F401  (registra as tabelas)
from app.db import DATA_DIR, POSTGRES, Base, engine  # noqa: E402

LOTE = 500


def main():
    if not POSTGRES:
        sys.exit("DATABASE_URL não aponta para um Postgres: configure-a no backend/.env antes.")

    origem_arq = Path(sys.argv[1]) if len(sys.argv) > 1 else DATA_DIR / "estoque.db"
    if not origem_arq.is_file():
        sys.exit(f"Banco SQLite não encontrado: {origem_arq}")
    origem = create_engine(f"sqlite:///{origem_arq}")
    tabelas_origem = set(inspect(origem).get_table_names())

    Base.metadata.create_all(engine)
    with engine.connect() as con:
        cheias = [t.name for t in Base.metadata.sorted_tables if con.scalar(select(func.count()).select_from(t))]
    if cheias:
        sys.exit(f"O Postgres já tem dados ({', '.join(cheias)}). Nada foi copiado.")

    # Ordem das tabelas respeita as chaves estrangeiras (pais antes dos filhos)
    with origem.connect() as src, engine.begin() as dst:
        for tabela in Base.metadata.sorted_tables:
            if tabela.name not in tabelas_origem:
                print(f"  {tabela.name}: não existe no SQLite, pulando")
                continue
            colunas_origem = {c["name"] for c in inspect(origem).get_columns(tabela.name)}
            colunas = [c for c in tabela.columns if c.name in colunas_origem]
            ordem = [c for c in tabela.primary_key.columns]
            resultado = src.execute(select(*colunas).order_by(*ordem))
            total = 0
            while linhas := resultado.fetchmany(LOTE):
                dst.execute(tabela.insert(), [dict(linha._mapping) for linha in linhas])
                total += len(linhas)
            print(f"  {tabela.name}: {total}")

        # Os ids vieram prontos do SQLite: avança os contadores para o próximo cadastro não repetir id
        for tabela in Base.metadata.sorted_tables:
            if "id" in tabela.columns and tabela.c.id.autoincrement in (True, "auto") and len(tabela.primary_key.columns) == 1:
                dst.execute(
                    text(
                        f"SELECT setval(pg_get_serial_sequence('{tabela.name}', 'id'), "
                        f"COALESCE((SELECT MAX(id) FROM {tabela.name}), 1), "
                        f"(SELECT MAX(id) FROM {tabela.name}) IS NOT NULL)"
                    )
                )
    print("Pronto: dados copiados para o Postgres.")


if __name__ == "__main__":
    main()
