# Suprimentos

Controle de estoque do escritório: cadastro de produtos e fornecedores, registro de quem retirou o quê, e (nas próximas fases) projetos/montagens e uma IA que pesquisa preços diariamente.

- **Backend:** FastAPI + SQLAlchemy + SQLite (`backend/`)
- **Frontend:** React + Vite + TypeScript + Tailwind (`frontend/`)

## Rodando em desenvolvimento

Em um terminal, a API (porta 8010):

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8010
```

Em outro terminal, o site (porta 5180):

```bash
cd frontend
npm install
npm run dev
```

Abra http://localhost:5180. No **primeiro acesso** o site pede seu nome, um **nome de usuário** (ex.: `leonc`) e uma senha — essa vira a conta de administrador. Depois, em **Pessoas → Liberar acesso**, você cria o login das outras pessoas como Administrador ou Membro.

A documentação interativa da API fica em http://localhost:8010/docs.

### Dados de exemplo (opcional)

Para ver o site com produtos fictícios, rode **em um banco vazio**:

```bash
cd backend
.venv/bin/python -m app.seed
```

O banco fica em `backend/data/estoque.db` e as fotos em `backend/data/fotos/` — para fazer backup, basta copiar a pasta `backend/data`.
Para começar do zero, apague esse arquivo com a API parada.

## Rodando em produção (um único processo)

```bash
cd frontend && npm run build
cd ../backend && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8010
```

O backend passa a entregar o site compilado em `http://<ip-da-máquina>:8010`.
Se estiver atrás de HTTPS, defina `COOKIE_SEGURO=1`.

> **Etiquetas QR:** imprima as etiquetas acessando o site pelo **IP da máquina na rede** (ex.: `http://192.168.0.10:8010`), não por `localhost` — o QR guarda o endereço usado na hora da impressão.

### Variáveis de ambiente

| Variável | Padrão | Para quê |
|---|---|---|
| `SUPRIMENTOS_DATA_DIR` | `backend/data` | Pasta do banco SQLite |
| `DATABASE_URL` | SQLite na pasta acima | Trocar por PostgreSQL no futuro |
| `TZ_ESCRITORIO` | `America/Sao_Paulo` | Fuso usado no dashboard e nas exportações |
| `SESSAO_DIAS` | `14` | Duração do login |
| `COOKIE_SEGURO` | `0` | `1` quando servido via HTTPS |

## Permissões

| Papel | Pode |
|---|---|
| **Administrador** | Tudo: cadastrar/editar/arquivar/excluir produtos, fornecedores e pessoas, ajustar saldo, liberar e remover acessos |
| **Membro** | Ver o estoque, registrar retiradas e entradas, exportar para Excel |
| **Sem acesso** | Não entra no site, mas aparece na lista de quem pode retirar itens |

Toda movimentação guarda **quem retirou** e **quem anotou** no sistema.

## Roadmap

- [x] **Fase 1** — Produtos, fornecedores, pessoas, retiradas/entradas/correções, dashboard, exportação Excel, login por usuário com papéis
- [x] **Fase 1.5** — Busca de produto na retirada, “Desfazer”, cores/ícones por categoria, fotos dos produtos, etiquetas QR, gráfico de saldo, movimentações por dia, guia de primeiros passos
- [ ] **Fase 2** — Projetos/receitas (ex.: carrinho Olie), “quantos consigo montar”, retirada por montagem
- [ ] **Fase 3** — IA de preços: pesquisa diária (Mercado Livre, Shopee, KaBuM…), histórico e recomendação de compra
- [ ] **Fase 4** — Deploy, importação da planilha atual, alertas por e-mail/Slack
