import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, MapPin, Pencil, Phone, Plus, Store, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useInvalidar } from "../components/acoes";
import { useAuth } from "../components/auth";
import { CabecalhoPagina } from "../components/Layout";
import { Botao, Campo, Card, Confirmar, Esqueleto, Input, Modal, Textarea, Vazio } from "../components/ui";
import { api, type Fornecedor, type FornecedorForm } from "../lib/api";

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
  const lista = useQuery({ queryKey: ["fornecedores"], queryFn: api.fornecedores });

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
          admin && (
            <Botao variante="primary" onClick={() => setEditar("novo")}>
              <Plus /> Novo fornecedor
            </Botao>
          )
        }
      />

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
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lista.data.map((f) => (
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
              {(f.contato || f.localizacao) && (
                <div className="mt-4 flex flex-col gap-1.5 text-sm text-muted">
                  {f.contato && (
                    <p className="flex items-center gap-2">
                      <Phone className="size-3.5 shrink-0 text-subtle" />
                      <span className="truncate">{f.contato}</span>
                    </p>
                  )}
                  {f.localizacao && (
                    <p className="flex items-center gap-2">
                      <MapPin className="size-3.5 shrink-0 text-subtle" />
                      <span className="truncate">{f.localizacao}</span>
                    </p>
                  )}
                </div>
              )}
              {f.observacoes && <p className="mt-2 line-clamp-2 text-sm text-muted">{f.observacoes}</p>}
              <p className="mt-auto pt-4 text-xs text-subtle">
                <span className="tabular text-fg">{f.total_produtos}</span> {f.total_produtos === 1 ? "produto vinculado" : "produtos vinculados"}
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

function FornecedorModal({ fornecedor, aoFechar }: { fornecedor?: Fornecedor; aoFechar: () => void }) {
  const invalidar = useInvalidar();
  const [f, setF] = useState<FornecedorForm>({
    nome: fornecedor?.nome ?? "",
    site: fornecedor?.site ?? "",
    contato: fornecedor?.contato ?? "",
    localizacao: fornecedor?.localizacao ?? "",
    observacoes: fornecedor?.observacoes ?? "",
  });
  const set = (k: keyof FornecedorForm, v: string) => setF((s) => ({ ...s, [k]: v }));

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
      icone={<Store />}
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
        <Campo rotulo="Nome" obrigatorio>
          {(id) => <Input id={id} value={f.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: KaBuM!" maxLength={120} autoFocus />}
        </Campo>
        <Campo rotulo="Site">
          {(id) => <Input id={id} type="url" value={f.site ?? ""} onChange={(e) => set("site", e.target.value)} placeholder="https://…" maxLength={255} />}
        </Campo>
        <Campo rotulo="Contato">
          {(id) => <Input id={id} value={f.contato ?? ""} onChange={(e) => set("contato", e.target.value)} placeholder="Telefone, e-mail ou vendedor" maxLength={160} />}
        </Campo>
        <Campo rotulo="Localização">
          {(id) => (
            <Input
              id={id}
              value={f.localizacao ?? ""}
              onChange={(e) => set("localizacao", e.target.value)}
              placeholder="Ex.: São Paulo/SP, Santa Ifigênia"
              maxLength={120}
            />
          )}
        </Campo>
        <Campo rotulo="Observações">
          {(id) => <Textarea id={id} value={f.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value)} placeholder="Prazo de entrega, frete grátis acima de…" />}
        </Campo>
      </form>
    </Modal>
  );
}
