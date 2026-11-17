import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ExternalLink, FolderKanban, FolderOpen, Package, Plug, RefreshCw, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../components/auth";
import { CabecalhoPagina } from "../components/Layout";
import { Badge, Botao, Card, cn, Esqueleto, Input, Vazio } from "../components/ui";
import { api, type LeituraProjetos, type OrigemProjetos, type Projeto } from "../lib/api";
import { fmtNum, fmtRelativo } from "../lib/format";
import { BadgeStatusUnidade } from "../lib/proprios";

function resumoLeitura(r: LeituraProjetos) {
  const partes = [`${r.total} projeto${r.total === 1 ? "" : "s"} no OneDrive`];
  if (r.novos) partes.push(`${r.novos} novo${r.novos === 1 ? "" : "s"}`);
  if (r.renomeados) partes.push(`${r.renomeados} renomeado${r.renomeados === 1 ? "" : "s"}`);
  if (r.sumiram) partes.push(`${r.sumiram} saiu${r.sumiram === 1 ? "" : "ram"} do OneDrive`);
  return partes.join(" · ");
}

export function Projetos() {
  const { admin } = useAuth();
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["projetos"], queryFn: api.projetos });
  const origem = useQuery({ queryKey: ["origem-projetos"], queryFn: api.origemProjetos });
  const [busca, setBusca] = useState("");
  const [verSaidos, setVerSaidos] = useState(false);
  // Só um projeto aberto por vez, para a lista não ficar comprida demais
  const [aberto, setAberto] = useState<number | null>(null);

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["projetos"] });
    qc.invalidateQueries({ queryKey: ["origem-projetos"] });
  };
  const atualizar = useMutation({
    mutationFn: api.atualizarProjetos,
    onSuccess: (r) => {
      toast.success("Projetos atualizados", { description: resumoLeitura(r) });
      recarregar();
    },
    onError: (e: Error) => {
      toast.error(e.message);
      recarregar();
    },
  });

  const todos = lista.data ?? [];
  const saidos = todos.filter((p) => !p.no_onedrive);
  const termo = busca.trim().toLowerCase();
  const visiveis = todos.filter((p) => (verSaidos || p.no_onedrive) && (!termo || p.nome.toLowerCase().includes(termo)));

  return (
    <>
      <CabecalhoPagina
        titulo="Projetos"
        descricao="Empresas e projetos, iguais às pastas do OneDrive. É o que se escolhe para dizer onde está cada unidade dos produtos próprios."
        acoes={
          admin &&
          origem.data?.conectado &&
          origem.data.pasta_definida && (
            <Botao onClick={() => atualizar.mutate()} carregando={atualizar.isPending}>
              <RefreshCw /> Atualizar do OneDrive
            </Botao>
          )
        }
      />

      <div className="flex flex-col gap-4">
        {origem.data ? <CartaoOrigem o={origem.data} admin={admin} aoMudar={recarregar} /> : <Esqueleto className="h-20 rounded-xl" />}

        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar projeto ou empresa…" className="pl-9" aria-label="Buscar projetos" />
            </div>
            {saidos.length > 0 && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
                <input type="checkbox" checked={verSaidos} onChange={(e) => setVerSaidos(e.target.checked)} className="accent-[var(--primary)]" />
                Mostrar os que saíram do OneDrive ({saidos.length})
              </label>
            )}
          </div>

          {lista.isLoading ? (
            <div className="flex flex-col gap-3 p-4">
              {[0, 1, 2].map((i) => (
                <Esqueleto key={i} className="h-12" />
              ))}
            </div>
          ) : visiveis.length === 0 ? (
            <Vazio
              icone={<FolderKanban />}
              titulo={todos.length ? "Nenhum projeto encontrado" : "Nenhum projeto ainda"}
              texto={todos.length ? undefined : "Assim que a pasta do OneDrive for escolhida, os projetos aparecem aqui sozinhos."}
            />
          ) : (
            <ul className="divide-y divide-line">
              {visiveis.map((p) => (
                <LinhaProjeto key={p.id} p={p} aberto={aberto === p.id} aoAlternar={() => setAberto((a) => (a === p.id ? null : p.id))} />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function LinhaProjeto({ p, aberto, aoAlternar }: { p: Projeto; aberto: boolean; aoAlternar: () => void }) {
  const vazio = p.unidades.length === 0 && p.itens.length === 0;
  const painel = `projeto-${p.id}`;
  const resumo = [
    p.unidades.length > 0 && plural(p.unidades.length, "unidade", "unidades"),
    p.itens.length > 0 && plural(p.itens.length, "item", "itens"),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className={cn(!p.no_onedrive && "opacity-70")}>
      <div className={cn("flex items-center gap-2 px-4 py-3 transition-colors", aberto && "bg-surface-2/50")}>
        <button
          type="button"
          onClick={aoAlternar}
          disabled={vazio}
          aria-expanded={vazio ? undefined : aberto}
          aria-controls={vazio ? undefined : painel}
          className="group flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left disabled:cursor-default"
        >
          <FolderKanban className="size-4 shrink-0 text-primary" />
          <span className={cn("truncate font-medium", !vazio && "group-hover:text-primary")} title={p.nome}>
            {p.nome}
          </span>
          {!p.no_onedrive && <Badge>Saiu do OneDrive</Badge>}
          <span className={cn("ml-auto shrink-0 pl-3 text-xs", vazio ? "text-subtle" : "text-muted")}>{vazio ? "Nada enviado" : resumo}</span>
          {!vazio && <ChevronDown className={cn("size-4 shrink-0 text-subtle transition-transform", aberto && "rotate-180 text-primary")} />}
        </button>
        {p.url && (
          <a href={p.url} target="_blank" rel="noreferrer noopener" className="shrink-0 p-1 text-subtle hover:text-primary" aria-label={`Abrir a pasta ${p.nome} no OneDrive`}>
            <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>

      {aberto && !vazio && (
        <div id={painel} className="grid gap-4 border-t border-line bg-bg/30 px-4 py-3 pl-10 sm:grid-cols-2">
          {p.unidades.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-medium tracking-wider text-subtle uppercase">Produtos próprios</p>
              <ul className="flex flex-col gap-1">
                {p.unidades.map((u) => (
                  <li key={u.id} className="flex items-center gap-2 text-sm">
                    <span className="tabular font-mono text-xs">{u.numero_serie}</span>
                    <span className="truncate text-muted">{u.proprio_nome}</span>
                    <span className="ml-auto shrink-0">
                      <BadgeStatusUnidade status={u.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {p.itens.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-medium tracking-wider text-subtle uppercase">Itens do estoque</p>
              <ul className="flex flex-col gap-1">
                {p.itens.map((i) => (
                  <li key={i.produto_id}>
                    <Link to={`/produtos/${i.produto_id}`} className="flex items-center gap-2 text-sm hover:text-primary">
                      <Package className="size-3.5 shrink-0 text-subtle" />
                      <span className="truncate">{i.produto_nome}</span>
                      <span className="tabular ml-auto shrink-0 text-xs text-muted">
                        {fmtNum(i.quantidade)} {i.unidade}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function CartaoOrigem({ o, admin, aoMudar }: { o: OrigemProjetos; admin: boolean; aoMudar: () => void }) {
  const [link, setLink] = useState("");
  const [trocar, setTrocar] = useState(false);
  const pasta = useMutation({
    mutationFn: () => api.pastaProjetos(link.trim()),
    onSuccess: (r) => {
      toast.success("Pasta dos projetos salva", { description: resumoLeitura(r) });
      setLink("");
      setTrocar(false);
      aoMudar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!o.conectado) {
    return (
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-muted">
          <Plug className="size-4.5" />
        </span>
        <p className="flex-1 text-sm text-muted">
          Os projetos vêm das pastas do OneDrive (ex.: <strong className="text-fg">21.40 - TM ENGENHARIA</strong>). Para puxar, a conta Microsoft da
          empresa precisa estar conectada em <strong className="text-fg">Integrações</strong>.
        </p>
        {admin && (
          <Link to="/integracoes" className="shrink-0">
            <Botao tabIndex={-1}>
              <Plug /> Ir para Integrações
            </Botao>
          </Link>
        )}
      </Card>
    );
  }

  if (!o.pasta_definida || trocar) {
    if (!admin) return <Card className="p-4 text-sm text-subtle">Falta um administrador escolher a pasta dos projetos no OneDrive.</Card>;
    return (
      <Card className="p-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <FolderOpen className="size-4" /> {trocar ? "Trocar a pasta dos projetos" : "Escolha a pasta dos projetos"}
        </p>
        <p className="mt-1 text-sm text-muted">
          Cole o link da pasta onde ficam as pastas dos projetos (as que têm nomes como <strong className="text-fg">21.0 - GERENCIAMENTO</strong>). No
          OneDrive: botão direito na pasta → <strong className="text-fg">Compartilhar</strong> → <strong className="text-fg">Copiar link</strong>. Só
          entram as subpastas que começam com número e traço.
        </p>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (link.trim()) pasta.mutate();
          }}
        >
          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…sharepoint.com/…" aria-label="Link da pasta dos projetos" />
          <Botao type="submit" variante="primary" disabled={!link.trim()} carregando={pasta.isPending}>
            Usar esta pasta
          </Botao>
          {trocar && (
            <Botao variante="ghost" onClick={() => setTrocar(false)}>
              Cancelar
            </Botao>
          )}
        </form>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-4 text-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <p className="flex min-w-0 flex-1 items-center gap-2">
          <FolderOpen className="size-4 shrink-0 text-subtle" />
          <span className="text-muted">Pasta:</span>
          {o.pasta_url ? (
            <a href={o.pasta_url} target="_blank" rel="noreferrer noopener" className="truncate font-medium hover:text-primary hover:underline">
              {o.pasta_nome ?? "Abrir pasta"}
            </a>
          ) : (
            <span className="truncate font-medium">{o.pasta_nome ?? "—"}</span>
          )}
        </p>
        <p className="text-muted">
          {o.lidos_em ? `Lida ${fmtRelativo(o.lidos_em)}` : "Ainda não lida"} · confere sozinho a cada 10 minutos
        </p>
        {admin && (
          <Botao variante="ghost" tamanho="sm" onClick={() => setTrocar(true)}>
            Trocar pasta
          </Botao>
        )}
      </div>
      {o.erro && (
        <p className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-soft p-2.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
          {o.erro}
        </p>
      )}
    </Card>
  );
}
