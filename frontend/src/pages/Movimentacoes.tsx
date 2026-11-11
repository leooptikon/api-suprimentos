import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Download, Scale, Undo2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { CabecalhoPagina } from "../components/Layout";
import { Avatar, Badge, Botao, Card, cn, Esqueleto, Input, Select, Vazio } from "../components/ui";
import { api, type TipoMov } from "../lib/api";
import { chaveDia, fmtDataHora, fmtHora, fmtNum, rotuloDia } from "../lib/format";

const TIPOS: { valor: TipoMov | ""; rotulo: string }[] = [
  { valor: "", rotulo: "Todas" },
  { valor: "retirada", rotulo: "Retiradas" },
  { valor: "entrada", rotulo: "Entradas" },
  { valor: "ajuste", rotulo: "Correções" },
];

const BADGE = {
  retirada: { tom: "primary" as const, icone: <ArrowUpFromLine className="size-3" />, rotulo: "Retirada" },
  entrada: { tom: "ok" as const, icone: <ArrowDownToLine className="size-3" />, rotulo: "Entrada" },
  ajuste: { tom: "neutro" as const, icone: <Scale className="size-3" />, rotulo: "Correção" },
};

export function Movimentacoes() {
  const [tipo, setTipo] = useState<TipoMov | "">("");
  const [pessoaId, setPessoaId] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const filtros = { tipo: tipo || undefined, pessoa_id: pessoaId ? Number(pessoaId) : undefined, de: de || undefined, ate: ate || undefined, limite: 500 };
  const movs = useQuery({ queryKey: ["movimentacoes", filtros], queryFn: () => api.movimentacoes(filtros), placeholderData: (a) => a });
  const pessoas = useQuery({ queryKey: ["pessoas", "todas"], queryFn: () => api.pessoas(true) });

  const lista = movs.data ?? [];
  // Já vem do mais novo para o mais antigo; agrupa dias consecutivos
  const grupos: { chave: string; rotulo: string; itens: typeof lista }[] = [];
  for (const m of lista) {
    const chave = chaveDia(m.criado_em);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo?.chave === chave) ultimo.itens.push(m);
    else grupos.push({ chave, rotulo: rotuloDia(m.criado_em), itens: [m] });
  }
  const filtrando = !!(tipo || pessoaId || de || ate);

  return (
    <>
      <CabecalhoPagina
        titulo="Movimentações"
        descricao="Quem retirou o quê, quanto e quando."
        acoes={
          <a href={api.exportarUrl("movimentacoes", { de: de || undefined, ate: ate || undefined })} download>
            <Botao tabIndex={-1}>
              <Download /> Exportar Excel
            </Botao>
          </a>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 xl:flex-row xl:items-center">
          <div role="radiogroup" aria-label="Tipo" className="flex gap-1 overflow-x-auto rounded-lg border border-line bg-bg/50 p-1">
            {TIPOS.map((t) => (
              <button
                key={t.valor}
                role="radio"
                aria-checked={tipo === t.valor}
                onClick={() => setTipo(t.valor)}
                className={cn(
                  "h-7 rounded-md px-2.5 text-[13px] whitespace-nowrap transition-colors",
                  tipo === t.valor ? "bg-surface-2 font-medium text-fg shadow-sm" : "text-muted hover:text-fg",
                )}
              >
                {t.rotulo}
              </button>
            ))}
          </div>
          <Select value={pessoaId} onChange={(e) => setPessoaId(e.target.value)} className="xl:w-52" aria-label="Pessoa">
            <option value="">Todas as pessoas</option>
            {pessoas.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
          <div className="flex items-center gap-2">
            <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} aria-label="De" className="tabular w-full xl:w-40" max={ate || undefined} />
            <span className="text-sm text-subtle">até</span>
            <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Até" className="tabular w-full xl:w-40" min={de || undefined} />
          </div>
          {filtrando && (
            <Botao
              variante="ghost"
              tamanho="sm"
              className="xl:ml-auto"
              onClick={() => {
                setTipo("");
                setPessoaId("");
                setDe("");
                setAte("");
              }}
            >
              Limpar filtros
            </Botao>
          )}
        </div>

        {movs.isLoading ? (
          <div className="flex flex-col gap-3 p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <Esqueleto key={i} className="h-11" />
            ))}
          </div>
        ) : lista.length === 0 ? (
          <Vazio icone={<ArrowLeftRight />} titulo={filtrando ? "Nada encontrado com esses filtros" : "Nenhuma movimentação ainda"} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] tracking-wider text-subtle uppercase">
                  <th className="px-4 py-2.5 font-medium">Hora</th>
                  <th className="px-4 py-2.5 font-medium">Tipo</th>
                  <th className="px-4 py-2.5 font-medium">Produto</th>
                  <th className="px-4 py-2.5 text-right font-medium">Qtd.</th>
                  <th className="hidden px-4 py-2.5 text-right font-medium md:table-cell">Saldo após</th>
                  <th className="px-4 py-2.5 font-medium">Responsável</th>
                  <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Motivo</th>
                </tr>
              </thead>
              {grupos.map((g) => (
              <tbody key={g.chave} className="divide-y divide-line border-b border-line last:border-b-0">
                <tr className="bg-bg/50">
                  <th colSpan={7} scope="rowgroup" className="px-4 py-2 text-left">
                    <span className="text-[13px] font-semibold">{g.rotulo}</span>
                    <span className="ml-2 text-xs font-normal text-subtle">
                      {g.itens.length} {g.itens.length === 1 ? "lançamento" : "lançamentos"}
                    </span>
                  </th>
                </tr>
                {g.itens.map((m) => {
                  const b = m.estorno_de_id
                    ? { tom: "neutro" as const, icone: <Undo2 className="size-3" />, rotulo: "Desfazimento" }
                    : BADGE[m.tipo];
                  return (
                    <tr key={m.id} className={cn("transition-colors hover:bg-surface-2/40", m.estornada && "opacity-55")}>
                      <td className="tabular px-4 py-3 text-xs whitespace-nowrap text-muted" title={fmtDataHora(m.criado_em)}>
                        {fmtHora(m.criado_em)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <Badge tom={b.tom}>
                            {b.icone}
                            {b.rotulo}
                          </Badge>
                          {m.estornada && <Badge className="border-dashed">Desfeita</Badge>}
                        </span>
                      </td>
                      <td className="max-w-[260px] px-4 py-3">
                        <Link to={`/produtos/${m.produto_id}`} className="block truncate font-medium hover:text-primary">
                          {m.produto_nome}
                        </Link>
                      </td>
                      <td className={cn("tabular px-4 py-3 text-right whitespace-nowrap", m.quantidade > 0 && "text-ok", m.estornada && "line-through")}>
                        {m.quantidade > 0 ? "+" : ""}
                        {fmtNum(m.quantidade)} <span className="text-xs text-subtle">{m.produto_unidade}</span>
                      </td>
                      <td className="tabular hidden px-4 py-3 text-right text-muted md:table-cell">{fmtNum(m.saldo_apos)}</td>
                      <td className="px-4 py-3">
                        {m.pessoa_nome ? (
                          <span className="flex items-center gap-2">
                            <Avatar nome={m.pessoa_nome} className="size-6 text-[10px]" />
                            <span className="min-w-0">
                              <span className="block truncate">{m.pessoa_nome}</span>
                              {m.registrado_por_nome && m.registrado_por_nome !== m.pessoa_nome && (
                                <span className="block truncate text-xs text-subtle">anotado por {m.registrado_por_nome}</span>
                              )}
                            </span>
                          </span>
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </td>
                      <td className="hidden max-w-[240px] truncate px-4 py-3 text-muted lg:table-cell">{m.motivo ?? <span className="text-subtle">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
              ))}
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
