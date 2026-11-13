import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Factory, Lightbulb, Milestone, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useInvalidar } from "../components/acoes";
import { useAuth } from "../components/auth";
import { IconeProprio, temIcone } from "../components/IconeProprio";
import { CabecalhoPagina } from "../components/Layout";
import { Badge, Botao, Campo, Card, CardHeader, cn, Confirmar, Esqueleto, Input, Modal, Select, Textarea, Vazio } from "../components/ui";
import {
  api,
  type AreaMelhoria,
  type EvolucaoDetalhe,
  type Melhoria,
  type MelhoriaForm,
  type OrigemMelhoria,
  type StatusMelhoria,
  type Versao,
  type VersaoForm,
} from "../lib/api";
import { fmtRelativo } from "../lib/format";

const ORIGENS: Record<OrigemMelhoria, string> = {
  montagem: "Montagem",
  campo: "Campo / cliente",
  manutencao: "Manutenção",
  custo: "Custo",
  outro: "Outro",
};
const AREAS: Record<AreaMelhoria, string> = {
  estrutura: "Estrutura",
  eletrica: "Elétrica",
  cabos: "Cabos",
  software: "Software",
  fornecedor: "Fornecedor / peça",
  outro: "Outro",
};
const STATUS: Record<StatusMelhoria, { rotulo: string; tom: "ai" | "warn" | "ok" | "neutro" }> = {
  ideia: { rotulo: "Ideia", tom: "ai" },
  teste: { rotulo: "Em teste", tom: "warn" },
  aplicada: { rotulo: "Aplicada", tom: "ok" },
  descartada: { rotulo: "Descartada", tom: "neutro" },
};

const mesAno = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" });
const fmtDataVersao = (d: string) => mesAno.format(new Date(`${d}T12:00:00`)).replace(".", "").replace(" de ", "/");

function IconeTile({ prefixo, grande }: { prefixo: string; grande?: boolean }) {
  return temIcone(prefixo) ? (
    <span className={cn("grid shrink-0 place-items-center border border-line bg-surface-2", grande ? "size-14 rounded-2xl p-1.5" : "size-12 rounded-xl p-1")}>
      <IconeProprio prefixo={prefixo} />
    </span>
  ) : (
    <span className={cn("grid shrink-0 place-items-center border border-primary/25 bg-primary-soft text-primary", grande ? "size-14 rounded-2xl" : "size-12 rounded-xl")}>
      <Factory className={grande ? "size-6" : "size-5"} />
    </span>
  );
}

/* ---------- Página: todos os produtos ---------- */
export function Evolucao() {
  const lista = useQuery({ queryKey: ["evolucao"], queryFn: api.evolucao });
  return (
    <>
      <CabecalhoPagina titulo="Evolução" descricao="O que já melhorou de uma versão para a outra e o que ainda pode melhorar nos produtos próprios." />
      {lista.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Esqueleto key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : !lista.data?.length ? (
        <Card>
          <Vazio icone={<Milestone />} titulo="Nenhum produto próprio cadastrado" texto="Cadastre os produtos em Produtos próprios para anotar a evolução deles." />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lista.data.map((p) => (
            <Link key={p.proprio_id} to={`/evolucao/${p.proprio_id}`} className="group">
              <Card className="flex h-full flex-col p-5 transition-colors group-hover:border-line-strong">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold group-hover:text-primary">{p.nome}</p>
                    <p className="mt-0.5 text-xs text-muted">{p.tipo ?? "Sem tipo"}</p>
                  </div>
                  <IconeTile prefixo={p.prefixo} />
                </div>
                <div className="mt-5">
                  <p className="text-xs text-muted">Versão atual</p>
                  <p className={cn("mt-0.5", p.versao_atual ? "tabular text-2xl font-semibold" : "text-sm text-subtle")}>
                    {p.versao_atual ?? "Nenhuma registrada"}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <Badge tom={p.abertas ? "ai" : "neutro"}>
                    <Lightbulb className="size-3" /> {p.abertas} {p.abertas === 1 ? "ideia em aberto" : "ideias em aberto"}
                  </Badge>
                  <Badge tom={p.aplicadas ? "ok" : "neutro"}>
                    <Check className="size-3" /> {p.aplicadas} {p.aplicadas === 1 ? "aplicada" : "aplicadas"}
                  </Badge>
                </div>
                <p className="mt-auto pt-4 text-xs text-subtle">
                  {p.ultima_atividade ? `Última anotação ${fmtRelativo(p.ultima_atividade)}` : "Nada anotado ainda"}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------- Página: um produto ---------- */
type Filtro = "abertas" | "aplicada" | "descartada" | "todas";
const FILTROS: [Filtro, string][] = [
  ["abertas", "Em aberto"],
  ["aplicada", "Aplicadas"],
  ["descartada", "Descartadas"],
  ["todas", "Todas"],
];
const passa = (m: Melhoria, f: Filtro) => (f === "todas" ? true : f === "abertas" ? m.status === "ideia" || m.status === "teste" : m.status === f);

export function EvolucaoDetalhePagina() {
  const { id } = useParams();
  const proprioId = Number(id);
  const { admin } = useAuth();
  const dados = useQuery({ queryKey: ["evolucao", proprioId], queryFn: () => api.evolucaoDe(proprioId) });
  const [filtro, setFiltro] = useState<Filtro>("abertas");
  const [anotar, setAnotar] = useState<Melhoria | "nova" | null>(null);
  const [versao, setVersao] = useState<Versao | "nova" | null>(null);
  const [status, setStatus] = useState<Melhoria | null>(null);
  const [apagar, setApagar] = useState<Melhoria | null>(null);
  const [apagarVersao, setApagarVersao] = useState<Versao | null>(null);
  const invalidar = useInvalidar();

  const removerMelhoria = useMutation({
    mutationFn: (mid: number) => api.apagarMelhoria(mid),
    onSuccess: () => {
      toast.success("Anotação apagada");
      invalidar();
      setApagar(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const removerVersao = useMutation({
    mutationFn: (vid: number) => api.apagarVersao(vid),
    onSuccess: () => {
      toast.success("Versão apagada");
      invalidar();
      setApagarVersao(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (dados.isLoading) return <Esqueleto className="h-96 rounded-xl" />;
  const p = dados.data;
  if (!p) return <Vazio icone={<Milestone />} titulo="Produto não encontrado" />;

  const visiveis = p.melhorias.filter((m) => passa(m, filtro));

  return (
    <>
      <CabecalhoPagina
        antes={
          <Link to="/evolucao" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
            <ArrowLeft className="size-4" /> Evolução
          </Link>
        }
        titulo={
          <span className="flex items-center gap-3">
            <IconeTile prefixo={p.prefixo} grande />
            {p.nome}
          </span>
        }
        descricao={
          <>
            {p.versao_atual ? (
              <>
                Versão atual <strong className="tabular font-medium text-fg">{p.versao_atual}</strong>
              </>
            ) : (
              "Nenhuma versão registrada"
            )}{" "}
            · {p.abertas} {p.abertas === 1 ? "ideia em aberto" : "ideias em aberto"}
          </>
        }
        acoes={
          <>
            {admin && (
              <Botao onClick={() => setVersao("nova")}>
                <Milestone /> Nova versão
              </Botao>
            )}
            <Botao variante="primary" onClick={() => setAnotar("nova")}>
              <Plus /> Anotar ideia
            </Botao>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader titulo="Ideias e problemas" descricao="O que pode melhorar nas próximas versões" icone={<Lightbulb />} />
          <div className="flex flex-wrap gap-1.5 border-b border-line px-5 py-3" role="group" aria-label="Filtrar anotações">
            {FILTROS.map(([f, rotulo]) => {
              const total = p.melhorias.filter((m) => passa(m, f)).length;
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filtro === f}
                  onClick={() => setFiltro(f)}
                  className={cn(
                    "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[13px] transition-colors",
                    filtro === f ? "border-primary/40 bg-primary-soft text-primary" : "border-line bg-surface text-muted hover:border-line-strong hover:text-fg",
                  )}
                >
                  {rotulo} <span className="tabular text-xs opacity-70">{total}</span>
                </button>
              );
            })}
          </div>
          {visiveis.length === 0 ? (
            <Vazio
              icone={<Lightbulb />}
              titulo={p.melhorias.length ? "Nada neste filtro" : "Nenhuma ideia anotada ainda"}
              texto={p.melhorias.length ? undefined : "Anote o que pode melhorar: um problema visto no campo, algo difícil na montagem, uma peça mais barata…"}
              acao={
                !p.melhorias.length && (
                  <Botao variante="primary" onClick={() => setAnotar("nova")}>
                    <Plus /> Anotar ideia
                  </Botao>
                )
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {visiveis.map((m) => (
                <ItemMelhoria
                  key={m.id}
                  m={m}
                  aoEditar={() => setAnotar(m)}
                  aoStatus={() => setStatus(m)}
                  aoApagar={() => setApagar(m)}
                />
              ))}
            </ul>
          )}
        </Card>

        <Card className="min-w-0 self-start">
          <CardHeader titulo="Versões" descricao="O que mudou em cada uma" icone={<Milestone />} />
          {p.versoes.length === 0 ? (
            <Vazio
              icone={<Milestone />}
              titulo="Nenhuma versão registrada"
              texto={admin ? "Registre a versão atual (ex.: v1) para começar a linha do tempo." : undefined}
              acao={
                admin && (
                  <Botao onClick={() => setVersao("nova")}>
                    <Plus /> Registrar versão
                  </Botao>
                )
              }
            />
          ) : (
            <ol className="relative px-5 py-4">
              {p.versoes.map((v, i) => (
                <li key={v.id} className="group relative pb-6 pl-6 last:pb-1">
                  {/* trilho da linha do tempo */}
                  {i < p.versoes.length - 1 && <span className="absolute top-3 bottom-0 left-[5px] w-px bg-line" />}
                  <span
                    className={cn(
                      "absolute top-1.5 left-0 size-[11px] rounded-full border-2",
                      i === 0 ? "border-primary bg-primary shadow-[0_0_10px_var(--primary)]" : "border-line-strong bg-surface",
                    )}
                  />
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="tabular font-semibold">{v.nome}</span>
                        {i === 0 && <Badge tom="primary">atual</Badge>}
                        {v.data && <span className="text-xs text-subtle">{fmtDataVersao(v.data)}</span>}
                      </p>
                      {v.resumo && <p className="mt-1 text-sm whitespace-pre-line text-muted">{v.resumo}</p>}
                    </div>
                    {admin && (
                      <div className="flex shrink-0 gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                        <Botao variante="ghost" tamanho="icon" aria-label={`Editar ${v.nome}`} onClick={() => setVersao(v)}>
                          <Pencil />
                        </Botao>
                        <Botao variante="ghost" tamanho="icon" aria-label={`Apagar ${v.nome}`} onClick={() => setApagarVersao(v)} className="hover:text-danger">
                          <Trash2 />
                        </Botao>
                      </div>
                    )}
                  </div>
                  {v.melhorias.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1">
                      {v.melhorias.map((m) => (
                        <li key={m.id} className="flex items-start gap-1.5 text-sm">
                          <Check className="mt-0.5 size-3.5 shrink-0 text-ok" />
                          {/* O que mudou ("como ficou"); sem ele, o título da ideia */}
                          <span title={m.decisao ? m.titulo : undefined}>{m.decisao ?? m.titulo}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {anotar && <MelhoriaModal proprioId={p.proprio_id} melhoria={anotar === "nova" ? undefined : anotar} aoFechar={() => setAnotar(null)} />}
      {versao && <VersaoModal proprioId={p.proprio_id} versao={versao === "nova" ? undefined : versao} aoFechar={() => setVersao(null)} />}
      {status && <StatusModal detalhe={p} melhoria={status} aoFechar={() => setStatus(null)} aoNovaVersao={() => setVersao("nova")} />}
      {apagar && (
        <Confirmar
          perigo
          titulo="Apagar anotação?"
          texto={
            <>
              <strong className="text-fg">{apagar.titulo}</strong> será apagada de vez. Se a ideia só não vai ser feita, prefira marcar como
              descartada (fica registrado o porquê).
            </>
          }
          rotulo="Apagar"
          carregando={removerMelhoria.isPending}
          aoConfirmar={() => removerMelhoria.mutate(apagar.id)}
          aoFechar={() => setApagar(null)}
        />
      )}
      {apagarVersao && (
        <Confirmar
          perigo
          titulo={`Apagar a versão ${apagarVersao.nome}?`}
          texto={
            apagarVersao.melhorias.length
              ? `As ${apagarVersao.melhorias.length} melhorias aplicadas nela não somem: voltam para "Em teste".`
              : "A versão sai da linha do tempo."
          }
          rotulo="Apagar"
          carregando={removerVersao.isPending}
          aoConfirmar={() => removerVersao.mutate(apagarVersao.id)}
          aoFechar={() => setApagarVersao(null)}
        />
      )}
    </>
  );
}

function ItemMelhoria({ m, aoEditar, aoStatus, aoApagar }: { m: Melhoria; aoEditar: () => void; aoStatus: () => void; aoApagar: () => void }) {
  const { admin, usuario } = useAuth();
  const dono = admin || m.autor_id === usuario.id;
  return (
    <li className="group px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tom={STATUS[m.status].tom}>
              {m.status === "aplicada" && m.versao_nome ? `Aplicada na ${m.versao_nome}` : STATUS[m.status].rotulo}
            </Badge>
            <Badge>{ORIGENS[m.origem]}</Badge>
            <Badge>{AREAS[m.area]}</Badge>
          </div>
          <p className="mt-2 font-medium">{m.titulo}</p>
          {m.descricao && <p className="mt-1 text-sm whitespace-pre-line text-muted">{m.descricao}</p>}
          {m.decisao && (
            <p className="mt-2 border-l-2 border-line-strong pl-3 text-sm whitespace-pre-line text-muted">
              <span className="font-medium text-fg">{m.status === "descartada" ? "Por que não: " : m.status === "aplicada" ? "Como ficou: " : "Observação: "}</span>
              {m.decisao}
            </p>
          )}
          <p className="mt-2 text-xs text-subtle">
            {m.autor_nome ?? "Alguém"} · {fmtRelativo(m.criado_em)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {admin && (
            <Botao tamanho="sm" onClick={aoStatus}>
              Mudar status
            </Botao>
          )}
          {dono && (
            <div className="flex gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
              <Botao variante="ghost" tamanho="icon" aria-label={`Editar ${m.titulo}`} onClick={aoEditar}>
                <Pencil />
              </Botao>
              <Botao variante="ghost" tamanho="icon" aria-label={`Apagar ${m.titulo}`} onClick={aoApagar} className="hover:text-danger">
                <Trash2 />
              </Botao>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/* ---------- Modais ---------- */
function MelhoriaModal({ proprioId, melhoria, aoFechar }: { proprioId: number; melhoria?: Melhoria; aoFechar: () => void }) {
  const invalidar = useInvalidar();
  const [f, setF] = useState<MelhoriaForm>({
    titulo: melhoria?.titulo ?? "",
    descricao: melhoria?.descricao ?? "",
    origem: melhoria?.origem ?? "montagem",
    area: melhoria?.area ?? "estrutura",
  });
  const set = <K extends keyof MelhoriaForm>(k: K, v: MelhoriaForm[K]) => setF((s) => ({ ...s, [k]: v }));
  const salvar = useMutation({
    mutationFn: () => (melhoria ? api.editarMelhoria(melhoria.id, f) : api.anotarMelhoria(proprioId, f)),
    onSuccess: () => {
      toast.success(melhoria ? "Anotação atualizada" : "Ideia anotada");
      invalidar();
      aoFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const ok = f.titulo.trim().length > 0;
  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={melhoria ? "Editar anotação" : "Anotar ideia ou problema"}
      descricao="O que pode melhorar na próxima versão: algo visto no campo, difícil na montagem, caro…"
      icone={<Lightbulb />}
      rodape={
        <>
          <Botao variante="ghost" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primary" type="submit" form="form-melhoria" disabled={!ok} carregando={salvar.isPending}>
            Salvar
          </Botao>
        </>
      }
    >
      <form
        id="form-melhoria"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) salvar.mutate();
        }}
      >
        <Campo rotulo="Título" obrigatorio>
          {(id) => (
            <Input
              id={id}
              value={f.titulo}
              onChange={(e) => set("titulo", e.target.value)}
              placeholder="Ex.: Cabos por fora do mastro enroscam no campo"
              maxLength={160}
              autoFocus
              autoComplete="off"
            />
          )}
        </Campo>
        <Campo rotulo="Detalhes">
          {(id) => (
            <Textarea
              id={id}
              rows={4}
              value={f.descricao ?? ""}
              onChange={(e) => set("descricao", e.target.value)}
              placeholder="O que acontece, em qual unidade, ideia de solução…"
            />
          )}
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="De onde veio">
            {(id) => (
              <Select id={id} value={f.origem} onChange={(e) => set("origem", e.target.value as OrigemMelhoria)}>
                {Object.entries(ORIGENS).map(([v, r]) => (
                  <option key={v} value={v}>
                    {r}
                  </option>
                ))}
              </Select>
            )}
          </Campo>
          <Campo rotulo="Área">
            {(id) => (
              <Select id={id} value={f.area} onChange={(e) => set("area", e.target.value as AreaMelhoria)}>
                {Object.entries(AREAS).map(([v, r]) => (
                  <option key={v} value={v}>
                    {r}
                  </option>
                ))}
              </Select>
            )}
          </Campo>
        </div>
      </form>
    </Modal>
  );
}

function StatusModal({
  detalhe,
  melhoria,
  aoFechar,
  aoNovaVersao,
}: {
  detalhe: EvolucaoDetalhe;
  melhoria: Melhoria;
  aoFechar: () => void;
  aoNovaVersao: () => void;
}) {
  const invalidar = useInvalidar();
  const [status, setStatus] = useState<StatusMelhoria>(melhoria.status === "ideia" ? "teste" : melhoria.status);
  const [versaoId, setVersaoId] = useState<number | null>(melhoria.versao_id ?? detalhe.versoes[0]?.id ?? null);
  const [decisao, setDecisao] = useState(melhoria.decisao ?? "");
  const salvar = useMutation({
    mutationFn: () => api.statusMelhoria(melhoria.id, { status, versao_id: status === "aplicada" ? versaoId : null, decisao: decisao || null }),
    onSuccess: () => {
      toast.success(`Marcada como ${STATUS[status].rotulo.toLowerCase()}`, { description: melhoria.titulo });
      invalidar();
      aoFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const semVersao = status === "aplicada" && !detalhe.versoes.length;
  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Mudar status"
      descricao={melhoria.titulo}
      icone={<Lightbulb />}
      rodape={
        <>
          <Botao variante="ghost" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primary" onClick={() => salvar.mutate()} disabled={semVersao || (status === "aplicada" && !versaoId)} carregando={salvar.isPending}>
            Salvar
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Status">
          {(Object.keys(STATUS) as StatusMelhoria[]).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={status === s}
              onClick={() => setStatus(s)}
              className={cn(
                "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[13px] transition-colors",
                status === s ? "border-primary/40 bg-primary-soft text-primary" : "border-line bg-surface text-muted hover:border-line-strong hover:text-fg",
              )}
            >
              {status === s && <Check className="size-3.5" />}
              {STATUS[s].rotulo}
            </button>
          ))}
        </div>
        {status === "aplicada" &&
          (semVersao ? (
            <div className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted">
              Para marcar como aplicada, registre antes a versão em que ela entrou.{" "}
              <button
                type="button"
                className="cursor-pointer font-medium text-primary hover:underline"
                onClick={() => {
                  aoFechar();
                  aoNovaVersao();
                }}
              >
                Registrar versão
              </button>
            </div>
          ) : (
            <Campo rotulo="Em qual versão entrou">
              {(id) => (
                <Select id={id} value={versaoId ?? ""} onChange={(e) => setVersaoId(Number(e.target.value))}>
                  {detalhe.versoes.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nome}
                      {v.data ? ` · ${fmtDataVersao(v.data)}` : ""}
                    </option>
                  ))}
                </Select>
              )}
            </Campo>
          ))}
        <Campo
          rotulo={status === "descartada" ? "Por que não vai ser feita" : status === "aplicada" ? "Como ficou" : "Observação"}
          dica="Opcional. Fica registrado junto da anotação."
        >
          {(id) => (
            <Textarea
              id={id}
              rows={3}
              value={decisao}
              onChange={(e) => setDecisao(e.target.value)}
              placeholder={
                status === "descartada"
                  ? "Ex.: não cabe no chassi atual"
                  : status === "aplicada"
                    ? "Ex.: cabos passam por dentro do mastro, com prensa-cabo na base"
                    : "Ex.: testando na unidade OLIE-0003"
              }
            />
          )}
        </Campo>
      </div>
    </Modal>
  );
}

function VersaoModal({ proprioId, versao, aoFechar }: { proprioId: number; versao?: Versao; aoFechar: () => void }) {
  const invalidar = useInvalidar();
  const [f, setF] = useState<VersaoForm>({ nome: versao?.nome ?? "", data: versao?.data ?? null, resumo: versao?.resumo ?? "" });
  const salvar = useMutation({
    mutationFn: () => (versao ? api.editarVersao(versao.id, f) : api.criarVersao(proprioId, f)),
    onSuccess: (v) => {
      toast.success(versao ? "Versão atualizada" : `Versão ${v.nome} registrada`);
      invalidar();
      aoFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const ok = f.nome.trim().length > 0;
  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={versao ? `Editar ${versao.nome}` : "Nova versão"}
      descricao="As melhorias marcadas como aplicadas nesta versão aparecem embaixo dela na linha do tempo."
      icone={<Milestone />}
      rodape={
        <>
          <Botao variante="ghost" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primary" type="submit" form="form-versao" disabled={!ok} carregando={salvar.isPending}>
            Salvar
          </Botao>
        </>
      }
    >
      <form
        id="form-versao"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) salvar.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Nome" obrigatorio>
            {(id) => (
              <Input id={id} value={f.nome} onChange={(e) => setF((s) => ({ ...s, nome: e.target.value }))} placeholder="Ex.: v2" maxLength={40} autoFocus autoComplete="off" />
            )}
          </Campo>
          <Campo rotulo="Data" dica="Quando passou a ser montada assim">
            {(id) => <Input id={id} type="date" value={f.data ?? ""} onChange={(e) => setF((s) => ({ ...s, data: e.target.value || null }))} />}
          </Campo>
        </div>
        <Campo rotulo="Resumo" dica="Opcional. O que essa versão trouxe de diferente, em geral.">
          {(id) => (
            <Textarea
              id={id}
              rows={3}
              value={f.resumo ?? ""}
              onChange={(e) => setF((s) => ({ ...s, resumo: e.target.value }))}
              placeholder="Ex.: cabos internos e bateria nova"
            />
          )}
        </Campo>
      </form>
    </Modal>
  );
}
