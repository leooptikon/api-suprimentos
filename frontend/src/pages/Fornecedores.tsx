import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Clock, Download, ExternalLink, MapPin, Package, Pencil, Phone, Plus, Store, Trash2, UserRound } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { toast } from "sonner";
import { useInvalidar } from "../components/acoes";
import { useAuth } from "../components/auth";
import { CabecalhoPagina } from "../components/Layout";
import { Badge, Botao, Campo, Card, Confirmar, Esqueleto, Input, Modal, Select, Textarea, Vazio, cn } from "../components/ui";
import { api, type Fornecedor, type FornecedorForm, type SituacaoFornecedor } from "../lib/api";
import { fmtRelativo } from "../lib/format";

// "Histórico" do cadastro de fornecedores da Optikon
const SITUACOES: Record<SituacaoFornecedor, { rotulo: string; tom: "ok" | "warn" | "danger" }> = {
  utilizado: { rotulo: "Já utilizado", tom: "ok" },
  avaliacao: { rotulo: "Em avaliação", tom: "warn" },
  nao_homologado: { rotulo: "Não homologado", tom: "danger" },
};

function dominio(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function Fornecedores() {
  const { admin } = useAuth();
  const invalidar = useInvalidar();
  const [editar, setEditar] = useState<Fornecedor | "novo" | null>(null);
  const [remover, setRemover] = useState<Fornecedor | null>(null);
  const [filtro, setFiltro] = useState<SituacaoFornecedor | null>(null);
  const lista = useQuery({ queryKey: ["fornecedores"], queryFn: api.fornecedores });
  const visiveis = useMemo(() => (lista.data ?? []).filter((f) => !filtro || f.situacao === filtro), [lista.data, filtro]);

  const excluir = useMutation({
    mutationFn: (id: number) => api.removerFornecedor(id),
    onSuccess: () => {
      toast.success("Fornecedor removido");
      invalidar();
      setRemover(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <CabecalhoPagina
        titulo="Fornecedores"
        descricao="Lojas e distribuidores de onde vocês compram."
        acoes={
          <>
            <a href={api.exportarFornecedoresUrl} download>
              <Botao tabIndex={-1}>
                <Download /> Exportar Excel
              </Botao>
            </a>
            {admin && (
              <Botao variante="primary" onClick={() => setEditar("novo")}>
                <Plus /> Novo fornecedor
              </Botao>
            )}
          </>
        }
      />

      {!!lista.data?.length && (
        <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por histórico">
          {([null, "utilizado", "avaliacao", "nao_homologado"] as const).map((s) => {
            const total = (lista.data ?? []).filter((f) => !s || f.situacao === s).length;
            const ativo = filtro === s;
            return (
              <button
                key={s ?? "todos"}
                type="button"
                aria-pressed={ativo}
                onClick={() => setFiltro(s)}
                className={cn(
                  "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[13px] transition-colors",
                  ativo ? "border-primary/40 bg-primary-soft text-primary" : "border-line bg-surface text-muted hover:border-line-strong hover:text-fg",
                )}
              >
                {s ? SITUACOES[s].rotulo : "Todos"}
                <span className="tabular text-xs opacity-70">{total}</span>
              </button>
            );
          })}
        </div>
      )}

      {lista.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Esqueleto key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : !lista.data?.length ? (
        <Card>
          <Vazio
            icone={<Store />}
            titulo="Nenhum fornecedor cadastrado"
            texto="Cadastre lojas como Mercado Livre, Shopee ou KaBuM para vincular aos produtos."
            acao={
              admin && (
                <Botao variante="primary" onClick={() => setEditar("novo")}>
                  <Plus /> Novo fornecedor
                </Botao>
              )
            }
          />
        </Card>
      ) : !visiveis.length ? (
        <Card>
          <Vazio icone={<Store />} titulo={`Nenhum fornecedor "${SITUACOES[filtro!].rotulo.toLowerCase()}"`} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visiveis.map((f) => (
            <Card key={f.id} className="group flex flex-col p-5 transition-colors hover:border-line-strong">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-sm font-semibold text-primary">
                  {f.nome.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{f.nome}</p>
                  {f.site ? (
                    <a href={f.site} target="_blank" rel="noreferrer noopener" className="inline-flex max-w-full items-center gap-1 text-xs text-primary hover:underline">
                      <span className="truncate">{dominio(f.site)}</span>
                      <ExternalLink className="size-3 shrink-0" />
                    </a>
                  ) : (
                    <p className="text-xs text-subtle">Sem site</p>
                  )}
                </div>
                {admin && (
                  <div className="flex gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                    <Botao variante="ghost" tamanho="icon" aria-label={`Editar ${f.nome}`} onClick={() => setEditar(f)}>
                      <Pencil />
                    </Botao>
                    <Botao variante="ghost" tamanho="icon" aria-label={`Remover ${f.nome}`} onClick={() => setRemover(f)} className="hover:text-danger">
                      <Trash2 />
                    </Botao>
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Badge tom={SITUACOES[f.situacao].tom}>{SITUACOES[f.situacao].rotulo}</Badge>
                {f.proprios_nomes.map((n) => (
                  <Badge key={n} tom="primary">
                    {n}
                  </Badge>
                ))}
              </div>
              <div className="mt-3 flex flex-col gap-1.5 text-sm text-muted">
                {(f.produto_fornecido || f.produtos_vinculados.length > 0) && (
                  <Linha icone={<Package />} titulo="Produto fornecido">
                    {f.produto_fornecido || f.produtos_vinculados.join(", ")}
                  </Linha>
                )}
                {f.contato && (
                  <Linha icone={<Phone />} titulo="Contato">
                    {f.contato}
                  </Linha>
                )}
                {f.localizacao && (
                  <Linha icone={<MapPin />} titulo="Cidade">
                    {f.localizacao}
                  </Linha>
                )}
                {f.prazo_producao && (
                  <Linha icone={<Clock />} titulo="Prazo de produção">
                    Prazo: {f.prazo_producao}
                  </Linha>
                )}
                {f.responsavel_nome && (
                  <Linha icone={<UserRound />} titulo="Responsável OPTIKON">
                    {f.responsavel_nome}
                  </Linha>
                )}
              </div>
              {f.observacoes && <p className="mt-2 line-clamp-2 text-sm text-muted">{f.observacoes}</p>}
              <p className="mt-auto flex flex-wrap justify-between gap-x-3 pt-4 text-xs text-subtle">
                <span>
                  <span className="tabular text-fg">{f.total_produtos}</span> {f.total_produtos === 1 ? "produto vinculado" : "produtos vinculados"}
                </span>
                {f.atualizado_em && <span title="Última atualização">Atualizado {fmtRelativo(f.atualizado_em)}</span>}
              </p>
            </Card>
          ))}
        </div>
      )}

      {editar && <FornecedorModal fornecedor={editar === "novo" ? undefined : editar} aoFechar={() => setEditar(null)} />}
      {remover && (
        <Confirmar
          perigo
          titulo="Remover fornecedor?"
          texto={
            <>
              <strong className="text-fg">{remover.nome}</strong> será removido e desvinculado de {remover.total_produtos}{" "}
              {remover.total_produtos === 1 ? "produto" : "produtos"}. Os produtos continuam cadastrados.
            </>
          }
          rotulo="Remover"
          carregando={excluir.isPending}
          aoConfirmar={() => excluir.mutate(remover.id)}
          aoFechar={() => setRemover(null)}
        />
      )}
    </>
  );
}

function Linha({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2" title={titulo}>
      <span className="mt-0.5 shrink-0 text-subtle [&_svg]:size-3.5">{icone}</span>
      <span className="line-clamp-2">{children}</span>
    </p>
  );
}

function FornecedorModal({ fornecedor, aoFechar }: { fornecedor?: Fornecedor; aoFechar: () => void }) {
  const invalidar = useInvalidar();
  const [f, setF] = useState<FornecedorForm>({
    nome: fornecedor?.nome ?? "",
    site: fornecedor?.site ?? "",
    contato: fornecedor?.contato ?? "",
    localizacao: fornecedor?.localizacao ?? "",
    observacoes: fornecedor?.observacoes ?? "",
    produto_fornecido: fornecedor?.produto_fornecido ?? "",
    prazo_producao: fornecedor?.prazo_producao ?? "",
    situacao: fornecedor?.situacao ?? "utilizado",
    responsavel_id: fornecedor?.responsavel_id ?? null,
    proprios_ids: fornecedor?.proprios_ids ?? [],
  });
  const set = <K extends keyof FornecedorForm>(k: K, v: FornecedorForm[K]) => setF((s) => ({ ...s, [k]: v }));
  const pessoas = useQuery({ queryKey: ["pessoas"], queryFn: () => api.pessoas() });
  const proprios = useQuery({ queryKey: ["proprios"], queryFn: () => api.proprios() });
  const sugeridos = new Set(fornecedor?.proprios_sugeridos.map((p) => p.id));
  const alternar = (id: number) =>
    set("proprios_ids", f.proprios_ids.includes(id) ? f.proprios_ids.filter((x) => x !== id) : [...f.proprios_ids, id]);

  const salvar = useMutation({
    mutationFn: () => (fornecedor ? api.atualizarFornecedor(fornecedor.id, f) : api.criarFornecedor(f)),
    onSuccess: (r) => {
      toast.success(fornecedor ? "Fornecedor atualizado" : "Fornecedor cadastrado", { description: r.nome });
      invalidar();
      aoFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={fornecedor ? "Editar fornecedor" : "Novo fornecedor"}
      descricao={fornecedor?.atualizado_em ? `Última atualização ${fmtRelativo(fornecedor.atualizado_em)}` : undefined}
      icone={<Store />}
      largura="lg"
      rodape={
        <>
          <Botao variante="ghost" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primary" type="submit" form="form-fornecedor" disabled={!f.nome.trim()} carregando={salvar.isPending}>
            Salvar
          </Botao>
        </>
      }
    >
      <form
        id="form-fornecedor"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (f.nome.trim()) salvar.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <Campo rotulo="Nome empresarial" obrigatorio>
            {(id) => <Input id={id} value={f.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: KaBuM!" maxLength={120} autoFocus />}
          </Campo>
          <Campo rotulo="Histórico">
            {(id) => (
              <Select id={id} value={f.situacao} onChange={(e) => set("situacao", e.target.value as SituacaoFornecedor)}>
                {Object.entries(SITUACOES).map(([v, s]) => (
                  <option key={v} value={v}>
                    {s.rotulo}
                  </option>
                ))}
              </Select>
            )}
          </Campo>
        </div>
        <Campo
          rotulo="Produto fornecido"
          dica={
            fornecedor?.produtos_vinculados.length
              ? `Se ficar vazio, a planilha usa os produtos vinculados: ${fornecedor.produtos_vinculados.join(", ")}.`
              : "O que vocês compram desse fornecedor."
          }
        >
          {(id) => (
            <Input
              id={id}
              value={f.produto_fornecido ?? ""}
              onChange={(e) => set("produto_fornecido", e.target.value)}
              placeholder="Ex.: chassi soldado, parafusos, cabos…"
              maxLength={255}
              autoComplete="off"
            />
          )}
        </Campo>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">Produto Optikon relacionado</span>
          {proprios.data?.length ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Produto Optikon relacionado">
              {proprios.data.map((p) => {
                const marcado = f.proprios_ids.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={marcado}
                    onClick={() => alternar(p.id)}
                    className={cn(
                      "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[13px] transition-colors",
                      marcado ? "border-primary/40 bg-primary-soft text-primary" : "border-line bg-surface text-muted hover:border-line-strong hover:text-fg",
                    )}
                  >
                    {marcado && <Check className="size-3.5" />}
                    {p.nome}
                    {!marcado && sugeridos.has(p.id) && <span className="text-[11px] text-subtle">sugerido</span>}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-subtle">{proprios.isLoading ? "Carregando…" : "Nenhum produto próprio cadastrado."}</p>
          )}
          {sugeridos.size > 0 && <p className="text-xs text-subtle">"Sugerido": usa peças vinculadas a este fornecedor.</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Contato (telefone e e-mail)">
            {(id) => (
              <Input id={id} value={f.contato ?? ""} onChange={(e) => set("contato", e.target.value)} placeholder="(31) 99999-0000 · vendas@loja.com" maxLength={160} />
            )}
          </Campo>
          <Campo rotulo="Cidade">
            {(id) => (
              <Input id={id} value={f.localizacao ?? ""} onChange={(e) => set("localizacao", e.target.value)} placeholder="Ex.: Belo Horizonte/MG" maxLength={120} />
            )}
          </Campo>
          <Campo rotulo="Prazo de produção">
            {(id) => (
              <Input
                id={id}
                value={f.prazo_producao ?? ""}
                onChange={(e) => set("prazo_producao", e.target.value)}
                placeholder="Ex.: 2 semanas"
                maxLength={60}
                autoComplete="off"
              />
            )}
          </Campo>
          <Campo rotulo="Responsável OPTIKON">
            {(id) => (
              <Select id={id} value={f.responsavel_id ?? ""} onChange={(e) => set("responsavel_id", e.target.value ? Number(e.target.value) : null)}>
                <option value="">Ninguém</option>
                {pessoas.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </Select>
            )}
          </Campo>
        </div>
        <Campo rotulo="Site">
          {(id) => <Input id={id} type="url" value={f.site ?? ""} onChange={(e) => set("site", e.target.value)} placeholder="https://…" maxLength={255} />}
        </Campo>
        <Campo rotulo="Observações">
          {(id) => <Textarea id={id} value={f.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value)} placeholder="Frete grátis acima de…, qualidade, pedido mínimo…" />}
        </Campo>
      </form>
    </Modal>
  );
}
