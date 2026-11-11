import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  ExternalLink,
  History,
  Link2,
  MapPin,
  ImagePlus,
  LineChart,
  Pencil,
  Plus,
  Scale,
  Star,
  Store,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { useAcoes, useInvalidar } from "../components/acoes";
import { useAuth } from "../components/auth";
import { BotaoComprar } from "../components/BotaoComprar";
import { CabecalhoPagina } from "../components/Layout";
import { Badge, Botao, Campo, Card, CardHeader, cn, Confirmar, Esqueleto, Input, MedidorEstoque, Modal, Select, StatusBadge, Switch, Vazio } from "../components/ui";
import { api, type Movimentacao, type ProdutoDetalhe as Produto, type Vinculo } from "../lib/api";
import { reduzirImagem } from "../lib/imagem";
import { EtiquetaCategoria, IconeCategoria } from "../lib/categorias";
import { fmtDataHora, fmtDiaMes, fmtMoeda, fmtNum } from "../lib/format";
import { LinhaMov } from "./Dashboard";

export function ProdutoDetalhe() {
  const id = Number(useParams().id);
  const acoes = useAcoes();
  const { admin } = useAuth();
  const invalidar = useInvalidar();
  const navegar = useNavigate();
  const [confirmar, setConfirmar] = useState<"arquivar" | "excluir" | null>(null);
  const [vinculo, setVinculo] = useState<Vinculo | "novo" | null>(null);

  const produto = useQuery({ queryKey: ["produto", id], queryFn: () => api.produto(id) });
  const historico = useQuery({ queryKey: ["movimentacoes", { produto_id: id }], queryFn: () => api.movimentacoes({ produto_id: id, limite: 300 }) });

  const arquivar = useMutation({
    mutationFn: () => api.arquivarProduto(id),
    onSuccess: () => {
      toast.success("Produto arquivado", { description: "Ele saiu das listas, mas o histórico foi mantido." });
      invalidar();
      setConfirmar(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const excluir = useMutation({
    mutationFn: () => api.excluirProduto(id),
    onSuccess: () => {
      toast.success("Produto excluído definitivamente");
      invalidar();
      navegar("/produtos?arquivados=1");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const restaurar = useMutation({
    mutationFn: () => api.restaurarProduto(id),
    onSuccess: () => {
      toast.success("Produto restaurado");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });


  if (produto.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Esqueleto className="h-16 w-80" />
        <div className="grid gap-4 xl:grid-cols-3 [&>*]:min-w-0">
          <Esqueleto className="h-96 rounded-xl xl:col-span-2" />
          <Esqueleto className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }
  if (!produto.data) {
    return (
      <Card>
        <Vazio icone={<Store />} titulo="Produto não encontrado" acao={<Link to="/produtos" className="text-sm text-primary hover:underline">Voltar para produtos</Link>} />
      </Card>
    );
  }

  const p = produto.data;
  return (
    <>
      <CabecalhoPagina
        antes={
          <Link to="/produtos" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
            <ArrowLeft className="size-4" /> Produtos
          </Link>
        }
        titulo={
          <span className="flex flex-wrap items-center gap-3">
            <IconeCategoria categoria={p.categoria} />
            {p.nome}
            {p.arquivado ? <Badge>Arquivado</Badge> : <StatusBadge status={p.status} />}
          </span>
        }
        descricao={<EtiquetaCategoria categoria={p.categoria} className="text-sm" />}
        acoes={
          p.arquivado ? (
            admin && (
              <>
                <Botao variante="danger" onClick={() => setConfirmar("excluir")}>
                  <Trash2 /> Excluir de vez
                </Botao>
                <Botao variante="primary" onClick={() => restaurar.mutate()} carregando={restaurar.isPending}>
                  <ArchiveRestore /> Restaurar
                </Botao>
              </>
            )
          ) : (
            <>
              {admin && (
                <>
                  <Botao variante="ghost" tamanho="icon" title="Arquivar" aria-label="Arquivar produto" onClick={() => setConfirmar("arquivar")}>
                    <Archive />
                  </Botao>
                  <Botao variante="ghost" onClick={() => acoes.editarProduto(p)}>
                    <Pencil /> Editar
                  </Botao>
                  <Botao onClick={() => acoes.movimentar({ produto: p, tipo: "ajuste" })}>
                    <Scale /> Corrigir contagem
                  </Botao>
                </>
              )}
              <BotaoComprar produto={p} />
              <Botao onClick={() => acoes.movimentar({ produto: p, tipo: "entrada" })}>
                <ArrowDownToLine /> Entrada
              </Botao>
              <Botao variante="primary" disabled={p.quantidade <= 0} onClick={() => acoes.movimentar({ produto: p, tipo: "retirada" })}>
                <ArrowUpFromLine /> Retirar
              </Botao>
            </>
          )
        }
      />

      <div className="grid gap-4 xl:grid-cols-3 [&>*]:min-w-0">
        <div className="flex flex-col gap-4 xl:order-2">
          <FotoProduto produto={p} admin={admin} />
          <Card className="relative overflow-hidden p-5">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full blur-3xl"
              style={{
                background: `radial-gradient(closest-side, var(--${p.status === "ok" ? "ok" : p.status === "baixo" ? "warn" : "danger"}-soft), transparent)`,
              }}
            />
            <p className="text-[13px] font-medium text-muted">Saldo atual</p>
            <p className="tabular mt-2 text-5xl font-semibold tracking-tight">
              {fmtNum(p.quantidade)}
              <span className="ml-2 text-lg font-normal text-subtle">{p.unidade}</span>
            </p>
            <MedidorEstoque quantidade={p.quantidade} minimo={p.estoque_minimo} status={p.status} className="mt-5 h-2" />
            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm">
              <div>
                <dt className="text-xs text-subtle">Estoque mínimo</dt>
                <dd className="tabular mt-0.5">{p.estoque_minimo > 0 ? `${fmtNum(p.estoque_minimo)} ${p.unidade}` : "Não definido"}</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Menor preço</dt>
                <dd className="tabular mt-0.5">{p.menor_preco != null ? fmtMoeda(p.menor_preco) : "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-subtle">Localização</dt>
                <dd className="mt-0.5 flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-subtle" />
                  {p.localizacao ?? "Não definida"}
                </dd>
              </div>
              {p.descricao && (
                <div className="col-span-2">
                  <dt className="text-xs text-subtle">Descrição / uso</dt>
                  <dd className="mt-0.5 whitespace-pre-line text-muted">{p.descricao}</dd>
                </div>
              )}
            </dl>
          </Card>

          <Card>
            <CardHeader
              titulo="Fornecedores"
              descricao="Onde comprar este item"
              icone={<Store />}
              acao={
                admin &&
                !p.arquivado && (
                  <Botao tamanho="sm" variante="ghost" onClick={() => setVinculo("novo")}>
                    <Plus /> Adicionar
                  </Botao>
                )
              }
            />
            {p.fornecedores.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-muted">Nenhum fornecedor vinculado.</p>
            ) : (
              <ul className="divide-y divide-line">
                {p.fornecedores.map((f) => (
                  <li key={f.id} className="group flex items-center gap-3 px-5 py-3">
                    <Star className={cn("size-4 shrink-0", f.preferido ? "fill-warn text-warn" : "text-line-strong")} aria-label={f.preferido ? "Preferido" : undefined} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{f.fornecedor_nome}</p>
                      {f.url ? (
                        <a href={f.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          Ver na loja <ExternalLink className="size-3" />
                        </a>
                      ) : (
                        <p className="text-xs text-subtle">Sem link</p>
                      )}
                    </div>
                    <span className="tabular text-sm">{f.preco != null ? fmtMoeda(f.preco) : <span className="text-subtle">—</span>}</span>
                    {admin && !p.arquivado && (
                      <Botao tamanho="icon" variante="ghost" aria-label={`Editar ${f.fornecedor_nome}`} onClick={() => setVinculo(f)} className="opacity-60 group-hover:opacity-100">
                        <Pencil />
                      </Botao>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

        </div>

        <div className="flex flex-col gap-4 xl:order-1 xl:col-span-2">
        {historico.data && historico.data.length >= 2 && <GraficoSaldo movs={historico.data} produto={p} />}
        <Card>
          <CardHeader titulo="Histórico" descricao="Todas as entradas, retiradas e ajustes deste item" icone={<History />} />
          {historico.isLoading ? (
            <div className="flex flex-col gap-3 p-5">
              {[0, 1, 2].map((i) => (
                <Esqueleto key={i} className="h-10" />
              ))}
            </div>
          ) : historico.data?.length ? (
            <ul className="divide-y divide-line">
              {historico.data.map((m) => (
                <LinhaMov key={m.id} m={m} comProduto={false} />
              ))}
            </ul>
          ) : (
            <Vazio icone={<History />} titulo="Sem movimentações ainda" />
          )}
        </Card>
        </div>
      </div>

      {confirmar === "arquivar" && (
        <Confirmar
          titulo="Arquivar produto?"
          texto={
            <>
              <strong className="text-fg">{p.nome}</strong> vai sair das listas e não poderá ser movimentado. O histórico continua salvo e você pode
              restaurar quando quiser.
            </>
          }
          rotulo="Arquivar"
          carregando={arquivar.isPending}
          aoConfirmar={() => arquivar.mutate()}
          aoFechar={() => setConfirmar(null)}
        />
      )}
      {confirmar === "excluir" && (
        <Confirmar
          perigo
          titulo="Excluir definitivamente?"
          texto={
            <>
              <strong className="text-fg">{p.nome}</strong> e <strong className="text-fg">todo o histórico de retiradas</strong> dele serão apagados. Isso
              não pode ser desfeito.
            </>
          }
          rotulo="Excluir para sempre"
          carregando={excluir.isPending}
          aoConfirmar={() => excluir.mutate()}
          aoFechar={() => setConfirmar(null)}
        />
      )}
      {vinculo && <VinculoModal produto={p} vinculo={vinculo === "novo" ? undefined : vinculo} aoFechar={() => setVinculo(null)} />}
    </>
  );
}

function VinculoModal({ produto, vinculo, aoFechar }: { produto: Produto; vinculo?: Vinculo; aoFechar: () => void }) {
  const invalidar = useInvalidar();
  const fornecedores = useQuery({ queryKey: ["fornecedores"], queryFn: api.fornecedores });
  const [fornecedorId, setFornecedorId] = useState<number | null>(vinculo?.fornecedor_id ?? null);
  const [url, setUrl] = useState(vinculo?.url ?? "");
  const [preco, setPreco] = useState(vinculo?.preco != null ? String(vinculo.preco).replace(".", ",") : "");
  const [preferido, setPreferido] = useState(vinculo?.preferido ?? produto.fornecedores.length === 0);

  const usados = new Set(produto.fornecedores.map((f) => f.fornecedor_id));
  const opcoes = (fornecedores.data ?? []).filter((f) => !usados.has(f.id) || f.id === vinculo?.fornecedor_id);
  // Aceita "1.234,56" (padrão brasileiro) e "1234.56"
  const precoNum = preco.trim() ? Number(preco.includes(",") ? preco.replace(/\./g, "").replace(",", ".") : preco) : null;
  const precoInvalido = precoNum !== null && (!Number.isFinite(precoNum) || precoNum < 0);

  const salvar = useMutation({
    mutationFn: () => {
      const d = { fornecedor_id: fornecedorId!, url: url || null, preco: precoNum, preferido };
      return vinculo ? api.atualizarVinculo(produto.id, vinculo.id, d) : api.vincular(produto.id, d);
    },
    onSuccess: () => {
      toast.success(vinculo ? "Fornecedor atualizado" : "Fornecedor vinculado");
      invalidar();
      aoFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remover = useMutation({
    mutationFn: () => api.desvincular(produto.id, vinculo!.id),
    onSuccess: () => {
      toast.success("Fornecedor removido deste produto");
      invalidar();
      aoFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={vinculo ? "Editar fornecedor" : "Adicionar fornecedor"}
      descricao={produto.nome}
      icone={<Link2 />}
      rodape={
        <>
          {vinculo && (
            <Botao variante="ghost" className="mr-auto text-danger hover:text-danger" onClick={() => remover.mutate()} carregando={remover.isPending}>
              <Trash2 /> Remover
            </Botao>
          )}
          <Botao variante="ghost" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primary" type="submit" form="form-vinculo" disabled={!fornecedorId || precoInvalido} carregando={salvar.isPending}>
            Salvar
          </Botao>
        </>
      }
    >
      <form
        id="form-vinculo"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (fornecedorId && !precoInvalido) salvar.mutate();
        }}
      >
        <Campo
          rotulo="Fornecedor"
          obrigatorio
          dica={
            fornecedores.data && opcoes.length === 0 ? (
              <>
                Nenhum fornecedor disponível.{" "}
                <Link to="/fornecedores" className="text-primary hover:underline" onClick={aoFechar}>
                  Cadastrar fornecedor
                </Link>
              </>
            ) : undefined
          }
        >
          {(id) => (
            <Select id={id} value={fornecedorId ?? ""} onChange={(e) => setFornecedorId(e.target.value ? Number(e.target.value) : null)} disabled={!!vinculo} autoFocus>
              <option value="">Selecione…</option>
              {opcoes.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Select>
          )}
        </Campo>
        <Campo rotulo="Link do produto na loja">
          {(id) => <Input id={id} type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" maxLength={500} />}
        </Campo>
        <Campo rotulo="Preço (R$)" dica="Último preço que vocês viram nessa loja." erro={precoInvalido ? "Preço inválido" : undefined}>
          {(id) => <Input id={id} inputMode="decimal" className="tabular" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="0,00" />}
        </Campo>
        <Switch checked={preferido} onChange={setPreferido} rotulo="Fornecedor preferido" descricao="É de onde vocês costumam comprar este item." />
      </form>
    </Modal>
  );
}

function FotoProduto({ produto, admin }: { produto: Produto; admin: boolean }) {
  const invalidar = useInvalidar();
  const input = useRef<HTMLInputElement>(null);
  const enviar = useMutation({
    mutationFn: async (arquivo: File) => api.enviarFoto(produto.id, await reduzirImagem(arquivo)),
    onSuccess: () => {
      toast.success("Foto atualizada");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remover = useMutation({
    mutationFn: () => api.removerFoto(produto.id),
    onSuccess: () => {
      toast.success("Foto removida");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!produto.foto_url && !admin) return null;

  const seletor = (
    <input
      ref={input}
      type="file"
      accept="image/*"
      capture="environment"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) enviar.mutate(f);
        e.target.value = "";
      }}
    />
  );

  if (!produto.foto_url) {
    return (
      <button
        onClick={() => input.current?.click()}
        disabled={enviar.isPending}
        className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface/50 px-4 py-6 text-sm text-muted transition-colors hover:border-primary/50 hover:text-fg"
      >
        {seletor}
        <ImagePlus className={cn("size-5", enviar.isPending && "animate-pulse")} />
        {enviar.isPending ? "Enviando…" : "Adicionar foto"}
        <span className="text-xs text-subtle">Ajuda quem não sabe o nome técnico do item</span>
      </button>
    );
  }

  return (
    <Card className="group relative overflow-hidden">
      {seletor}
      <img src={produto.foto_url} alt={produto.nome} className="aspect-[4/3] w-full bg-surface-2 object-cover" />
      {admin && (
        <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 bg-gradient-to-t from-black/70 to-transparent p-3 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
          <Botao tamanho="sm" onClick={() => remover.mutate()} carregando={remover.isPending} className="bg-black/50 text-white border-white/20">
            <Trash2 /> Remover
          </Botao>
          <Botao tamanho="sm" onClick={() => input.current?.click()} carregando={enviar.isPending} className="bg-black/50 text-white border-white/20">
            <ImagePlus /> Trocar
          </Botao>
        </div>
      )}
    </Card>
  );
}

function GraficoSaldo({ movs, produto }: { movs: Movimentacao[]; produto: Produto }) {
  // Histórico vem do mais novo para o mais antigo; o gráfico precisa da ordem do tempo
  const pontos = [...movs]
    .reverse()
    .map((m) => ({ t: new Date(m.criado_em).getTime(), saldo: m.saldo_apos }))
    .concat({ t: Date.now(), saldo: produto.quantidade });
  const max = Math.max(produto.estoque_minimo, ...pontos.map((x) => x.saldo));

  return (
    <Card>
      <CardHeader titulo="Saldo ao longo do tempo" descricao="Cada degrau é uma entrada, retirada ou correção" icone={<LineChart />} />
      <div className="h-52 px-2 pt-4 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={pontos} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="g-saldo" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(t: number) => fmtDiaMes(t)}
              tick={{ fill: "var(--subtle)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={32}
            />
            <YAxis domain={[0, Math.ceil(max * 1.15) || 1]} allowDecimals={false} tick={{ fill: "var(--subtle)", fontSize: 11 }} axisLine={false} tickLine={false} />
            {produto.estoque_minimo > 0 && (
              <ReferenceLine
                y={produto.estoque_minimo}
                stroke="var(--warn)"
                strokeDasharray="4 4"
                label={{ value: "mínimo", position: "insideTopRight", fill: "var(--warn)", fontSize: 11 }}
              />
            )}
            <Tooltip
              cursor={{ stroke: "var(--border-strong)" }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-xs shadow-xl">
                    <p className="text-muted">{fmtDataHora(new Date(payload[0]!.payload.t).toISOString())}</p>
                    <p className="tabular mt-0.5 font-medium">
                      {fmtNum(payload[0]!.payload.saldo)} {produto.unidade}
                    </p>
                  </div>
                ) : null
              }
            />
            <Area type="stepAfter" dataKey="saldo" stroke="var(--primary)" strokeWidth={2} fill="url(#g-saldo)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
