"""Popula o banco com dados de exemplo. Uso: python -m app.seed"""

from datetime import timedelta
from random import Random

from sqlalchemy import select

from . import models
from .db import Base, SessionLocal, engine
from .models import agora


PESSOAS = [("Ana Souza", "Engenharia"), ("Bruno Lima", "Protótipos"), ("Diego Rocha", "Engenharia"), ("Carla Mendes", "Compras")]

FORNECEDORES = [
    ("Mercado Livre", "https://www.mercadolivre.com.br"),
    ("KaBuM!", "https://www.kabum.com.br"),
    ("Shopee", "https://shopee.com.br"),
    ("Baú da Eletrônica", "https://www.baudaeletronica.com.br"),
]

# nome, categoria, unidade, qtd, mínimo, local, [(fornecedor, preço, preferido)]
PRODUTOS = [
    ("Bateria Li-ion 18650 3000mAh", "Energia", "un", 14, 8, "Armário A · Gaveta 1",
     [("KaBuM!", 24.90, True), ("Mercado Livre", 21.50, False)]),
    ("Roda 65mm com eixo", "Mecânica", "un", 6, 8, "Armário B · Caixa 3",
     [("Shopee", 9.90, True)]),
    ("Motor DC 12V com redução", "Mecânica", "un", 3, 4, "Armário B · Caixa 1",
     [("Baú da Eletrônica", 48.00, True), ("Mercado Livre", 52.90, False)]),
    ("ESP32 DevKit V1", "Eletrônica", "un", 11, 5, "Armário A · Gaveta 3",
     [("Mercado Livre", 39.90, True), ("Shopee", 34.00, False)]),
    ("Driver de motor L298N", "Eletrônica", "un", 0, 3, "Armário A · Gaveta 3",
     [("Baú da Eletrônica", 19.90, True)]),
    ("Cabo flexível 0,5mm vermelho", "Cabos", "m", 42.5, 20, "Prateleira 2",
     [("Mercado Livre", 1.20, True)]),
    ("Câmera USB 1080p", "Visão", "un", 4, 2, "Armário C",
     [("KaBuM!", 129.90, True)]),
    ("Suporte de bateria 2x18650", "Energia", "un", 2, 6, "Armário A · Gaveta 1",
     [("Shopee", 6.50, True)]),
    ("Parafuso M3 x 10mm", "Fixação", "un", 380, 100, "Prateleira 1 · Organizador",
     [("Mercado Livre", 0.15, True)]),
    ("Regulador de tensão LM2596", "Eletrônica", "un", 9, 4, "Armário A · Gaveta 2",
     [("Baú da Eletrônica", 12.90, True), ("Shopee", 8.90, False)]),
]


def main():
    Base.metadata.create_all(engine)
    db = SessionLocal()
    if db.scalar(select(models.Produto.id).limit(1)):
        print("O banco já tem produtos; nada foi alterado.")
        return

    rnd = Random(42)
    pessoas = [models.Pessoa(nome=n, setor=s) for n, s in PESSOAS]
    fornecedores = {n: models.Fornecedor(nome=n, site=s) for n, s in FORNECEDORES}
    db.add_all(pessoas + list(fornecedores.values()))
    db.flush()

    inicio = agora() - timedelta(days=20)
    for nome, cat, un, qtd, minimo, local, forn in PRODUTOS:
        retiradas = [rnd.choice([1, 1, 2, 2, 3]) for _ in range(rnd.randint(0, 5))] if un == "un" else []
        compra = qtd + sum(retiradas)
        p = models.Produto(nome=nome, categoria=cat, unidade=un, quantidade=qtd, estoque_minimo=minimo,
                           localizacao=local, monitorar_preco=True, criado_em=inicio)
        p.fornecedores = [models.ProdutoFornecedor(fornecedor=fornecedores[f], preco=pr, preferido=pref)
                          for f, pr, pref in forn]
        db.add(p)
        db.flush()

        saldo = compra
        db.add(models.Movimentacao(produto_id=p.id, pessoa_id=pessoas[3].id, tipo="entrada", quantidade=compra,
                                   saldo_apos=saldo, motivo="Cadastro inicial", criado_em=inicio))
        momentos = sorted(agora() - timedelta(days=rnd.randint(0, 13), hours=rnd.randint(0, 8)) for _ in retiradas)
        for q, quando in zip(retiradas, momentos):
            saldo -= q
            motivo = rnd.choice(["Carrinho Olie", "Protótipo de visão", "Manutenção", "Teste de bancada"])
            db.add(models.Movimentacao(produto_id=p.id, pessoa_id=rnd.choice(pessoas[:3]).id, tipo="retirada",
                                       quantidade=-q, saldo_apos=saldo, motivo=motivo, criado_em=quando))
    db.commit()
    print(f"{len(PRODUTOS)} produtos, {len(PESSOAS)} pessoas e {len(FORNECEDORES)} fornecedores criados.")


if __name__ == "__main__":
    main()
