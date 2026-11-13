import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, Minus, PackagePlus, Pencil, Plus, Scale, Search } from "lucide-react";
import { createContext, useContext, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, type Movimentacao, type Produto, type ProdutoForm, type TipoMov } from "../lib/api";
import { MiniaturaProduto } from "../lib/categorias";
import { fmtNum } from "../lib/format";
import { useAuth } from "./auth";
import { Botao, Campo, cn, Input, InputSugestoes, Modal, Select, Textarea } from "./ui";

/* ---------- Contexto: qualquer tela pode abrir os modais ---------- */
interface Acoes {
  movimentar: (opts?: { produto?: Produto; tipo?: TipoMov }) => void;
  editarProduto: (produto?: Produto) => void;
}

const Ctx = createContext<Acoes | null>(null);

export function useAcoes() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAcoes fora do AcoesProvider");
  return ctx;
}

export function useInvalidar() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

export function AcoesProvider({ children }: { children: ReactNode }) {
  const [mov, setMov] = useState<{ produto?: Produto; tipo: TipoMov; chave: number } | null>(null);
  const [prod, setProd] = useState<{ produto?: Produto; chave: number } | null>(null);

  const acoes = useMemo<Acoes>(
    () => ({
      movimentar: (o) => setMov({ produto: o?.produto, tipo: o?.tipo ?? "retirada", chave: Date.now() }),
      editarProduto: (produto) => setProd({ produto, chave: Date.now() }),
    }),
    [],
  );

  return (
    <Ctx.Provider value={acoes}>
      {children}
      {mov && <MovimentacaoModal key={mov.chave} {...mov} aoFechar={() => setMov(null)} />}
      {prod && <ProdutoModal key={prod.chave} produto={prod.produto} aoFechar={() => setProd(null)} />}
    </Ctx.Provider>
  );
}

/* ---------- Retirada / Entrada / Ajuste ---------- */
const TIPOS: Record<TipoMov, { rotulo: string; verbo: string; icone: ReactNode; ativo: string }> = {
  retirada: {
    rotulo: "Retirar",
    verbo: "Confirmar retirada",
    icone: <ArrowUpFromLine />,
    ativo: "bg-primary-soft text-primary border-primary/40",
  },
  entrada: {
    rotulo: "Entrada",
    verbo: "Registrar entrada",
    icone: <ArrowDownToLine />,
    ativo: "bg-ok-soft text-ok border-ok/40",
  },
  ajuste: {
    rotulo: "Corrigir",
    verbo: "Salvar contagem",
    icone: <Scale />,
    ativo: "bg-surface-2 text-fg border-line-strong",
  },
};

/** Desfaz pelo botão do aviso. Fica fora do modal porque o modal já fechou quando o clique acontece. */
function oferecerDesfazer(m: Movimentacao, invalidar: () => void) {
  const titulo = m.tipo === "retirada" ? "Retirada registrada" : "Entrada registrada";
  toast.success(titulo, {
    description: `${m.produto_nome} · saldo ${fmtNum(m.saldo_apos)} ${m.produto_unidade}`,
    duration: 10_000,
    action: {
      label: "Desfazer",
      onClick: () =>
        api
          .desfazer(m.id)
          .then((e) => {
            toast.success("Desfeito", { description: `${e.produto_nome} voltou para ${fmtNum(e.saldo_apos)} ${e.produto_unidade}` });
            invalidar();
          })
          .catch((err: Error) => toast.error(err.message)),
    },
  });
}

function normalizar(s: string | null) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Busca de produto com teclado (setas + Enter), mostrando saldo e situação. */
export function BuscaProduto({ aoEscolher }: { aoEscolher: (p: Produto) => void }) {
  const produtos = useQuery({ queryKey: ["produtos", {}], queryFn: () => api.produtos() });
  const [termo, setTermo] = useState("");
  const [sel, setSel] = useState(0);
  const t = normalizar(termo.trim());
  const lista = (produtos.data ?? []).filter(
    (p) => !t || normalizar(p.nome).includes(t) || normalizar(p.categoria).includes(t) || normalizar(p.localizacao).includes(t),
  );

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="busca-produto" className="text-[13px] font-medium text-muted">
        Produto<span className="ml-0.5 text-primary">*</span>
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
        <Input
          id="busca-produto"
          value={termo}
          onChange={(e) => {
            setTermo(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((i) => Math.min(i + 1, lista.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (lista[sel]) aoEscolher(lista[sel]);
            }
          }}
          placeholder="Digite para buscar… ex.: bateria"
          className="pl-9"
          role="combobox"
          aria-expanded
          aria-controls="lista-busca-produto"
          autoComplete="off"
        />
      </div>
      <ul id="lista-busca-produto" role="listbox" className="max-h-60 overflow-y-auto rounded-xl border border-line bg-bg/40 p-1">
        {produtos.isLoading && <li className="px-3 py-6 text-center text-sm text-muted">Carregando…</li>}
        {produtos.data && lista.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Nenhum produto encontrado.</li>}
        {lista.map((x, i) => (
          <li
            key={x.id}
            role="option"
            aria-selected={i === sel}
            onMouseEnter={() => setSel(i)}
            onClick={() => aoEscolher(x)}
            className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2", i === sel && "bg-surface-2")}
          >
            <MiniaturaProduto produto={x} tamanho="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{x.nome}</p>
              <p className="truncate text-xs text-subtle">{x.localizacao ?? x.categoria ?? "—"}</p>
            </div>
            <span className={cn("tabular text-sm", x.status === "esgotado" ? "text-danger" : x.status === "baixo" ? "text-warn" : "text-muted")}>
              {fmtNum(x.quantidade)} <span className="text-xs text-subtle">{x.unidade}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MovimentacaoModal({
  produto: inicial,
  tipo: tipoInicial,
  aoFechar,
}: {
  produto?: Produto;
  tipo: TipoMov;
  aoFechar: () => void;
}) {
  const invalidar = useInvalidar();
  const { usuario, admin } = useAuth();
  const [tipo, setTipo] = useState<TipoMov>(tipoInicial === "ajuste" && !admin ? "retirada" : tipoInicial);
  const [produtoId, setProdutoId] = useState<number | null>(inicial?.id ?? null);
  const [pessoaId, setPessoaId] = useState<number | null>(usuario.id);
  const [qtd, setQtd] = useState<string>(tipoInicial === "ajuste" && inicial ? String(inicial.quantidade) : "1");
  const [motivo, setMotivo] = useState("");

  const qtdRef = useRef<HTMLInputElement>(null);
  const pessoas = useQuery({ queryKey: ["pessoas"], queryFn: () => api.pessoas() });
  const atual = useQuery({
    queryKey: ["produto", produtoId],
    queryFn: () => api.produto(produtoId!),
    enabled: produtoId !== null,
    placeholderData: inicial && inicial.id === produtoId ? { ...inicial, fornecedores: [] } : undefined,
  });

  const p = atual.data;
  const n = Number(qtd.replace(",", "."));
  const qtdValida = Number.isFinite(n) && (tipo === "ajuste" ? n >= 0 : n > 0);
  const novoSaldo = p ? (tipo === "entrada" ? p.quantidade + n : tipo === "retirada" ? p.quantidade - n : n) : null;
  const semSaldo = tipo === "retirada" && p != null && n > p.quantidade;
  const abaixoMin = p != null && novoSaldo != null && p.estoque_minimo > 0 && novoSaldo <= p.estoque_minimo && !semSaldo;

  const salvar = useMutation({
    mutationFn: () =>
      api.registrar({ produto_id: produtoId!, tipo, quantidade: n, pessoa_id: pessoaId, motivo: motivo || null }),
    onSuccess: (m) => {
      if (m.tipo === "ajuste") toast.success("Contagem corrigida", { description: `${m.produto_nome} · saldo ${fmtNum(m.saldo_apos)} ${m.produto_unidade}` });
      else oferecerDesfazer(m, invalidar);
      invalidar();
      aoFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const podeSalvar = produtoId !== null && qtdValida && !semSaldo && (tipo !== "retirada" || pessoaId !== null);

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (podeSalvar) salvar.mutate();
  }

  function passo(d: number) {
    const base = Number.isFinite(n) ? n : 0;
    setQtd(String(Math.max(0, base + d)));
  }

  function escolher(x: Produto) {
    setProdutoId(x.id);
    if (tipo === "ajuste") setQtd(String(x.quantidade));
    // Espera o campo de quantidade aparecer para focar nele
    requestAnimationFrame(() => qtdRef.current?.focus());
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Movimentar estoque"
      descricao="Registre quem pegou o quê. O saldo é atualizado na hora."
      icone={TIPOS[tipo].icone}
      rodape={
        <>
          <Botao variante="ghost" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primary" type="submit" form="form-mov" disabled={!podeSalvar} carregando={salvar.isPending}>
            {TIPOS[tipo].verbo}
          </Botao>
        </>
      }
    >
      <form id="form-mov" onSubmit={enviar} className="flex flex-col gap-4">
        <div
          role="radiogroup"
          aria-label="Tipo de movimentação"
          className={cn("grid gap-1.5 rounded-xl border border-line bg-bg/50 p-1", admin ? "grid-cols-3" : "grid-cols-2")}
        >
          {(Object.keys(TIPOS) as TipoMov[]).filter((t) => admin || t !== "ajuste").map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tipo === t}
              onClick={() => {
                setTipo(t);
                if (t === "ajuste" && p) setQtd(String(p.quantidade));
                else if (tipo === "ajuste") setQtd("1");
              }}
              className={cn(
                "flex h-9 items-center justify-center gap-2 rounded-lg border border-transparent text-sm font-medium text-muted transition-colors hover:text-fg [&_svg]:size-4",
                tipo === t && TIPOS[t].ativo,
              )}
            >
              {TIPOS[t].icone}
              {TIPOS[t].rotulo}
            </button>
          ))}
        </div>

        {produtoId === null && <BuscaProduto aoEscolher={escolher} />}

        {p && produtoId !== null && (
          <div className="flex items-center gap-3 rounded-xl border border-line bg-bg/40 px-4 py-3">
            <MiniaturaProduto produto={p} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.nome}</p>
              <p className="truncate text-xs text-muted">
                {p.localizacao ?? "Sem localização definida"}
                {!inicial && (
                  <>
                    {" · "}
                    <button type="button" onClick={() => setProdutoId(null)} className="text-primary hover:underline">
                      trocar
                    </button>
                  </>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] tracking-wide text-subtle uppercase">Saldo</p>
              <p className="tabular text-sm">
                <span className="text-muted">{fmtNum(p.quantidade)}</span>
                {qtdValida && novoSaldo !== null && novoSaldo !== p.quantidade && (
                  <>
                    <span className="mx-1.5 text-subtle">→</span>
                    <span className={cn("font-semibold", semSaldo ? "text-danger" : abaixoMin ? "text-warn" : "text-fg")}>
                      {fmtNum(novoSaldo)}
                    </span>
                  </>
                )}
                <span className="ml-1 text-subtle">{p.unidade}</span>
              </p>
            </div>
          </div>
        )}

        <div className={cn("grid gap-4 sm:grid-cols-2", produtoId === null && "hidden")}>
          <Campo
            rotulo={tipo === "ajuste" ? "Saldo contado" : "Quantidade"}
            obrigatorio
            erro={semSaldo ? `Só há ${fmtNum(p!.quantidade)} ${p!.unidade} em estoque` : undefined}
            dica={tipo === "ajuste" ? "Quanto existe fisicamente agora" : abaixoMin ? "Vai ficar no estoque mínimo ou abaixo" : undefined}
          >
            {(id) => (
              <div className="flex">
                <Botao type="button" tamanho="icon" className="h-9 w-9 rounded-r-none" onClick={() => passo(-1)} aria-label="Diminuir">
                  <Minus />
                </Botao>
                <Input
                  ref={qtdRef}
                  id={id}
                  inputMode="decimal"
                  value={qtd}
                  onChange={(e) => setQtd(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="tabular rounded-none border-x-0 text-center"
                />
                <Botao type="button" tamanho="icon" className="h-9 w-9 rounded-l-none" onClick={() => passo(1)} aria-label="Aumentar">
                  <Plus />
                </Botao>
              </div>
            )}
          </Campo>

          <Campo
            rotulo={tipo === "retirada" ? "Quem está retirando" : "Responsável"}
            obrigatorio={tipo === "retirada"}
            dica={
              pessoas.data?.length === 0 ? (
                <>
                  Nenhuma pessoa cadastrada.{" "}
                  <Link to="/pessoas" onClick={aoFechar} className="text-primary hover:underline">
                    Cadastrar
                  </Link>
                </>
              ) : undefined
            }
          >
            {(id) => (
              <Select id={id} value={pessoaId ?? ""} onChange={(e) => setPessoaId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">{tipo === "retirada" ? "Selecione…" : "Não informado"}</option>
                {pessoas.data?.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nome}
                    {x.setor ? ` · ${x.setor}` : ""}
                  </option>
                ))}
              </Select>
            )}
          </Campo>
        </div>

        <Campo rotulo={tipo === "retirada" ? "Para que vai usar" : "Observação"}>
          {(id) => (
            <Input
              id={id}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={255}
              placeholder={
                tipo === "retirada" ? "Ex.: Carrinho Olie #3" : tipo === "entrada" ? "Ex.: Compra KaBuM, NF 1234" : "Ex.: Inventário mensal"
              }
            />
          )}
        </Campo>
      </form>
    </Modal>
  );
}

/* ---------- Cadastro / edição de produto ---------- */
const UNIDADES = [
  ["un", "Unidade (un)"],
  ["par", "Par"],
  ["cx", "Caixa (cx)"],
  ["pct", "Pacote (pct)"],
  ["m", "Metro (m)"],
  ["rolo", "Rolo"],
  ["kg", "Quilo (kg)"],
  ["g", "Grama (g)"],
  ["L", "Litro (L)"],
  ["ml", "Mililitro (ml)"],
];

function ProdutoModal({ produto, aoFechar }: { produto?: Produto; aoFechar: () => void }) {
  const invalidar = useInvalidar();
  const { usuario } = useAuth();
  const editando = !!produto;
  const [f, setF] = useState<ProdutoForm>({
    nome: produto?.nome ?? "",
    categoria: produto?.categoria ?? "",
    descricao: produto?.descricao ?? "",
    unidade: produto?.unidade ?? "un",
    estoque_minimo: produto?.estoque_minimo ?? 0,
    localizacao: produto?.localizacao ?? "",
    monitorar_preco: produto?.monitorar_preco ?? false,
    quantidade_inicial: 0,
    pessoa_id: usuario.id,
  });
  const set = <K extends keyof ProdutoForm>(k: K, v: ProdutoForm[K]) => setF((s) => ({ ...s, [k]: v }));

  const categorias = useQuery({ queryKey: ["categorias"], queryFn: api.categorias });
  const locais = useQuery({ queryKey: ["locais"], queryFn: api.locais });
  const pessoas = useQuery({ queryKey: ["pessoas"], queryFn: () => api.pessoas(), enabled: !editando });

  const salvar = useMutation({
    mutationFn: () => {
      const { quantidade_inicial, pessoa_id, ...base } = f;
      return editando
        ? api.atualizarProduto(produto.id, base)
        : api.criarProduto({ ...base, quantidade_inicial, pessoa_id: quantidade_inicial ? pessoa_id : null });
    },
    onSuccess: (p) => {
      toast.success(editando ? "Produto atualizado" : "Produto cadastrado", { description: p.nome });
      invalidar();
      aoFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const numero = (v: string) => {
    const x = Number(v.replace(",", "."));
    return Number.isFinite(x) && x >= 0 ? x : 0;
  };

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      largura="lg"
      titulo={editando ? "Editar produto" : "Novo produto"}
      descricao={editando ? produto.nome : "Cadastre um item que existe no escritório."}
      icone={editando ? <Pencil /> : <PackagePlus />}
      rodape={
        <>
          <Botao variante="ghost" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primary" type="submit" form="form-produto" disabled={!f.nome.trim()} carregando={salvar.isPending}>
            {editando ? "Salvar alterações" : "Cadastrar produto"}
          </Botao>
        </>
      }
    >
      <form
        id="form-produto"
        onSubmit={(e) => {
          e.preventDefault();
          if (f.nome.trim()) salvar.mutate();
        }}
        className="grid gap-4 sm:grid-cols-6"
      >
        <Campo rotulo="Nome" obrigatorio className="sm:col-span-4">
          {(id) => (
            <Input id={id} value={f.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: Bateria Li-ion 18650" maxLength={160} autoFocus />
          )}
        </Campo>
        <Campo rotulo="Categoria" className="sm:col-span-2">
          {(id) => (
            <InputSugestoes
              id={id}
              sugestoes={categorias.data ?? []}
              value={f.categoria ?? ""}
              onChange={(e) => set("categoria", e.target.value)}
              placeholder="Ex.: Energia"
              maxLength={80}
            />
          )}
        </Campo>

        <Campo rotulo="Unidade" className="sm:col-span-2">
          {(id) => (
            <Select id={id} value={f.unidade} onChange={(e) => set("unidade", e.target.value)}>
              {UNIDADES.map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </Select>
          )}
        </Campo>
        <Campo rotulo="Estoque mínimo" dica="Avisamos quando chegar nele" className="sm:col-span-2">
          {(id) => (
            <Input id={id} inputMode="decimal" className="tabular" value={f.estoque_minimo} onChange={(e) => set("estoque_minimo", numero(e.target.value))} onFocus={(e) => e.target.select()} />
          )}
        </Campo>
        {!editando ? (
          <Campo rotulo="Quantidade atual" dica="Vira a primeira entrada" className="sm:col-span-2">
            {(id) => (
              <Input id={id} inputMode="decimal" className="tabular" value={f.quantidade_inicial} onChange={(e) => set("quantidade_inicial", numero(e.target.value))} onFocus={(e) => e.target.select()} />
            )}
          </Campo>
        ) : (
          <div className="flex flex-col justify-center rounded-lg border border-dashed border-line px-3 py-2 text-xs text-muted sm:col-span-2">
            Para mudar o saldo use <strong className="font-medium text-fg">Entrada</strong> ou <strong className="font-medium text-fg">Ajustar</strong>.
          </div>
        )}

        <Campo rotulo="Localização" className="sm:col-span-3">
          {(id) => (
            <InputSugestoes
              id={id}
              sugestoes={locais.data ?? []}
              value={f.localizacao ?? ""}
              onChange={(e) => set("localizacao", e.target.value)}
              placeholder="Ex.: Armário A"
              maxLength={120}
            />
          )}
        </Campo>
        {!editando && (
          <Campo rotulo="Quem está cadastrando" className="sm:col-span-3">
            {(id) => (
              <Select id={id} value={f.pessoa_id ?? ""} onChange={(e) => set("pessoa_id", e.target.value ? Number(e.target.value) : null)}>
                <option value="">Não informado</option>
                {pessoas.data?.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nome}
                  </option>
                ))}
              </Select>
            )}
          </Campo>
        )}

        <Campo rotulo="Descrição / o que dá para fazer com ele" className="sm:col-span-6">
          {(id) => (
            <Textarea id={id} value={f.descricao ?? ""} onChange={(e) => set("descricao", e.target.value)} placeholder="Ex.: Alimenta o carrinho Olie (2 por carrinho)" />
          )}
        </Campo>

      </form>
    </Modal>
  );
}
