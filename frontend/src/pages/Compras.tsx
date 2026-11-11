import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckSquare, ClipboardCopy, Download, ExternalLink, Minus, PackageCheck, Plus, ShoppingCart, Square } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../components/auth";
import { CabecalhoPagina } from "../components/Layout";
import { Botao, Card, cn, Esqueleto, Input, Select, StatusBadge, Vazio } from "../components/ui";
import { api, type ItemCompra } from "../lib/api";
import { EtiquetaCategoria, MiniaturaProduto } from "../lib/categorias";
import { fmtMoeda, fmtNum } from "../lib/format";

interface Escolha {
  incluir: boolean;
  qtd: string;
  fornecedorId: number | null;
}

const lerQtd = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Copia mesmo fora de HTTPS (ex.: acessando pelo IP da rede), onde navigator.clipboard não existe. */
async function copiar(texto: string) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(texto);
  const area = Object.assign(document.createElement("textarea"), { value: texto });
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("Não foi possível copiar");
}

export function Compras() {
  const { admin } = useAuth();
  const lista = useQuery({ queryKey: ["compras"], queryFn: api.compras });
  // Ajustes de quem está montando a lista; itens novos entram com a sugestão do sistema
  const [ajustes, setAjustes] = useState<Record<number, Escolha>>({});

  const itens = lista.data ?? [];
  const escolha = (i: ItemCompra): Escolha =>
    ajustes[i.produto.id] ?? { incluir: true, qtd: String(i.sugestao).replace(".", ","), fornecedorId: i.fornecedor_sugerido_id };
  const mudar = (i: ItemCompra, parcial: Partial<Escolha>) => setAjustes((a) => ({ ...a, [i.produto.id]: { ...escolha(i), ...parcial } }));

  const linhas = itens.map((i) => {
    const e = escolha(i);
    const opcao = i.opcoes.find((o) => o.fornecedor_id === e.fornecedorId) ?? null;
    const qtd = lerQtd(e.qtd);
    const subtotal = opcao?.preco != null ? qtd * opcao.preco : null;
    return { item: i, e, opcao, qtd, subtotal };
  });
  const marcadas = linhas.filter((l) => l.e.incluir && l.qtd > 0);
  const total = marcadas.reduce((s, l) => s + (l.subtotal ?? 0), 0);
  const semPreco = marcadas.filter((l) => l.subtotal === null).length;

  const exportar = useMutation({
    mutationFn: () => api.exportarCompras(marcadas.map((l) => ({ produto_id: l.item.produto.id, quantidade: l.qtd, fornecedor_id: l.opcao?.fornecedor_id ?? null }))),
    onError: (e: Error) => toast.error(e.message),
  });

  async function copiarLista() {
    const data = new Intl.DateTimeFormat("pt-BR").format(new Date());
    const corpo = marcadas.map((l) => {
      const p = l.item.produto;
      let linha = `• ${p.nome} — ${fmtNum(l.qtd)} ${p.unidade}`;
      if (l.opcao) linha += ` — ${l.opcao.fornecedor_nome}${l.opcao.preco != null ? ` ${fmtMoeda(l.opcao.preco)} (${fmtMoeda(l.subtotal!)})` : ""}`;
      if (l.opcao?.url) linha += `\n  ${l.opcao.url}`;
      return linha;
    });
    const texto = [`Lista de compras — ${data}`, "", ...corpo, "", `Total estimado: ${fmtMoeda(total)}${semPreco ? ` (${semPreco} sem preço)` : ""}`].join("\n");
    try {
      await copiar(texto);
      toast.success("Lista copiada", { description: "Cole no WhatsApp, e-mail ou onde preferir." });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const todasMarcadas = linhas.length > 0 && linhas.every((l) => l.e.incluir);

  return (
    <>
      <CabecalhoPagina
        titulo="Lista de compras"
        descricao="Itens esgotados ou no estoque mínimo. A sugestão completa até o dobro do mínimo — ajuste como quiser."
        acoes={
          itens.length > 0 && (
            <>
              <Botao onClick={copiarLista} disabled={marcadas.length === 0}>
                <ClipboardCopy /> Copiar lista
              </Botao>
              <Botao variante="primary" onClick={() => exportar.mutate()} disabled={marcadas.length === 0} carregando={exportar.isPending}>
                <Download /> Exportar Excel
              </Botao>
            </>
          )
        }
      />

      {lista.isLoading ? (
        <div className="flex flex-col gap-3">
          <Esqueleto className="h-24 rounded-xl" />
          <Esqueleto className="h-72 rounded-xl" />
        </div>
      ) : itens.length === 0 ? (
        <Card>
          <Vazio icone={<PackageCheck />} titulo="Nada para comprar agora" texto="Todos os itens estão acima do estoque mínimo." />
        </Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
            <Card className="p-3 sm:p-4">
              <p className="text-xs text-muted sm:text-[13px]">Itens na lista</p>
              <p className="tabular mt-1 text-base font-semibold sm:text-2xl">
                {marcadas.length}
                <span className="ml-1 text-sm font-normal text-subtle">de {itens.length}</span>
              </p>
            </Card>
            <Card className="p-3 sm:p-4">
              <p className="text-xs text-muted sm:text-[13px]">Total estimado</p>
              <p className="tabular mt-1 text-base font-semibold sm:text-2xl">{fmtMoeda(total)}</p>
            </Card>
            <Card className={cn("p-3 sm:p-4", semPreco > 0 && "border-warn/30")}>
              <p className="text-xs text-muted sm:text-[13px]">Sem preço</p>
              <p className={cn("tabular mt-1 text-base font-semibold sm:text-2xl", semPreco > 0 && "text-warn")}>{semPreco}</p>
              {semPreco > 0 && <p className="text-xs text-subtle max-sm:hidden">Não entram no total</p>}
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-[11px] tracking-wider text-subtle uppercase">
              <button
                onClick={() => setAjustes((a) => Object.fromEntries(itens.map((i) => [i.produto.id, { ...(a[i.produto.id] ?? escolha(i)), incluir: !todasMarcadas }])))}
                className="flex items-center gap-2 font-medium normal-case tracking-normal text-muted hover:text-fg"
              >
                {todasMarcadas ? <CheckSquare className="size-4 text-primary" /> : <Square className="size-4" />}
                {todasMarcadas ? "Desmarcar todos" : "Marcar todos"}
              </button>
            </div>
            <ul className="divide-y divide-line">
              {linhas.map(({ item: i, e, opcao, subtotal }) => {
                const p = i.produto;
                return (
                  <li
                    key={p.id}
                    className={cn(
                      "grid gap-x-4 gap-y-3 px-4 py-4 transition-opacity lg:grid-cols-[minmax(0,1.4fr)_150px_minmax(0,1fr)_150px] lg:items-center",
                      !e.incluir && "opacity-45",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <button onClick={() => mudar(i, { incluir: !e.incluir })} aria-pressed={e.incluir} aria-label={`Incluir ${p.nome}`} className="shrink-0">
                        {e.incluir ? <CheckSquare className="size-5 text-primary" /> : <Square className="size-5 text-subtle" />}
                      </button>
                      <MiniaturaProduto produto={p} />
                      <div className="min-w-0">
                        <Link to={`/produtos/${p.id}`} className="block truncate font-medium hover:text-primary">
                          {p.nome}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <StatusBadge status={p.status} />
                          <span className="tabular text-xs text-muted">
                            tem {fmtNum(p.quantidade)} · mín {fmtNum(p.estoque_minimo)} {p.unidade}
                          </span>
                          <EtiquetaCategoria categoria={p.categoria} className="max-sm:hidden" />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 max-lg:pl-8">
                      <span className="text-xs text-muted lg:hidden">Comprar</span>
                      <div className="flex">
                        <Botao tamanho="icon" className="h-9 w-9 rounded-r-none" onClick={() => mudar(i, { qtd: String(Math.max(0, lerQtd(e.qtd) - 1)) })} aria-label="Diminuir" disabled={!e.incluir}>
                          <Minus />
                        </Botao>
                        <Input
                          value={e.qtd}
                          onChange={(ev) => mudar(i, { qtd: ev.target.value })}
                          onFocus={(ev) => ev.target.select()}
                          inputMode="decimal"
                          className="tabular w-14 rounded-none border-x-0 text-center"
                          aria-label={`Quantidade de ${p.nome}`}
                          disabled={!e.incluir}
                        />
                        <Botao tamanho="icon" className="h-9 w-9 rounded-l-none" onClick={() => mudar(i, { qtd: String(lerQtd(e.qtd) + 1) })} aria-label="Aumentar" disabled={!e.incluir}>
                          <Plus />
                        </Botao>
                      </div>
                      <span className="text-xs text-subtle">{p.unidade}</span>
                    </div>

                    <div className="min-w-0 max-lg:pl-8">
                      {i.opcoes.length > 0 ? (
                        <Select
                          value={e.fornecedorId ?? ""}
                          onChange={(ev) => mudar(i, { fornecedorId: Number(ev.target.value) })}
                          aria-label={`Fornecedor de ${p.nome}`}
                          disabled={!e.incluir}
                        >
                          {i.opcoes.map((o) => (
                            <option key={o.fornecedor_id} value={o.fornecedor_id}>
                              {o.preferido ? "★ " : ""}
                              {o.fornecedor_nome}
                              {o.preco != null ? ` — ${fmtMoeda(o.preco)}` : " — sem preço"}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <p className="flex items-center gap-1.5 text-sm text-warn">
                          <AlertTriangle className="size-4" /> Sem fornecedor
                          {admin && (
                            <Link to={`/produtos/${p.id}`} className="ml-1 text-primary hover:underline">
                              cadastrar
                            </Link>
                          )}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-3 max-lg:pl-8 lg:justify-end">
                      <span className="tabular text-sm">{subtotal != null ? fmtMoeda(subtotal) : <span className="text-subtle">—</span>}</span>
                      {opcao?.url ? (
                        <a href={opcao.url} target="_blank" rel="noreferrer noopener" tabIndex={-1}>
                          <Botao tamanho="sm" variante="ghost" className="text-primary">
                            Loja <ExternalLink />
                          </Botao>
                        </a>
                      ) : (
                        <Botao tamanho="sm" variante="ghost" disabled title="Sem link cadastrado">
                          Loja <ExternalLink />
                        </Botao>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between border-t border-line bg-bg/40 px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-muted">
                <ShoppingCart className="size-4" /> {marcadas.length} {marcadas.length === 1 ? "item" : "itens"}
              </span>
              <span className="text-sm">
                Total estimado <span className="tabular ml-2 text-base font-semibold">{fmtMoeda(total)}</span>
              </span>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
