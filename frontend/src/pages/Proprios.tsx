import { useMutation, useQuery } from "@tanstack/react-query";
import { Archive, ArchiveRestore, ArrowLeft, Factory, Layers, Pencil, Plus, Search, ShoppingCart, Undo2, Wrench } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useInvalidar } from "../components/acoes";
import { useAuth } from "../components/auth";
import { CabecalhoPagina } from "../components/Layout";
import { MontarModal, ProprioModal, UnidadeModal } from "../components/proprios";
import { Badge, Botao, Card, CardHeader, cn, Confirmar, Esqueleto, Input, Select, Vazio } from "../components/ui";
import { api, type Proprio, type StatusUnidade, type Unidade } from "../lib/api";
import { MiniaturaProduto } from "../lib/categorias";
import { fmtNum, fmtRelativo } from "../lib/format";
import { BadgeStatusUnidade, ORDEM_STATUS, STATUS_UNIDADE } from "../lib/proprios";

/* ---------- Página: lista ---------- */
export function Proprios() {
  const [params, setParams] = useSearchParams();
  const aba = params.get("aba") === "unidades" ? "unidades" : "produtos";
  const { admin } = useAuth();
  const [novo, setNovo] = useState(false);

  return (
    <>
      <CabecalhoPagina
        titulo="Produtos próprios"
        descricao="O que vocês montam aqui: composição, quanto dá para fazer e onde está cada unidade."
        acoes={
          admin && (
            <Botao variante="primary" onClick={() => setNovo(true)}>
              <Plus /> Novo produto próprio
            </Botao>
          )
        }
      />

      <div role="tablist" className="mb-4 inline-flex gap-1 rounded-lg border border-line bg-bg/50 p-1">
        {(
          [
            ["produtos", "Produtos", <Layers key="i" className="size-4" />],
            ["unidades", "Unidades", <Factory key="i" className="size-4" />],
          ] as const
        ).map(([v, r, i]) => (
          <button
            key={v}
            role="tab"
            aria-selected={aba === v}
            onClick={() => setParams(v === "produtos" ? {} : { aba: v }, { replace: true })}
            className={cn(
              "flex h-8 items-center gap-2 rounded-md px-3 text-sm transition-colors",
              aba === v ? "bg-surface-2 font-medium text-fg shadow-sm" : "text-muted hover:text-fg",
            )}
          >
            {i}
            {r}
          </button>
        ))}
      </div>

      {aba === "produtos" ? <ListaProprios aoCriar={() => setNovo(true)} /> : <ListaUnidades />}
      {novo && <ProprioModal aoFechar={() => setNovo(false)} />}
    </>
  );
}

function Capacidade({ p, grande }: { p: Proprio; grande?: boolean }) {
  if (p.capacidade === null) return <p className="text-sm text-muted">Sem composição cadastrada</p>;
  return (
    <div>
      <p className="text-xs text-muted">Dá para montar agora</p>
      <p className={cn("tabular leading-none font-semibold tracking-tight", grande ? "mt-2 text-5xl" : "mt-1 text-3xl", p.capacidade === 0 ? "text-danger" : "text-fg")}>
        {p.capacidade}
      </p>
      {p.gargalo && (
        <p className="mt-2 text-xs text-muted">
          limitado por <span className="text-warn">{p.gargalo}</span>
        </p>
      )}
    </div>
  );
}

function ContagemStatus({ p, aoClicar }: { p: Proprio; aoClicar?: (s: StatusUnidade) => void }) {
  const ativos = ORDEM_STATUS.filter((s) => p.por_status[s] > 0);
  if (!ativos.length) return <p className="text-xs text-subtle">Nenhuma unidade montada ainda</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {ativos.map((s) => (
        <button key={s} type="button" onClick={() => aoClicar?.(s)} disabled={!aoClicar} className="disabled:cursor-default">
          <Badge tom={STATUS_UNIDADE[s].tom}>
            {STATUS_UNIDADE[s].icone}
            <span className="tabular">{p.por_status[s]}</span> {STATUS_UNIDADE[s].curto}
          </Badge>
        </button>
      ))}
    </div>
  );
}

function ListaProprios({ aoCriar }: { aoCriar: () => void }) {
  const { admin } = useAuth();
  const navegar = useNavigate();
  const lista = useQuery({ queryKey: ["proprios"], queryFn: () => api.proprios() });

  if (lista.isLoading)
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Esqueleto key={i} className="h-56 rounded-xl" />
        ))}
      </div>
    );
  if (!lista.data?.length)
    return (
      <Card>
        <Vazio
          icone={<Factory />}
          titulo="Nenhum produto próprio cadastrado"
          texto="Cadastre o Olie, um sensor ou o que vocês montam, com as peças que vão nele."
          acao={
            admin && (
              <Botao variante="primary" onClick={aoCriar}>
                <Plus /> Novo produto próprio
              </Botao>
            )
          }
        />
      </Card>
    );

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {lista.data.map((p) => (
        <Card key={p.id} className="group flex flex-col transition-colors hover:border-line-strong">
          <Link to={`/proprios/${p.id}`} className="flex flex-1 flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold group-hover:text-primary">{p.nome}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {p.tipo ?? "Sem tipo"} · <span className="tabular">{p.prefixo}-0001</span>
                </p>
              </div>
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary-soft text-primary">
                <Factory className="size-5" />
              </span>
            </div>
            <div className="mt-5">
              <Capacidade p={p} />
            </div>
            <div className="mt-5 border-t border-line pt-4">
              <ContagemStatus p={p} />
            </div>
          </Link>
          <div className="flex gap-2 border-t border-line p-3">
            <Botao className="flex-1" onClick={() => navegar(`/proprios/${p.id}?montar=1`)} disabled={!p.capacidade}>
              <Wrench /> Montar
            </Botao>
            <Botao variante="ghost" className="flex-1" onClick={() => navegar(`/proprios?aba=unidades&proprio=${p.id}`)}>
              Ver unidades
            </Botao>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ---------- Unidades (aba e dentro do detalhe) ---------- */
export function ListaUnidades({ proprioId }: { proprioId?: number }) {
  const [params, setParams] = useSearchParams();
  const { admin } = useAuth();
  const invalidar = useInvalidar();
  const filtroProprio = proprioId ?? (Number(params.get("proprio")) || undefined);
  const status = (params.get("status") ?? "") as StatusUnidade | "";
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<Unidade | null>(null);
  const [cancelar, setCancelar] = useState<Unidade | null>(null);

  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };

  const proprios = useQuery({ queryKey: ["proprios"], queryFn: () => api.proprios(), enabled: !proprioId });
  const todas = useQuery({
    queryKey: ["unidades", { proprio_id: filtroProprio, busca }],
    queryFn: () => api.unidades({ proprio_id: filtroProprio, busca: busca.trim() || undefined }),
    placeholderData: (a) => a,
  });
  const contagem = Object.fromEntries(ORDEM_STATUS.map((s) => [s, (todas.data ?? []).filter((u) => u.status === s).length]));
  const lista = (todas.data ?? []).filter((u) => !status || u.status === status);
  const mesmaMontagem = cancelar ? (todas.data ?? []).filter((u) => u.montagem_id === cancelar.montagem_id) : [];

  const cancelarMontagem = useMutation({
    mutationFn: () => api.cancelarMontagem(cancelar!.montagem_id!),
    onSuccess: () => {
      toast.success("Montagem cancelada", { description: "As peças voltaram para o estoque." });
      invalidar();
      setCancelar(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nº de série, projeto…" className="pl-9" aria-label="Buscar unidades" />
        </div>
        {!proprioId && (
          <Select value={filtroProprio ?? ""} onChange={(e) => setParam("proprio", e.target.value)} className="lg:w-52" aria-label="Produto">
            <option value="">Todos os produtos</option>
            {proprios.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
        )}
        <div role="radiogroup" aria-label="Situação" className="flex gap-1 overflow-x-auto rounded-lg border border-line bg-bg/50 p-1">
          {(["", ...ORDEM_STATUS] as const).map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={status === s}
              onClick={() => setParam("status", s)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] whitespace-nowrap transition-colors",
                status === s ? "bg-surface-2 font-medium text-fg shadow-sm" : "text-muted hover:text-fg",
              )}
            >
              {s ? STATUS_UNIDADE[s].curto : "Todas"}
              <span className="tabular text-xs text-subtle">{s ? contagem[s] : (todas.data?.length ?? 0)}</span>
            </button>
          ))}
        </div>
      </div>

      {todas.isLoading ? (
        <div className="flex flex-col gap-3 p-4">
          {[0, 1, 2].map((i) => (
            <Esqueleto key={i} className="h-11" />
          ))}
        </div>
      ) : lista.length === 0 ? (
        <Vazio icone={<Factory />} titulo={todas.data?.length ? "Nenhuma unidade nessa situação" : "Nenhuma unidade montada ainda"} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] tracking-wider text-subtle uppercase">
                <th className="px-4 py-2.5 font-medium">Nº de série</th>
                {!proprioId && <th className="hidden px-4 py-2.5 font-medium md:table-cell">Produto</th>}
                <th className="px-4 py-2.5 font-medium">Situação</th>
                <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Projeto</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Atualizado</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lista.map((u) => (
                <tr key={u.id} onClick={() => setAberta(u)} className="cursor-pointer transition-colors hover:bg-surface-2/50">
                  <td className="tabular px-4 py-3 font-medium">{u.numero_serie}</td>
                  {!proprioId && <td className="hidden px-4 py-3 text-muted md:table-cell">{u.proprio_nome}</td>}
                  <td className="px-4 py-3">
                    <BadgeStatusUnidade status={u.status} />
                  </td>
                  <td className="hidden max-w-[280px] truncate px-4 py-3 text-muted lg:table-cell" title={u.projeto_nome ?? u.local ?? undefined}>
                    {u.projeto_nome ?? u.local ?? <span className="text-subtle">—</span>}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-subtle sm:table-cell">{fmtRelativo(u.atualizado_em)}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      {admin && u.montagem_id && (u.status === "em_producao" || u.status === "pronto") && (
                        <Botao variante="ghost" tamanho="icon" title="Cancelar montagem" aria-label={`Cancelar montagem de ${u.numero_serie}`} onClick={() => setCancelar(u)} className="hover:text-danger">
                          <Undo2 />
                        </Botao>
                      )}
                      <Botao tamanho="sm" onClick={() => setAberta(u)}>
                        Mudar situação
                      </Botao>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aberta && <UnidadeModal unidade={aberta} aoFechar={() => setAberta(null)} />}
      {cancelar && (
        <Confirmar
          perigo
          titulo="Cancelar montagem?"
          texto={
            <>
              A montagem de <strong className="text-fg">{mesmaMontagem.map((u) => u.numero_serie).join(", ") || cancelar.numero_serie}</strong> será desfeita:
              essas unidades somem e as peças voltam para o estoque.
            </>
          }
          rotulo="Cancelar montagem"
          carregando={cancelarMontagem.isPending}
          aoConfirmar={() => cancelarMontagem.mutate()}
          aoFechar={() => setCancelar(null)}
        />
      )}
    </Card>
  );
}

/* ---------- Página: detalhe ---------- */
export function ProprioDetalhePagina() {
  const id = Number(useParams().id);
  const [params, setParams] = useSearchParams();
  const { admin } = useAuth();
  const invalidar = useInvalidar();
  const navegar = useNavigate();
  const [editar, setEditar] = useState(false);
  const [arquivar, setArquivar] = useState(false);
  const proprio = useQuery({ queryKey: ["proprio", id], queryFn: () => api.proprio(id) });
  const montar = params.get("montar") === "1";
  const fecharMontar = () => {
    const p = new URLSearchParams(params);
    p.delete("montar");
    setParams(p, { replace: true });
  };

  const remover = useMutation({
    mutationFn: () => api.removerProprio(id),
    onSuccess: () => {
      toast.success(proprio.data?.total_unidades ? "Produto arquivado" : "Produto excluído");
      invalidar();
      navegar("/proprios");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const restaurar = useMutation({
    mutationFn: () => api.restaurarProprio(id),
    onSuccess: () => {
      toast.success("Produto restaurado");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (proprio.isLoading) return <Esqueleto className="h-96 rounded-xl" />;
  if (!proprio.data)
    return (
      <Card>
        <Vazio icone={<Factory />} titulo="Produto próprio não encontrado" />
      </Card>
    );
  const p = proprio.data;
  const faltas = p.componentes.filter((c) => c.falta_para_mais_um > 0);

  return (
    <>
      <CabecalhoPagina
        antes={
          <Link to="/proprios" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
            <ArrowLeft className="size-4" /> Produtos próprios
          </Link>
        }
        titulo={
          <span className="flex flex-wrap items-center gap-3">
            {p.nome}
            {p.arquivado && <Badge>Arquivado</Badge>}
          </span>
        }
        descricao={
          <>
            {p.tipo ?? "Sem tipo"} · séries <span className="tabular">{p.prefixo}-0001…</span>
            {p.descricao && <> · {p.descricao}</>}
          </>
        }
        acoes={
          <>
            {admin && !p.arquivado && (
              <>
                <Botao variante="ghost" tamanho="icon" title={p.total_unidades ? "Arquivar" : "Excluir"} aria-label="Arquivar ou excluir" onClick={() => setArquivar(true)}>
                  <Archive />
                </Botao>
                <Botao variante="ghost" onClick={() => setEditar(true)}>
                  <Pencil /> Editar composição
                </Botao>
              </>
            )}
            {admin && p.arquivado && (
              <Botao onClick={() => restaurar.mutate()} carregando={restaurar.isPending}>
                <ArchiveRestore /> Restaurar
              </Botao>
            )}
            {!p.arquivado && (
              <Botao variante="primary" onClick={() => setParams({ montar: "1" }, { replace: true })} disabled={!p.capacidade}>
                <Wrench /> Montar
              </Botao>
            )}
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3 [&>*]:min-w-0">
        <div className="flex min-w-0 flex-col gap-4 xl:order-2">
          <Card className="p-5">
            <Capacidade p={p} grande />
            {faltas.length > 0 && p.capacidade !== null && (
              <div className="mt-5 border-t border-line pt-4">
                <p className="text-xs font-medium text-muted">Para montar {p.capacidade === 0 ? "o primeiro" : "mais 1"}, falta:</p>
                <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                  {faltas.map((c) => (
                    <li key={c.produto_id} className="flex justify-between gap-3">
                      <span className="truncate">{c.produto_nome}</span>
                      <span className="tabular shrink-0 text-warn">
                        {fmtNum(c.falta_para_mais_um)} {c.produto_unidade}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link to="/compras" className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                  <ShoppingCart className="size-3.5" /> Ver lista de compras
                </Link>
              </div>
            )}
          </Card>
          <Card className="p-5">
            <p className="mb-3 text-xs font-medium text-muted">Unidades por situação</p>
            <ContagemStatus p={p} aoClicar={(s) => setParams({ status: s }, { replace: true })} />
          </Card>
        </div>

        {/* min-w-0: sem isso o item da grade cresce até a largura da tabela e estoura no celular */}
        <Card className="min-w-0 xl:order-1 xl:col-span-2">
          <CardHeader titulo="Composição" descricao="Peças do estoque que vão em uma unidade" icone={<Layers />} />
          {p.componentes.length === 0 ? (
            <Vazio
              icone={<Layers />}
              titulo="Nenhuma peça na composição"
              acao={
                admin && (
                  <Botao onClick={() => setEditar(true)}>
                    <Pencil /> Adicionar peças
                  </Botao>
                )
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] tracking-wider text-subtle uppercase">
                    <th className="px-4 py-2.5 font-medium">Peça</th>
                    <th className="px-4 py-2.5 text-right font-medium">Por unidade</th>
                    <th className="px-4 py-2.5 text-right font-medium">Em estoque</th>
                    <th className="px-4 py-2.5 text-right font-medium">Dá para</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {p.componentes.map((c) => {
                    const limita = c.da_para === p.capacidade;
                    return (
                      <tr key={c.produto_id} className={cn(limita && "bg-warn-soft/40")}>
                        <td className="px-4 py-3">
                          <Link to={`/produtos/${c.produto_id}`} className="flex min-w-0 items-center gap-3 hover:text-primary">
                            <MiniaturaProduto produto={{ nome: c.produto_nome, categoria: c.produto_categoria, foto_url: c.produto_foto_url }} tamanho="sm" />
                            <span className="truncate">{c.produto_nome}</span>
                            {c.produto_arquivado && <Badge tom="danger">Arquivada</Badge>}
                          </Link>
                        </td>
                        <td className="tabular px-4 py-3 text-right">
                          {fmtNum(c.quantidade)} <span className="text-xs text-subtle">{c.produto_unidade}</span>
                        </td>
                        <td className="tabular px-4 py-3 text-right text-muted">{fmtNum(c.em_estoque)}</td>
                        <td className={cn("tabular px-4 py-3 text-right font-medium", limita ? "text-warn" : "text-fg")}>
                          {c.da_para}
                          {limita && <span className="ml-1.5 text-[11px] font-normal">limita</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <h2 className="mt-8 mb-3 text-lg font-semibold tracking-tight">Unidades</h2>
      <ListaUnidades proprioId={p.id} />

      {editar && <ProprioModal proprio={p} aoFechar={() => setEditar(false)} />}
      {montar && !p.arquivado && <MontarModal proprio={p} aoFechar={fecharMontar} />}
      {arquivar && (
        <Confirmar
          titulo={p.total_unidades ? "Arquivar produto próprio?" : "Excluir produto próprio?"}
          texto={
            p.total_unidades
              ? `${p.nome} sai da lista, mas as ${p.total_unidades} unidades e o histórico continuam guardados.`
              : `${p.nome} ainda não tem unidades e será excluído.`
          }
          rotulo={p.total_unidades ? "Arquivar" : "Excluir"}
          perigo={!p.total_unidades}
          carregando={remover.isPending}
          aoConfirmar={() => remover.mutate()}
          aoFechar={() => setArquivar(false)}
        />
      )}
    </>
  );
}
