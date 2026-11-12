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

### Variáveis de ambiente

| Variável | Padrão | Para quê |
|---|---|---|
| `SUPRIMENTOS_DATA_DIR` | `backend/data` | Pasta do banco SQLite |
| `DATABASE_URL` | SQLite na pasta acima | Trocar por PostgreSQL no futuro |
| `TZ_ESCRITORIO` | `America/Sao_Paulo` | Fuso usado no dashboard e nas exportações |
| `SESSAO_DIAS` | `14` | Duração do login |
| `COOKIE_SEGURO` | `0` | `1` quando servido via HTTPS |
| `ML_CLIENT_ID` | — | App ID da aplicação no Mercado Livre |
| `ML_CLIENT_SECRET` | — | Secret Key da aplicação no Mercado Livre |
| `ML_REDIRECT_URI` | — | Igual à “URI de redirect” cadastrada na aplicação (ex.: `https://seu-site/api/mercadolivre/callback`) |
| `ML_HORARIO` | `07:00` | Hora da atualização diária de preços |
| `MS_CLIENT_ID` | — | ID do aplicativo (cliente) cadastrado no Microsoft Entra, para a planilha no OneDrive |
| `MS_TENANT_ID` | — | ID do diretório (locatário) da empresa no Microsoft Entra |
| `ONEDRIVE_ARQUIVO` | `Estoque Trace.xlsx` | Nome da planilha criada na pasta escolhida |
| `ONEDRIVE_INTERVALO` | `120` | De quantos em quantos segundos o site confere se algo mudou para reenviar a planilha |

## Preços automáticos do Mercado Livre (grátis)

O site lê todo dia o preço dos **anúncios do Mercado Livre** cujos links estão cadastrados nos fornecedores dos produtos, usando a API oficial (sem custo).

1. Em [developers.mercadolivre.com.br](https://developers.mercadolivre.com.br), com a **conta principal** da empresa, crie uma aplicação e cadastre a URI de redirect.
2. Defina `ML_CLIENT_ID`, `ML_CLIENT_SECRET` e `ML_REDIRECT_URI` no servidor e reinicie a API.
3. No site, em **Integrações**, clique em **Conectar conta do Mercado Livre** e autorize. Se o Mercado Livre não voltar sozinho para o site, cole o endereço de retorno no campo indicado.
4. Em cada produto, no fornecedor, cole o link da **página do produto** no Mercado Livre (endereço com `/p/MLB…`). Se o link tiver o vendedor escolhido (`item_id:MLB…`), o site acompanha o preço dele; senão, a menor oferta.

A autorização vale 6 meses se a aplicação tiver **acesso offline** (refresh token); sem isso, ela expira em 6 horas e o site avisa em **Integrações**.

Limitações da API do Mercado Livre (verificadas em nov/2026): não há busca geral por palavra-chave, e anúncios avulsos de outros vendedores (`/items/{id}`) retornam 403 — por isso o preço vem das ofertas do produto de catálogo (`/products/{id}/items`).

## Planilha no OneDrive (grátis)

O site mantém uma planilha Excel numa pasta do OneDrive/SharePoint da empresa sempre igual ao estoque, com as abas **Produtos** e **Produtos próprios** (mais uma aba **Sobre** com a hora da última atualização). É **só do site para a planilha**: o que for editado na planilha é substituído no envio seguinte. A cada `ONEDRIVE_INTERVALO` segundos o site confere se algo mudou e só envia quando muda; se a planilha estiver travada (aberta no Excel de alguém) ou a Microsoft falhar, tenta de novo sozinho.

1. Em [portal.azure.com](https://portal.azure.com), com a conta da empresa: **Microsoft Entra ID → Registros de aplicativo → Novo registro**. Nome `Trace`, **Somente contas deste diretório organizacional**, sem URI de redirecionamento.
2. Em **Autenticação**, ative **Permitir fluxos de clientes públicos**. Em **Permissões de API**, adicione Microsoft Graph → permissões delegadas `Files.ReadWrite.All` e `offline_access`. Se a empresa bloquear o consentimento dos usuários, um administrador do Microsoft 365 precisa clicar em **Conceder consentimento do administrador**.
3. Defina `MS_CLIENT_ID` e `MS_TENANT_ID` (página **Visão geral** do aplicativo) no servidor e reinicie a API. Não há senha/segredo: o login é por código.
4. No site, em **Integrações**, clique em **Conectar conta Microsoft**, abra `microsoft.com/devicelogin`, digite o código mostrado e entre com a conta da empresa.
5. Cole o link da pasta (no OneDrive: botão direito na pasta → **Compartilhar** → **Copiar link**). Também serve o link de uma planilha `.xlsx` que já exista — aí o site passa a substituir esse arquivo.

### Projetos (pastas do OneDrive)

Na página **Projetos**, um administrador cola o link da pasta onde ficam as pastas dos projetos (`21.0 - GERENCIAMENTO`, `21.40 - TM ENGENHARIA`…). Cada subpasta que começa com número e traço vira um projeto, **com o nome exatamente igual ao da pasta**; as demais são ignoradas. O site relê a pasta sozinho a cada 10 minutos (ou pelo botão **Atualizar do OneDrive**): pasta nova aparece, pasta renomeada atualiza o nome e pasta removida sai da lista de escolha (as unidades que estavam nela continuam mostrando o projeto).

Nas unidades dos produtos próprios, o campo **Projeto** substitui a antiga localização em texto livre (21.0 = no escritório). **Em campo** exige um projeto quando já houver projetos lidos. A página Projetos mostra quais unidades estão em cada projeto.

## Permissões

| Papel | Pode |
|---|---|
| **Administrador** | Tudo: cadastrar/editar/arquivar/excluir produtos, produtos próprios, fornecedores e pessoas, corrigir contagem, cancelar montagens, liberar e remover acessos |
| **Membro** | Ver o estoque, registrar retiradas e entradas, montar produtos próprios, mudar a situação das unidades, exportar para Excel |
| **Sem acesso** | Não entra no site, mas aparece na lista de quem pode retirar itens |

Toda movimentação guarda **quem retirou** e **quem anotou** no sistema.

## Roadmap

- [x] **Fase 1** — Produtos, fornecedores, pessoas, retiradas/entradas/correções, dashboard, exportação Excel, login por usuário com papéis
- [x] **Fase 1.5** — Busca de produto na retirada, “Desfazer”, cores/ícones por categoria, fotos dos produtos, gráfico de saldo, movimentações por dia, guia de primeiros passos, lista de compras (Excel/texto) e botão “Comprar” com o link da loja
- [x] **Fase 2** — Produtos próprios (Olie, sensores…): composição, “quantos dá para montar”, montagem que retira as peças e gera nº de série, situação de cada unidade (produção, pronto, em campo, manutenção, desativado)
- [x] **Fase 3** — Preços automáticos do Mercado Livre pela API oficial: atualização diária, histórico, média/menor preço de 30 dias e aviso de “bom momento para comprar” (demais lojas seguem com preço manual)
- [ ] **Fase 4** — Deploy, importação da planilha atual, alertas por e-mail/Slack
