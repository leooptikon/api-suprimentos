import { useMutation, useQuery } from "@tanstack/react-query";
import { Archive, ArchiveRestore, ArrowDownToLine, ArrowUpFromLine, Download, MapPin, Package, PackagePlus, Search, SearchX } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAcoes, useInvalidar } from "../components/acoes";
import { useAuth } from "../components/auth";
import { BotaoComprar } from "../components/BotaoComprar";
import { CabecalhoPagina } from "../components/Layout";
import { Botao, Card, cn, Esqueleto, Input, MedidorEstoque, Select, StatusBadge, Vazio } from "../components/ui";
import { api, type StatusEstoque } from "../lib/api";
import { EtiquetaCategoria, MiniaturaProduto } from "../lib/categorias";
import { fmtMoeda, fmtNum, SEM_LOCAL } from "../lib/format";

const FILTROS: { valor: StatusEstoque | ""; rotulo: string; ponto?: string }[] = [
  { valor: "", rotulo: "Todos" },
  { valor: "ok", rotulo: "Em estoque", ponto: "bg-ok" },
  { valor: "baixo", rotulo: "Baixo", ponto: "bg-warn" },
  { valor: "esgotado", rotulo: "Esgotado", ponto: "bg-danger" },
];

export function Produtos() {
  const acoes = useAcoes();
  const { admin } = useAuth();
  const invalidar = useInvalidar();
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const [busca, setBusca] = useState(params.get("busca") ?? "");
  const buscaAdiada = useDeferredValue(busca.trim());
  const categoria = params.get("categoria") ?? "";
  const local = params.get("local") ?? "";
  const status = (params.get("status") ?? "") as StatusEstoque | "";
  const arquivados = params.get("arquivados") === "1";

  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };

  const filtros = { busca: buscaAdiada, categoria, local, status, arquivados };
  const produtos = useQuery({ queryKey: ["produtos", filtros], queryFn: () => api.produtos(filtros), placeholderData: (a) => a });
  const categorias = useQuery({ queryKey: ["categorias"], queryFn: api.categorias });
  const locais = useQuery({ queryKey: ["locais"], queryFn: api.locais });

  const restaurar = useMutation({
    mutationFn: api.restaurarProduto,
    onSuccess: (p) => {
      toast.success("Produto restaurado", { description: p.nome });
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lista = produtos.data ?? [];
  const filtrando = !!(buscaAdiada || categoria || local || status);

  return (
    <>
      <CabecalhoPagina
        titulo={arquivados ? "Produtos arquivados" : "Produtos"}
        descricao={
          arquivados
            ? "Itens que saíram das listas, mas mantêm o histórico."
            : produtos.data
              ? `${lista.length} ${lista.length === 1 ? "item" : "itens"}${filtrando ? " encontrados" : " cadastrados"}`
              : "Carregando…"
        }
        acoes={
          <>
            {admin && (
              <Botao variante="ghost" onClick={() => setParam("arquivados", arquivados ? "" : "1")}>
                {arquivados ? <Package /> : <Archive />}
                {arquivados ? "Ver ativos" : "Arquivados"}
              </Botao>
            )}
            <a href={api.exportarUrl("estoque")} download>
              <Botao tabIndex={-1}>
                <Download /> Exportar Excel
              </Botao>
            </a>
            {admin && (
              <Botao variante="primary" onClick={() => acoes.editarProduto()}>
                <PackagePlus /> Novo produto
              </Botao>
            )}
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="relative flex-1 lg:min-w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <Input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setParam("busca", e.target.value);
              }}
              placeholder="Buscar por nome, categoria, local…"
              className="pl-9"
              aria-label="Buscar produtos"
            />
          </div>
          <Select value={categoria} onChange={(e) => setParam("categoria", e.target.value)} className="lg:w-48" aria-label="Categoria">
            <option value="">Todas as categorias</option>
            {categorias.data?.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select value={local} onChange={(e) => setParam("local", e.target.value)} className="lg:w-56" aria-label="Local">
            <option value="">Todos os locais</option>
            <option value={SEM_LOCAL}>Sem localização</option>
            {locais.data?.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
          {!arquivados && (
            <div role="radiogroup" aria-label="Situação do estoque" className="flex gap-1 overflow-x-auto rounded-lg border border-line bg-bg/50 p-1">
              {FILTROS.map((f) => (
                <button
                  key={f.valor}
                  role="radio"
                  aria-checked={status === f.valor}
                  onClick={() => setParam("status", f.valor)}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] whitespace-nowrap transition-colors",
                    status === f.valor ? "bg-surface-2 font-medium text-fg shadow-sm" : "text-muted hover:text-fg",
                  )}
                >
                  {f.ponto && <span className={cn("size-1.5 rounded-full", f.ponto)} />}
                  {f.rotulo}
                </button>
              ))}
            </div>
          )}
        </div>

        {produtos.isLoading ? (
          <div className="flex flex-col gap-3 p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <Esqueleto key={i} className="h-12" />
            ))}
          </div>
        ) : lista.length === 0 ? (
          filtrando ? (
            <Vazio icone={<SearchX />} titulo="Nada encontrado" texto="Tente outro termo ou limpe os filtros." />
          ) : arquivados ? (
            <Vazio icone={<Archive />} titulo="Nenhum produto arquivado" />
          ) : (
            <Vazio
              icone={<Package />}
              titulo="Nenhum produto cadastrado"
              texto={admin ? "Cadastre o primeiro item do estoque do escritório." : "Peça para um administrador cadastrar os itens."}
              acao={
                admin && <Botao variante="primary" onClick={() => acoes.editarProduto()}>
                  <PackagePlus /> Novo produto
                </Botao>
              }
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] tracking-wider text-subtle uppercase">
                  <th className="px-4 py-2.5 font-medium">Produto</th>
                  <th className="px-2 py-2.5 font-medium sm:px-4">Estoque</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">Situação</th>
                  <th className="hidden px-4 py-2.5 font-medium xl:table-cell">Localização</th>
                  <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Fornecedor</th>
                  <th className="px-4 py-2.5">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {lista.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => navegar(`/produtos/${p.id}`)}
                    className="group cursor-pointer transition-colors hover:bg-surface-2/50"
                  >
                    <td className="max-w-[190px] px-4 py-3 sm:max-w-[360px]">
                      <div className="flex items-center gap-3">
                        <MiniaturaProduto produto={p} className="max-sm:hidden" />
                        <div className="min-w-0">
                          <p className="truncate font-medium group-hover:text-primary">{p.nome}</p>
                          <EtiquetaCategoria categoria={p.categoria} className="max-w-full truncate" />
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-3 sm:w-44 sm:px-4">
                      <p className="tabular">
                        <span className="font-medium">{fmtNum(p.quantidade)}</span>
                        <span className="ml-1 text-xs text-subtle">{p.unidade}</span>
                        {p.estoque_minimo > 0 && <span className="ml-1.5 hidden text-xs text-subtle sm:inline">/ mín {fmtNum(p.estoque_minimo)}</span>}
                      </p>
                      <MedidorEstoque quantidade={p.quantidade} minimo={p.estoque_minimo} status={p.status} className="mt-1.5 w-16 sm:w-auto sm:max-w-32" />
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="hidden px-4 py-3 text-muted xl:table-cell">
                      {p.localizacao ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setParam("local", p.localizacao!);
                          }}
                          title="Filtrar por este local"
                          className="flex items-center gap-1.5 rounded text-left whitespace-nowrap hover:text-primary"
                        >
                          <MapPin className="size-3.5 shrink-0 text-subtle" />
                          {p.localizacao}
                        </button>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      {p.fornecedor_preferido ? (
                        <>
                          <p className="text-muted">{p.fornecedor_preferido}</p>
                          {p.menor_preco != null && <p className="tabular text-xs whitespace-nowrap text-subtle">a partir de {fmtMoeda(p.menor_preco)}</p>}
                        </>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 pl-2 sm:pl-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {arquivados ? (
                          <Botao tamanho="sm" onClick={() => restaurar.mutate(p.id)} carregando={restaurar.isPending && restaurar.variables === p.id}>
                            <ArchiveRestore /> Restaurar
                          </Botao>
                        ) : (
                          <>
                            <BotaoComprar produto={p} compacto />
                            <Botao
                              tamanho="icon"
                              variante="ghost"
                              title="Registrar entrada"
                              aria-label={`Registrar entrada de ${p.nome}`}
                              onClick={() => acoes.movimentar({ produto: p, tipo: "entrada" })}
                              className="max-sm:hidden"
                            >
                              <ArrowDownToLine />
                            </Botao>
                            <Botao
                              tamanho="sm"
                              disabled={p.quantidade <= 0}
                              aria-label={`Retirar ${p.nome}`}
                              onClick={() => acoes.movimentar({ produto: p, tipo: "retirada" })}
                              className="group-hover:border-primary/40 group-hover:text-primary"
                            >
                              <ArrowUpFromLine /> <span className="hidden sm:inline">Retirar</span>
                            </Botao>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
