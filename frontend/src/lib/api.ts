export type StatusEstoque = "ok" | "baixo" | "esgotado";
export type TipoMov = "entrada" | "retirada" | "ajuste";

export interface Produto {
  id: number;
  nome: string;
  categoria: string | null;
  descricao: string | null;
  unidade: string;
  quantidade: number;
  estoque_minimo: number;
  localizacao: string | null;
  monitorar_preco: boolean;
  arquivado: boolean;
  status: StatusEstoque;
  criado_em: string;
  atualizado_em: string;
  fornecedor_preferido: string | null;
  menor_preco: number | null;
  foto_url: string | null;
  link_compra: string | null;
  loja_compra: string | null;
}

export interface Vinculo {
  id: number;
  fornecedor_id: number;
  fornecedor_nome: string;
  url: string | null;
  preco: number | null;
  preferido: boolean;
}

export interface ProdutoDetalhe extends Produto {
  fornecedores: Vinculo[];
}

export interface ProdutoForm {
  nome: string;
  categoria: string | null;
  descricao: string | null;
  unidade: string;
  estoque_minimo: number;
  localizacao: string | null;
  monitorar_preco: boolean;
  quantidade_inicial?: number;
  pessoa_id?: number | null;
}

export interface Fornecedor {
  id: number;
  nome: string;
  site: string | null;
  contato: string | null;
  observacoes: string | null;
  criado_em: string;
  total_produtos: number;
}

export type FornecedorForm = Pick<Fornecedor, "nome" | "site" | "contato" | "observacoes">;

export type Papel = "admin" | "membro";

export interface Pessoa {
  id: number;
  nome: string;
  setor: string | null;
  ativo: boolean;
  usuario: string | null;
  papel: Papel | null;
  tem_acesso: boolean;
}

export type PessoaForm = Pick<Pessoa, "nome" | "setor" | "ativo">;

export interface Usuario {
  id: number;
  nome: string;
  usuario: string;
  papel: Papel;
  setor: string | null;
}

export interface Movimentacao {
  id: number;
  produto_id: number;
  produto_nome: string;
  produto_unidade: string;
  pessoa_id: number | null;
  pessoa_nome: string | null;
  registrado_por_nome: string | null;
  tipo: TipoMov;
  quantidade: number;
  saldo_apos: number;
  motivo: string | null;
  criado_em: string;
  estorno_de_id: number | null;
  estornada: boolean;
  registrado_por_id: number | null;
}

export interface MovimentacaoForm {
  produto_id: number;
  tipo: TipoMov;
  quantidade: number;
  pessoa_id: number | null;
  motivo: string | null;
}

export interface Dashboard {
  total_produtos: number;
  total_categorias: number;
  itens_com_preco: number;
  abaixo_minimo: number;
  esgotados: number;
  retiradas_7d: number;
  valor_estimado: number;
  alertas: Produto[];
  serie_14d: { dia: string; entradas: number; retiradas: number }[];
  mais_retirados: { produto_id: number; nome: string; categoria: string | null; retiradas: number; quantidade: number; unidade: string }[];
  ultimas: Movimentacao[];
}

export interface OpcaoCompra {
  fornecedor_id: number;
  fornecedor_nome: string;
  preco: number | null;
  url: string | null;
  preferido: boolean;
}

export interface ItemCompra {
  produto: Produto;
  sugestao: number;
  meta: number;
  opcoes: OpcaoCompra[];
  fornecedor_sugerido_id: number | null;
}

export type StatusUnidade = "em_producao" | "pronto" | "em_campo" | "manutencao" | "desativado";

export interface ComponenteProprio {
  produto_id: number;
  produto_nome: string;
  produto_categoria: string | null;
  produto_unidade: string;
  produto_foto_url: string | null;
  produto_arquivado: boolean;
  quantidade: number;
  em_estoque: number;
  da_para: number;
  falta_para_mais_um: number;
}

export interface Proprio {
  id: number;
  nome: string;
  prefixo: string;
  tipo: string | null;
  descricao: string | null;
  arquivado: boolean;
  capacidade: number | null;
  gargalo: string | null;
  por_status: Record<StatusUnidade, number>;
  total_unidades: number;
  criado_em: string;
}

export interface ProprioDetalhe extends Proprio {
  componentes: ComponenteProprio[];
}

export interface ProprioForm {
  nome: string;
  prefixo: string;
  tipo: string | null;
  descricao: string | null;
  componentes: { produto_id: number; quantidade: number }[];
}

export interface Unidade {
  id: number;
  proprio_id: number;
  proprio_nome: string;
  numero_serie: string;
  status: StatusUnidade;
  local: string | null;
  observacao: string | null;
  montagem_id: number | null;
  criado_em: string;
  atualizado_em: string;
}

export interface EventoUnidade {
  id: number;
  status: StatusUnidade;
  local: string | null;
  observacao: string | null;
  registrado_por_nome: string | null;
  criado_em: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

let aoNaoAutenticado: (() => void) | undefined;
/** Chamado quando a sessão expira no meio do uso, para voltar à tela de login. */
export const definirAoNaoAutenticado = (fn: () => void) => {
  aoNaoAutenticado = fn;
};

async function http<T>(method: string, path: string, body?: unknown): Promise<T> {
  const binario = body instanceof Blob;
  const resp = await fetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": binario ? body.type : "application/json" } : undefined,
    body: body === undefined ? undefined : binario ? body : JSON.stringify(body),
  });
  if (!resp.ok) {
    let msg = `Erro ${resp.status}`;
    try {
      const data = await resp.json();
      if (typeof data.detail === "string") msg = data.detail;
      else if (Array.isArray(data.detail)) msg = data.detail.map((d: { msg: string }) => d.msg).join("; ");
    } catch {
      /* resposta sem JSON */
    }
    if (resp.status === 401 && !path.startsWith("/api/auth/")) aoNaoAutenticado?.();
    throw new ApiError(msg, resp.status);
  }
  return resp.status === 204 ? (undefined as T) : resp.json();
}

function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const api = {
  estadoAuth: () => http<{ configurado: boolean }>("GET", "/api/auth/estado"),
  eu: () => http<Usuario>("GET", "/api/auth/eu"),
  login: (usuario: string, senha: string) => http<Usuario>("POST", "/api/auth/login", { usuario, senha }),
  configurar: (d: { nome: string; usuario: string; senha: string }) => http<Usuario>("POST", "/api/auth/configurar", d),
  logout: () => http<void>("POST", "/api/auth/logout"),
  trocarSenha: (atual: string, nova: string) => http<void>("POST", "/api/auth/senha", { atual, nova }),

  dashboard: () => http<Dashboard>("GET", "/api/dashboard"),

  produtos: (f: { busca?: string; categoria?: string; local?: string; status?: string; arquivados?: boolean } = {}) =>
    http<Produto[]>("GET", `/api/produtos${qs(f)}`),
  categorias: () => http<string[]>("GET", "/api/produtos/categorias"),
  locais: () => http<string[]>("GET", "/api/produtos/locais"),
  produto: (id: number) => http<ProdutoDetalhe>("GET", `/api/produtos/${id}`),
  criarProduto: (d: ProdutoForm) => http<ProdutoDetalhe>("POST", "/api/produtos", d),
  atualizarProduto: (id: number, d: ProdutoForm) => http<ProdutoDetalhe>("PUT", `/api/produtos/${id}`, d),
  arquivarProduto: (id: number) => http<void>("DELETE", `/api/produtos/${id}`),
  excluirProduto: (id: number) => http<void>("DELETE", `/api/produtos/${id}?definitivo=true`),
  restaurarProduto: (id: number) => http<ProdutoDetalhe>("POST", `/api/produtos/${id}/restaurar`),
  enviarFoto: (id: number, imagem: Blob) => http<ProdutoDetalhe>("PUT", `/api/produtos/${id}/foto`, imagem),
  removerFoto: (id: number) => http<ProdutoDetalhe>("DELETE", `/api/produtos/${id}/foto`),

  vincular: (id: number, d: Omit<Vinculo, "id" | "fornecedor_nome">) =>
    http<ProdutoDetalhe>("POST", `/api/produtos/${id}/fornecedores`, d),
  atualizarVinculo: (id: number, vid: number, d: Omit<Vinculo, "id" | "fornecedor_nome">) =>
    http<ProdutoDetalhe>("PUT", `/api/produtos/${id}/fornecedores/${vid}`, d),
  desvincular: (id: number, vid: number) => http<ProdutoDetalhe>("DELETE", `/api/produtos/${id}/fornecedores/${vid}`),

  fornecedores: () => http<Fornecedor[]>("GET", "/api/fornecedores"),
  criarFornecedor: (d: FornecedorForm) => http<Fornecedor>("POST", "/api/fornecedores", d),
  atualizarFornecedor: (id: number, d: FornecedorForm) => http<Fornecedor>("PUT", `/api/fornecedores/${id}`, d),
  removerFornecedor: (id: number) => http<void>("DELETE", `/api/fornecedores/${id}`),

  pessoas: (incluirInativos = false) =>
    http<Pessoa[]>("GET", `/api/pessoas${qs({ incluir_inativos: incluirInativos || undefined })}`),
  criarPessoa: (d: PessoaForm) => http<Pessoa>("POST", "/api/pessoas", d),
  atualizarPessoa: (id: number, d: PessoaForm) => http<Pessoa>("PUT", `/api/pessoas/${id}`, d),
  definirAcesso: (id: number, d: { usuario: string; papel: Papel; senha?: string | null }) =>
    http<Pessoa>("PUT", `/api/pessoas/${id}/acesso`, d),
  removerAcesso: (id: number) => http<Pessoa>("DELETE", `/api/pessoas/${id}/acesso`),

  movimentacoes: (f: { produto_id?: number; pessoa_id?: number; tipo?: string; de?: string; ate?: string; limite?: number } = {}) =>
    http<Movimentacao[]>("GET", `/api/movimentacoes${qs(f)}`),
  registrar: (d: MovimentacaoForm) => http<Movimentacao>("POST", "/api/movimentacoes", d),
  desfazer: (id: number) => http<Movimentacao>("POST", `/api/movimentacoes/${id}/desfazer`),

  proprios: (arquivados = false) => http<Proprio[]>("GET", `/api/proprios${qs({ arquivados: arquivados || undefined })}`),
  proprio: (id: number) => http<ProprioDetalhe>("GET", `/api/proprios/${id}`),
  criarProprio: (d: ProprioForm) => http<ProprioDetalhe>("POST", "/api/proprios", d),
  atualizarProprio: (id: number, d: ProprioForm) => http<ProprioDetalhe>("PUT", `/api/proprios/${id}`, d),
  removerProprio: (id: number) => http<void>("DELETE", `/api/proprios/${id}`),
  restaurarProprio: (id: number) => http<ProprioDetalhe>("POST", `/api/proprios/${id}/restaurar`),
  montar: (id: number, d: { quantidade: number; pessoa_id: number | null; status_inicial: "em_producao" | "pronto"; observacao: string | null }) =>
    http<{ id: number; quantidade: number; unidades: Unidade[] }>("POST", `/api/proprios/${id}/montar`, d),
  cancelarMontagem: (id: number) => http<void>("POST", `/api/proprios/montagens/${id}/cancelar`),
  unidades: (f: { proprio_id?: number; status?: string; busca?: string } = {}) => http<Unidade[]>("GET", `/api/proprios/unidades${qs(f)}`),
  atualizarUnidade: (id: number, d: { status: StatusUnidade; local: string | null; observacao: string | null }) =>
    http<Unidade>("PATCH", `/api/proprios/unidades/${id}`, d),
  eventosUnidade: (id: number) => http<EventoUnidade[]>("GET", `/api/proprios/unidades/${id}/eventos`),

  compras: () => http<ItemCompra[]>("GET", "/api/compras"),
  /** POST que devolve arquivo: baixa sem sair da página */
  exportarCompras: async (itens: { produto_id: number; quantidade: number; fornecedor_id: number | null }[]) => {
    const resp = await fetch("/api/compras/exportar.xlsx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itens }),
    });
    if (!resp.ok) throw new ApiError(`Erro ${resp.status} ao gerar a planilha`, resp.status);
    const nome = /filename="([^"]+)"/.exec(resp.headers.get("content-disposition") ?? "")?.[1] ?? "lista-de-compras.xlsx";
    const url = URL.createObjectURL(await resp.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: nome });
    // O link precisa estar na página e a URL viva até o navegador começar o download
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },

  exportarUrl: (tipo: "estoque" | "movimentacoes", f: { de?: string; ate?: string } = {}) =>
    `/api/exportar/${tipo}.xlsx${qs(f)}`,
};
