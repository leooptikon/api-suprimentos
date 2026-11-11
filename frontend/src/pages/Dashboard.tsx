import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CircleSlash, Coins, Package, PackagePlus, Scale, TrendingUp, Undo2 } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAcoes } from "../components/acoes";
import { useAuth } from "../components/auth";
import { BotaoComprar } from "../components/BotaoComprar";
import { CabecalhoPagina } from "../components/Layout";
import { PrimeirosPassos } from "../components/PrimeirosPassos";
import { Botao, Card, CardHeader, cn, Esqueleto, MedidorEstoque, StatusBadge, Vazio } from "../components/ui";
import { api, type Movimentacao } from "../lib/api";
import { IconeCategoria, MiniaturaProduto } from "../lib/categorias";
import { fmtDiaCurto, fmtMoeda, fmtNum, fmtRelativo } from "../lib/format";

function Kpi({
  rotulo,
  valor,
  detalhe,
  icone,
  tom = "primary",
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  icone: ReactNode;
  tom?: "primary" | "warn" | "danger" | "ok";
}) {
  const cores = {
    primary: "text-primary bg-primary-soft border-primary/20",
    warn: "text-warn bg-warn-soft border-warn/20",
    danger: "text-danger bg-danger-soft border-danger/20",
    ok: "text-ok bg-ok-soft border-ok/20",
  };
  return (
    <Card className="animate-in group relative overflow-hidden p-5 transition-colors hover:border-line-strong">
      <div className="flex items-start justify-between">
        <p className="text-[13px] font-medium text-muted">{rotulo}</p>
        <span className={cn("grid size-8 place-items-center rounded-lg border [&_svg]:size-4", cores[tom])}>{icone}</span>
      </div>
      <p className="tabular mt-3 text-[28px] leading-none font-semibold tracking-tight">{valor}</p>
      {detalhe && <p className="mt-2 text-xs text-subtle">{detalhe}</p>}
    </Card>
  );
}

const ICONE_MOV = {
  retirada: { icone: <ArrowUpFromLine />, cor: "text-primary bg-primary-soft" },
  entrada: { icone: <ArrowDownToLine />, cor: "text-ok bg-ok-soft" },
  ajuste: { icone: <Scale />, cor: "text-muted bg-surface-2" },
};

function verboMov(m: Movimentacao, comProduto: boolean) {
  // Sem o nome do produto depois, o "de" fica sobrando
  const de = comProduto ? " de" : "";
  if (m.estorno_de_id) return (m.tipo === "entrada" ? "desfez uma retirada" : "desfez uma entrada") + de;
  return m.tipo === "retirada" ? "retirou" : m.tipo === "entrada" ? "adicionou" : "corrigiu a contagem" + de;
}

export function LinhaMov({ m, comProduto = true }: { m: Movimentacao; comProduto?: boolean }) {
  const i = m.estorno_de_id ? { icone: <Undo2 />, cor: "text-muted bg-surface-2" } : ICONE_MOV[m.tipo];
  const sinal = m.quantidade > 0 ? "+" : "";
  const quem = m.estorno_de_id ? m.registrado_por_nome : m.pessoa_nome;
  return (
    <li className={cn("flex items-center gap-3 px-5 py-3", m.estornada && "opacity-60")}>
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4", i.cor)}>{i.icone}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {quem ? <span className="font-medium">{quem}</span> : <span className="text-muted">Alguém</span>}
          <span className="text-muted"> {verboMov(m, comProduto)} </span>
          {comProduto && (
            <Link to={`/produtos/${m.produto_id}`} className="font-medium hover:text-primary">
              {m.produto_nome}
            </Link>
          )}
        </p>
        <p className="truncate text-xs text-subtle">
          {m.estornada && <span className="mr-1.5 rounded bg-surface-2 px-1 py-px text-[10px] font-medium text-muted uppercase">Desfeita</span>}
          {fmtRelativo(m.criado_em)}
          {m.motivo && !m.estorno_de_id && <> · {m.motivo}</>}
          {!m.estorno_de_id && m.registrado_por_nome && m.registrado_por_nome !== m.pessoa_nome && <> · anotado por {m.registrado_por_nome}</>}
        </p>
      </div>
      <span className={cn("tabular text-sm font-medium", m.quantidade < 0 ? "text-fg" : "text-ok", m.estornada && "line-through")}>
        {sinal}
        {fmtNum(m.quantidade)} <span className="text-xs font-normal text-subtle">{m.produto_unidade}</span>
      </span>
    </li>
  );
}

function TooltipGrafico({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const v = Object.fromEntries(payload.map((p) => [p.dataKey, p.value]));
  return (
    <div className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-xs shadow-xl">
      <p className="mb-1.5 font-medium">{label && fmtDiaCurto(label)}</p>
      <p className="flex items-center gap-2 text-muted">
        <span className="size-2 rounded-full bg-primary" /> Retiradas <span className="tabular ml-auto pl-4 text-fg">{v.retiradas ?? 0}</span>
      </p>
      <p className="flex items-center gap-2 text-muted">
        <span className="size-2 rounded-full bg-ok" /> Entradas <span className="tabular ml-auto pl-4 text-fg">{v.entradas ?? 0}</span>
      </p>
    </div>
  );
}

export function Dashboard() {
  const acoes = useAcoes();
  const { admin, usuario } = useAuth();
  const { data: d, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard, refetchInterval: 60_000 });

  if (isLoading || !d) {
    return (
      <>
        <CabecalhoPagina titulo="Visão geral" descricao="Carregando…" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Esqueleto key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <Esqueleto className="mt-4 h-80 rounded-xl" />
      </>
    );
  }

  const maxRanking = Math.max(1, ...d.mais_retirados.map((r) => r.retiradas));
  const semPreco = d.total_produtos - d.itens_com_preco;
  const semDados = d.total_produtos === 0;

  return (
    <>
      <CabecalhoPagina
        titulo={`Olá, ${usuario.nome.split(" ")[0]}`}
        descricao="Como está o estoque do escritório agora."
        acoes={
          admin && (
            <Botao onClick={() => acoes.editarProduto()}>
              <PackagePlus /> Novo produto
            </Botao>
          )
        }
      />

      <PrimeirosPassos totalProdutos={d.total_produtos} />

      {semDados ? (
        <Card>
          <Vazio
            icone={<Package />}
            titulo="Nenhum produto cadastrado ainda"
            texto={
              admin
                ? "Comece cadastrando os itens que vocês têm no escritório. Depois é só registrar quem retira o quê."
                : "Peça para um administrador cadastrar os itens do escritório."
            }
            acao={
              admin && <Botao variante="primary" onClick={() => acoes.editarProduto()}>
                <PackagePlus /> Cadastrar primeiro produto
              </Botao>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi rotulo="Itens cadastrados" valor={fmtNum(d.total_produtos)} detalhe={`Em ${d.total_categorias} ${d.total_categorias === 1 ? "categoria" : "categorias"}`} icone={<Package />} />
            <Kpi
              rotulo="Estoque baixo"
              valor={fmtNum(d.abaixo_minimo)}
              detalhe={d.abaixo_minimo ? "No mínimo ou abaixo dele" : "Tudo acima do mínimo"}
              icone={<AlertTriangle />}
              tom="warn"
            />
            <Kpi rotulo="Esgotados" valor={fmtNum(d.esgotados)} detalhe={d.esgotados ? "Precisam de reposição" : "Nenhum item zerado"} icone={<CircleSlash />} tom="danger" />
            <Kpi
              rotulo="Valor estimado"
              valor={<span className="text-[24px]">{fmtMoeda(d.valor_estimado)}</span>}
              detalhe={
                semPreco > 0 ? (
                  <span className="text-warn">
                    {d.itens_com_preco} de {d.total_produtos} itens com preço cadastrado
                  </span>
                ) : (
                  "Pelo menor preço de cada item"
                )
              }
              icone={<Coins />}
              tom="ok"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3 [&>*]:min-w-0">
            <Card className="xl:col-span-2">
              <CardHeader
                titulo="Movimentação nos últimos 14 dias"
                descricao={`Quantas retiradas e entradas foram anotadas por dia · ${d.retiradas_7d} retiradas nos últimos 7 dias`}
                icone={<TrendingUp />}
                acao={
                  <div className="flex gap-3 text-xs text-muted">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-primary" />
                      Retiradas
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-ok" />
                      Entradas
                    </span>
                  </div>
                }
              />
              <div className="h-72 px-2 pt-4 pb-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={d.serie_14d} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="g-ret" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="g-ent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--ok)" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="var(--ok)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
                    <XAxis dataKey="dia" tickFormatter={fmtDiaCurto} tick={{ fill: "var(--subtle)", fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
                    <YAxis allowDecimals={false} tick={{ fill: "var(--subtle)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<TooltipGrafico />} cursor={{ stroke: "var(--border-strong)" }} />
                    <Area type="monotone" dataKey="entradas" stroke="var(--ok)" strokeWidth={1.5} fill="url(#g-ent)" />
                    <Area type="monotone" dataKey="retiradas" stroke="var(--primary)" strokeWidth={2} fill="url(#g-ret)" activeDot={{ r: 4, strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <CardHeader
                titulo="Precisa de atenção"
                descricao="Itens esgotados ou no mínimo"
                icone={<AlertTriangle />}
                acao={
                  d.alertas.length > 0 && (
                    <Link to="/compras" className="text-xs font-medium text-primary hover:underline">
                      Lista de compras
                    </Link>
                  )
                }
              />
              {d.alertas.length === 0 ? (
                <Vazio icone={<Package />} titulo="Tudo em ordem" texto="Nenhum item abaixo do estoque mínimo." />
              ) : (
                <ul className="divide-y divide-line">
                  {d.alertas.map((p) => (
                    <li key={p.id} className="group flex items-center gap-3 px-5 py-3">
                      <MiniaturaProduto produto={p} tamanho="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <Link to={`/produtos/${p.id}`} className="truncate text-sm font-medium hover:text-primary">
                            {p.nome}
                          </Link>
                          <StatusBadge status={p.status} />
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <MedidorEstoque quantidade={p.quantidade} minimo={p.estoque_minimo} status={p.status} />
                          <span className="tabular shrink-0 text-xs text-muted">
                            {fmtNum(p.quantidade)}/{fmtNum(p.estoque_minimo)}
                          </span>
                        </div>
                      </div>
                      <BotaoComprar produto={p} compacto />
                      <Botao
                        tamanho="icon"
                        variante="ghost"
                        title="Registrar entrada"
                        aria-label={`Registrar entrada de ${p.nome}`}
                        onClick={() => acoes.movimentar({ produto: p, tipo: "entrada" })}
                      >
                        <ArrowDownToLine />
                      </Botao>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3 [&>*]:min-w-0">
            <Card className="xl:col-span-2">
              <CardHeader
                titulo="Últimas movimentações"
                acao={
                  <Link to="/movimentacoes" className="text-xs font-medium text-primary hover:underline">
                    Ver todas
                  </Link>
                }
              />
              {d.ultimas.length === 0 ? (
                <Vazio icone={<ArrowUpFromLine />} titulo="Nenhuma movimentação ainda" />
              ) : (
                <ul className="divide-y divide-line">
                  {d.ultimas.map((m) => (
                    <LinhaMov key={m.id} m={m} />
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader titulo="Mais retirados" descricao="Número de retiradas nos últimos 14 dias" />
              {d.mais_retirados.length === 0 ? (
                <Vazio icone={<TrendingUp />} titulo="Sem retiradas no período" />
              ) : (
                <ol className="flex flex-col gap-4 p-5">
                  {d.mais_retirados.map((r) => (
                    <li key={r.produto_id} className="flex items-center gap-3">
                      <IconeCategoria categoria={r.categoria} tamanho="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                          <Link to={`/produtos/${r.produto_id}`} className="truncate hover:text-primary">
                            {r.nome}
                          </Link>
                          <span className="shrink-0 text-xs text-muted">
                            <span className="tabular text-fg">{r.retiradas}</span> {r.retiradas === 1 ? "vez" : "vezes"} ·{" "}
                            <span className="tabular">{fmtNum(r.quantidade)}</span> {r.unidade}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-primary-strong to-primary"
                            style={{ width: `${(r.retiradas / maxRanking) * 100}%` }}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
