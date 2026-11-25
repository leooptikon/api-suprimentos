import { useMutation, useQuery } from "@tanstack/react-query";
import { Factory, History, Minus, Plus, Repeat, Search, Trash2, Wrench, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, type Cidade, type Produto, type ProprioDetalhe, type ProprioForm, type StatusUnidade, type Unidade } from "../lib/api";
import { MiniaturaProduto } from "../lib/categorias";
import { fmtDataHora, fmtNum } from "../lib/format";
import { BadgeStatusUnidade, ORDEM_STATUS, STATUS_UNIDADE, sugerirPrefixo } from "../lib/proprios";
import { useInvalidar } from "./acoes";
import { useAuth } from "./auth";
import { CampoCidade } from "./CampoCidade";
import { Botao, Campo, cn, Esqueleto, Input, InputSugestoes, Modal, Select, Textarea } from "./ui";

const numero = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const normalizar = (s: string | null) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/* ---------- Cadastro / edição com composição ---------- */
interface Linha {
  produto: Produto;
  qtd: string;
  alternativas: Produto[]; // podem substituir a peça na montagem
}

// Estoque da peça somando as alternativas (só para mostrar)
const estoqueLinha = (l: Linha) => l.produto.quantidade + l.alternativas.reduce((s, a) => s + a.quantidade, 0);
// Cada unidade usa UMA das peças, sem misturar: dá para = o que dá com cada uma, somado
const daParaLinha = (l: Linha, q: number) =>
  [l.produto, ...l.alternativas].reduce((s, p) => s + Math.floor(p.quantidade / q + 1e-9), 0);

export function ProprioModal({ proprio, aoFechar }: { proprio?: ProprioDetalhe; aoFechar: () => void }) {
  const invalidar = useInvalidar();
  const produtos = useQuery({ queryKey: ["produtos", {}], queryFn: () => api.produtos() });
  // Sugestões do "Tipo": os tipos que vocês já usaram nos produtos próprios
  const tipos = useQuery({ queryKey: ["tipos-proprios"], queryFn: api.tiposProprios });
  const [nome, setNome] = useState(proprio?.nome ?? "");
  const [prefixo, setPrefixo] = useState(proprio?.prefixo ?? "");
  const [prefixoManual, setPrefixoManual] = useState(!!proprio);
  const [tipo, setTipo] = useState(proprio?.tipo ?? "");
  const [descricao, setDescricao] = useState(proprio?.descricao ?? "");
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [busca, setBusca] = useState("");
  const [altBusca, setAltBusca] = useState<{ linha: number; texto: string } | null>(null);

  // Monta as linhas iniciais quando a lista de produtos chega (precisamos do saldo atual de cada peça)
  const porId = new Map((produtos.data ?? []).map((p) => [p.id, p]));
  const atuais: Linha[] =
    linhas ??
    (proprio?.componentes ?? [])
      .map((c) => ({
        produto: porId.get(c.produto_id)!,
        qtd: String(c.quantidade).replace(".", ","),
        alternativas: c.alternativas.map((a) => porId.get(a.produto_id)).filter((a): a is Produto => !!a),
      }))
      .filter((l) => l.produto);
  // Peças já usadas (principais e alternativas): cada uma só pode aparecer uma vez na composição
  const usados = new Set(atuais.flatMap((l) => [l.produto.id, ...l.alternativas.map((a) => a.id)]));
  const ta = normalizar(altBusca?.texto.trim() ?? "");
  const sugestoesAlt = ta
    ? (produtos.data ?? []).filter((p) => !usados.has(p.id) && (normalizar(p.nome).includes(ta) || normalizar(p.categoria).includes(ta))).slice(0, 6)
    : [];
  const mudarLinha = (i: number, nova: Partial<Linha>) => setLinhas(atuais.map((x, j) => (j === i ? { ...x, ...nova } : x)));
  const addAlternativa = (i: number, p: Produto) => {
    mudarLinha(i, { alternativas: [...atuais[i]!.alternativas, p] });
    setAltBusca(null);
  };
  const t = normalizar(busca.trim());
  const sugestoes = t
    ? (produtos.data ?? []).filter((p) => !usados.has(p.id) && (normalizar(p.nome).includes(t) || normalizar(p.categoria).includes(t))).slice(0, 6)
    : [];

  const capacidade = atuais.length
    ? Math.min(...atuais.map((l) => (numero(l.qtd) > 0 ? daParaLinha(l, numero(l.qtd)) : Infinity)))
    : null;

  const salvar = useMutation({
    mutationFn: () => {
      const d: ProprioForm = {
        nome,
        prefixo,
        tipo: tipo || null,
        descricao: descricao || null,
        componentes: atuais.map((l) => ({ produto_id: l.produto.id, quantidade: numero(l.qtd), alternativas: l.alternativas.map((a) => a.id) })),
      };
      return proprio ? api.atualizarProprio(proprio.id, d) : api.criarProprio(d);
    },
    onSuccess: (p) => {
      toast.success(proprio ? "Produto atualizado" : "Produto próprio cadastrado", { description: p.nome });
      invalidar();
      aoFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const qtdsOk = atuais.every((l) => numero(l.qtd) > 0);
  const valido = nome.trim() && prefixo.trim() && qtdsOk;
  const temUnidades = (proprio?.total_unidades ?? 0) > 0;

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      largura="lg"
      titulo={proprio ? "Editar produto próprio" : "Novo produto próprio"}
      descricao="Algo que vocês montam aqui, como o Olie ou um sensor."
      icone={<Factory />}
      rodape={
        <>
          <Botao variante="ghost" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primary" type="submit" form="form-proprio" disabled={!valido} carregando={salvar.isPending}>
            {proprio ? "Salvar" : "Cadastrar"}
          </Botao>
        </>
      }
    >
      <form
        id="form-proprio"
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (valido) salvar.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-6">
          <Campo rotulo="Nome" obrigatorio className="sm:col-span-3">
            {(id) => (
              <Input
                id={id}
                value={nome}
                onChange={(e) => {
                  setNome(e.target.value);
                  if (!prefixoManual) setPrefixo(sugerirPrefixo(e.target.value));
                }}
                placeholder="Ex.: Olie"
                maxLength={120}
                autoFocus
              />
            )}
          </Campo>
          <Campo
            rotulo="Prefixo do nº de série"
            obrigatorio
            className="sm:col-span-3"
            dica={temUnidades ? "Não muda depois que já existem unidades" : prefixo ? `As unidades serão ${prefixo}-0001, ${prefixo}-0002…` : "Ex.: OLIE"}
          >
            {(id) => (
              <Input
                id={id}
                value={prefixo}
                onChange={(e) => {
                  setPrefixoManual(true);
                  setPrefixo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12));
                }}
                className="tabular uppercase"
                disabled={temUnidades}
              />
            )}
          </Campo>
          <Campo rotulo="Tipo" className="sm:col-span-2">
            {(id) => (
              <InputSugestoes
                id={id}
                sugestoes={tipos.data ?? []}
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                placeholder="Ex.: Robô, Sensor"
                maxLength={60}
              />
            )}
          </Campo>
          <Campo rotulo="Descrição" className="sm:col-span-4">
            {(id) => <Input id={id} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Para que serve, versão…" />}
          </Campo>
        </div>

        <div>
          <div className="mb-2 flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Composição</p>
              <p className="text-xs text-muted">Peças do estoque e quanto vai em UMA unidade. “+ alternativa”: outra peça que pode ir no lugar.</p>
            </div>
            {capacidade !== null && Number.isFinite(capacidade) && (
              <p className="text-right text-xs text-muted">
                Com o estoque atual dá para montar <span className="tabular text-sm font-semibold text-fg">{capacidade}</span>
              </p>
            )}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Adicionar peça… ex.: bateria"
              className="pl-9"
              aria-label="Buscar peça para adicionar"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (sugestoes[0]) {
                    setLinhas([...atuais, { produto: sugestoes[0], qtd: "1", alternativas: [] }]);
                    setBusca("");
                  }
                }
              }}
            />
            {sugestoes.length > 0 && (
              <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-line-strong bg-surface p-1 shadow-xl">
                {sugestoes.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setLinhas([...atuais, { produto: p, qtd: "1", alternativas: [] }]);
                        setBusca("");
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2"
                    >
                      <MiniaturaProduto produto={p} tamanho="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm">{p.nome}</span>
                      <span className="tabular text-xs text-muted">
                        tem {fmtNum(p.quantidade)} {p.unidade}
                      </span>
                      <Plus className="size-4 text-primary" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {produtos.isLoading && proprio ? (
            <Esqueleto className="mt-3 h-24" />
          ) : atuais.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
              Nenhuma peça ainda. Busque acima para adicionar.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
              {atuais.map((l, i) => {
                const q = numero(l.qtd);
                const da = q > 0 ? daParaLinha(l, q) : null;
                const limita = da !== null && da === capacidade;
                const buscando = altBusca?.linha === i;
                return (
                  <li key={l.produto.id} className="px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <MiniaturaProduto produto={l.produto} tamanho="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{l.produto.nome}</p>
                        <p className={cn("tabular text-xs", limita ? "text-warn" : "text-subtle")}>
                          tem {fmtNum(l.produto.quantidade)} {l.produto.unidade}
                          {l.alternativas.length > 0 && ` (+${fmtNum(estoqueLinha(l) - l.produto.quantidade)} nas alternativas)`}
                          {da !== null && ` · dá para ${da}`}
                          {limita && " · limita"}
                        </p>
                      </div>
                      <Input
                        value={l.qtd}
                        onChange={(e) => mudarLinha(i, { qtd: e.target.value })}
                        onFocus={(e) => e.target.select()}
                        inputMode="decimal"
                        className={cn("tabular w-20! shrink-0 text-center", q <= 0 && "border-danger")}
                        aria-label={`Quantidade de ${l.produto.nome} por unidade`}
                      />
                      <span className="w-8 text-xs text-subtle">{l.produto.unidade}</span>
                      <Botao
                        type="button"
                        variante="ghost"
                        tamanho="icon"
                        aria-label={`Tirar ${l.produto.nome}`}
                        onClick={() => setLinhas(atuais.filter((_, j) => j !== i))}
                        className="hover:text-danger"
                      >
                        <Trash2 />
                      </Botao>
                    </div>

                    {/* Alternativas: peças que podem entrar no lugar desta na montagem */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-11">
                      {l.alternativas.map((a) => (
                        <span key={a.id} className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 py-0.5 pr-0.5 pl-2 text-xs">
                          <Repeat className="size-3 text-subtle" />
                          <span className="max-w-48 truncate">{a.nome}</span>
                          <span className="tabular text-subtle">· {fmtNum(a.quantidade)}</span>
                          <button
                            type="button"
                            aria-label={`Tirar a alternativa ${a.nome}`}
                            onClick={() => mudarLinha(i, { alternativas: l.alternativas.filter((x) => x.id !== a.id) })}
                            className="grid size-4 cursor-pointer place-items-center rounded text-subtle hover:text-danger"
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                      {buscando ? (
                        <div className="relative w-56">
                          <Input
                            autoFocus
                            value={altBusca.texto}
                            onChange={(e) => setAltBusca({ linha: i, texto: e.target.value })}
                            onBlur={() => setTimeout(() => setAltBusca((b) => (b?.linha === i ? null : b)), 150)}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                e.preventDefault();
                                e.stopPropagation();
                                setAltBusca(null);
                              } else if (e.key === "Enter") {
                                e.preventDefault();
                                if (sugestoesAlt[0]) addAlternativa(i, sugestoesAlt[0]);
                              }
                            }}
                            placeholder="Buscar alternativa…"
                            className="h-7 text-xs"
                            aria-label={`Buscar alternativa para ${l.produto.nome}`}
                          />
                          {sugestoesAlt.length > 0 && (
                            <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-line-strong bg-surface p-1 shadow-xl">
                              {sugestoesAlt.map((p) => (
                                <li key={p.id}>
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => addAlternativa(i, p)}
                                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-surface-2"
                                  >
                                    <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                                    <span className="tabular text-subtle">tem {fmtNum(p.quantidade)}</span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAltBusca({ linha: i, texto: "" })}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-subtle hover:text-primary"
                        >
                          <Plus className="size-3" /> alternativa
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </form>
    </Modal>
  );
}

/* ---------- Montar ---------- */
export function MontarModal({ proprio, aoFechar }: { proprio: ProprioDetalhe; aoFechar: () => void }) {
  const invalidar = useInvalidar();
  const { usuario } = useAuth();
  const pessoas = useQuery({ queryKey: ["pessoas"], queryFn: () => api.pessoas() });
  const [qtd, setQtd] = useState(1);
  const [status, setStatus] = useState<"em_producao" | "pronto">("em_producao");
  const [pessoaId, setPessoaId] = useState<number | null>(usuario.id);
  const [obs, setObs] = useState("");
  // Peça com alternativa: qual usar nesta montagem. Só a escolhida sai do estoque (nunca as duas).
  const [preferencias, setPreferencias] = useState<Record<number, number>>({});

  const linhas = proprio.componentes.map((c) => {
    const precisa = c.quantidade * qtd;
    const todas = [
      { id: c.produto_id, nome: c.produto_nome, tem: c.em_estoque, arquivada: c.produto_arquivado },
      ...c.alternativas.map((a) => ({ id: a.produto_id, nome: a.produto_nome, tem: a.em_estoque, arquivada: a.arquivado })),
    ].filter((f) => !f.arquivada);
    // Sem escolha: a principal; se ela não der, a primeira alternativa que der
    const padrao = todas.find((f) => f.tem + 1e-9 >= precisa) ?? todas[0];
    const usada = todas.find((f) => f.id === preferencias[c.produto_id]) ?? padrao;
    const tem = usada?.tem ?? 0;
    return { c, precisa, todas, usada, tem, fica: tem - precisa, falta: precisa > tem + 1e-9 };
  });
  const faltaAlgo = linhas.some((l) => l.falta);

  const montar = useMutation({
    mutationFn: () =>
      api.montar(proprio.id, {
        quantidade: qtd,
        pessoa_id: pessoaId,
        status_inicial: status,
        observacao: obs || null,
        preferencias: Object.fromEntries(linhas.filter((l) => l.usada).map((l) => [l.c.produto_id, l.usada!.id])),
      }),
    onSuccess: (m) => {
      const s = m.unidades;
      toast.success(`${m.quantidade}× ${proprio.nome} montado${m.quantidade > 1 ? "s" : ""}`, {
        description: s.length === 1 ? s[0]!.numero_serie : `${s[0]!.numero_serie} a ${s[s.length - 1]!.numero_serie}`,
      });
      invalidar();
      aoFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      largura="lg"
      titulo={`Montar ${proprio.nome}`}
      descricao="As peças saem do estoque agora e cada unidade ganha um número de série."
      icone={<Wrench />}
      rodape={
        <>
          <Botao variante="ghost" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primary" type="submit" form="form-montar" disabled={faltaAlgo || qtd < 1} carregando={montar.isPending}>
            Montar {qtd}
          </Botao>
        </>
      }
    >
      <form
        id="form-montar"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!faltaAlgo) montar.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Quantas unidades" dica={`Com o estoque atual dá para ${proprio.capacidade ?? 0}`}>
            {(id) => (
              <div className="flex">
                <Botao type="button" tamanho="icon" className="h-9 w-9 rounded-r-none" onClick={() => setQtd((n) => Math.max(1, n - 1))} aria-label="Diminuir">
                  <Minus />
                </Botao>
                <Input
                  id={id}
                  value={qtd}
                  onChange={(e) => setQtd(Math.max(1, Math.min(500, Math.floor(Number(e.target.value) || 1))))}
                  onFocus={(e) => e.target.select()}
                  inputMode="numeric"
                  className="tabular rounded-none border-x-0 text-center"
                />
                <Botao type="button" tamanho="icon" className="h-9 w-9 rounded-l-none" onClick={() => setQtd((n) => Math.min(500, n + 1))} aria-label="Aumentar">
                  <Plus />
                </Botao>
              </div>
            )}
          </Campo>
          <Campo rotulo="Quem está montando">
            {(id) => (
              <Select id={id} value={pessoaId ?? ""} onChange={(e) => setPessoaId(e.target.value ? Number(e.target.value) : null)}>
                {pessoas.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </Select>
            )}
          </Campo>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-muted">Situação inicial</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["em_producao", "pronto"] as const).map((s) => (
              <label
                key={s}
                className={cn(
                  "cursor-pointer rounded-lg border p-3 transition-colors",
                  status === s ? "border-primary/50 bg-primary-soft" : "border-line hover:border-line-strong",
                )}
              >
                <input type="radio" name="status-inicial" className="sr-only" checked={status === s} onChange={() => setStatus(s)} />
                <span className={cn("block text-sm font-medium", status === s && "text-primary")}>{STATUS_UNIDADE[s].rotulo}</span>
                <span className="mt-0.5 block text-xs text-muted">{STATUS_UNIDADE[s].ajuda}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <p className="mb-1.5 text-[13px] font-medium text-muted">Peças que vão sair do estoque</p>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {linhas.map(({ c, precisa, todas, usada, tem, fica, falta }) => (
              <li key={c.produto_id} className="px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {usada && usada.id !== c.produto_id ? (
                      <>
                        {usada.nome} <span className="text-xs text-subtle">no lugar de {c.produto_nome}</span>
                      </>
                    ) : (
                      c.produto_nome
                    )}
                  </span>
                  <span className="tabular text-sm">
                    −{fmtNum(precisa)} <span className="text-xs text-subtle">{c.produto_unidade}</span>
                  </span>
                  <span className={cn("tabular w-28 text-right text-xs", falta ? "text-danger" : fica <= 0 ? "text-warn" : "text-muted")}>
                    {falta ? `faltam ${fmtNum(precisa - tem)}` : `${fmtNum(tem)} → ${fmtNum(fica)}`}
                  </span>
                </div>
                {todas.length > 1 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-3">
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      <Repeat className="size-3" /> Usar
                    </span>
                    <Select
                      value={usada?.id ?? ""}
                      onChange={(e) => setPreferencias((p) => ({ ...p, [c.produto_id]: Number(e.target.value) }))}
                      className="h-7! w-auto! min-w-48 text-xs"
                      aria-label={`Qual peça usar como ${c.produto_nome}`}
                    >
                      {todas.map((f) => (
                        <option key={f.id} value={f.id}>
                          {`${f.nome} · tem ${fmtNum(f.tem)}`}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        <Campo rotulo="Observação">
          {(id) => <Input id={id} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: lote para o cliente Acme" maxLength={255} />}
        </Campo>
      </form>
    </Modal>
  );
}

/* ---------- Situação de uma unidade ---------- */
export function UnidadeModal({ unidade, aoFechar }: { unidade: Unidade; aoFechar: () => void }) {
  const invalidar = useInvalidar();
  const [status, setStatus] = useState<StatusUnidade>(unidade.status);
  const [projetoId, setProjetoId] = useState<number | null>(unidade.projeto_id);
  const [obs, setObs] = useState("");
  const [cidade, setCidade] = useState<Cidade | null>(unidade.cidade);
  const eventos = useQuery({ queryKey: ["eventos-unidade", unidade.id], queryFn: () => api.eventosUnidade(unidade.id) });
  const projetos = useQuery({ queryKey: ["projetos"], queryFn: api.projetos });

  // Para escolher: os projetos que estão no OneDrive (+ o atual, mesmo que a pasta tenha saído de lá)
  const opcoes = (projetos.data ?? []).filter((p) => p.no_onedrive || p.id === unidade.projeto_id);
  const haProjetos = (projetos.data ?? []).some((p) => p.no_onedrive);
  // Em campo exige projeto — só quando já existem projetos (antes de conectar o OneDrive não trava ninguém)
  const precisaProjeto = status === "em_campo" && !projetoId && haProjetos;
  const projetoLocal = (projetos.data ?? []).find((p) => p.id === projetoId)?.local_nome ?? null;
  const salvar = useMutation({
    mutationFn: () => api.atualizarUnidade(unidade.id, { status, projeto_id: projetoId, observacao: obs || null, cidade }),
    onSuccess: (u) => {
      toast.success(`${u.numero_serie}: ${STATUS_UNIDADE[u.status].rotulo}`);
      invalidar();
      aoFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      largura="lg"
      titulo={unidade.numero_serie}
      descricao={unidade.proprio_nome}
      icone={<Factory />}
      rodape={
        <>
          <Botao variante="ghost" onClick={aoFechar}>
            Fechar
          </Botao>
          <Botao variante="primary" type="submit" form="form-unidade" disabled={precisaProjeto} carregando={salvar.isPending}>
            Salvar
          </Botao>
        </>
      }
    >
      <form
        id="form-unidade"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!precisaProjeto) salvar.mutate();
        }}
      >
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-muted">Situação</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {ORDEM_STATUS.map((s) => (
              <label
                key={s}
                className={cn(
                  "cursor-pointer rounded-lg border p-2.5 transition-colors",
                  status === s ? "border-primary/50 bg-primary-soft" : "border-line hover:border-line-strong",
                )}
              >
                <input type="radio" name="status-unidade" className="sr-only" checked={status === s} onChange={() => setStatus(s)} />
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {STATUS_UNIDADE[s].icone}
                  {STATUS_UNIDADE[s].rotulo}
                </span>
                <span className="mt-0.5 block text-xs text-muted">{STATUS_UNIDADE[s].ajuda}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Campo
          rotulo="Projeto"
          obrigatorio={status === "em_campo" && haProjetos}
          erro={precisaProjeto ? "Escolha em qual projeto (empresa) a unidade está" : undefined}
          dica={
            projetos.isSuccess && !haProjetos ? (
              <>
                Nenhum projeto ainda: eles vêm das pastas do OneDrive (veja{" "}
                <Link to="/projetos" className="text-primary hover:underline">
                  Projetos
                </Link>
                ).
              </>
            ) : unidade.local && !unidade.projeto_id ? (
              `Antes estava anotado: ${unidade.local}`
            ) : (
              "No escritório, use o 21.0. Os projetos vêm das pastas do OneDrive."
            )
          }
        >
          {(id) => (
            <Select
              id={id}
              value={projetoId ?? ""}
              onChange={(e) => setProjetoId(e.target.value ? Number(e.target.value) : null)}
              disabled={projetos.isLoading || opcoes.length === 0}
            >
              <option value="">{opcoes.length ? "Sem projeto" : "Nenhum projeto disponível"}</option>
              {opcoes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                  {!p.no_onedrive && " (saiu do OneDrive)"}
                </option>
              ))}
            </Select>
          )}
        </Campo>
        <Campo
          rotulo="Cidade"
          dica={
            cidade
              ? "Aparece no mapa nesta cidade."
              : projetoLocal
                ? `Vazio: usa o local do projeto (${projetoLocal}).`
                : "Opcional. Escolha a cidade para a unidade aparecer no mapa."
          }
        >
          {(id) => <CampoCidade id={id} valor={cidade} aoMudar={setCidade} />}
        </Campo>

        <Campo rotulo="Observação">
          {(id) => <Textarea id={id} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: Instalado pelo Bruno; trocar bateria em março" className="min-h-16" />}
        </Campo>
      </form>

      <div className="mt-6">
        <p className="mb-2 flex items-center gap-2 text-[13px] font-medium text-muted">
          <History className="size-4" /> Histórico
        </p>
        {eventos.isLoading ? (
          <Esqueleto className="h-20" />
        ) : (
          <ol className="relative ml-2 border-l border-line pl-5">
            {eventos.data?.map((e) => (
              <li key={e.id} className="relative pb-4 last:pb-0">
                <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-surface bg-line-strong" />
                <div className="flex flex-wrap items-center gap-2">
                  <BadgeStatusUnidade status={e.status} />
                  <span className="text-xs text-subtle">
                    {fmtDataHora(e.criado_em)}
                    {e.registrado_por_nome && ` · ${e.registrado_por_nome}`}
                  </span>
                </div>
                {(e.projeto_nome || e.local || e.observacao) && (
                  <p className="mt-1 text-sm text-muted">{[e.projeto_nome ?? e.local, e.observacao].filter(Boolean).join(" — ")}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </Modal>
  );
}

