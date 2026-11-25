import { useMutation, useQuery } from "@tanstack/react-query";
import { FolderKanban, LocateFixed, MapPinned, MapPinOff } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useInvalidar } from "../components/acoes";
import { useAuth } from "../components/auth";
import { CampoCidade } from "../components/CampoCidade";
import { urlIcone } from "../components/IconeProprio";
import { MapaDesenhado } from "../components/MapaDesenhado";
import { CabecalhoPagina } from "../components/Layout";
import { Botao, Campo, Card, CardHeader, cn, Esqueleto, Modal, Vazio } from "../components/ui";
import { api, type Cidade } from "../lib/api";
import { fmtNum } from "../lib/format";

/* ---------- Cores dos alfinetes ---------- */
// Uma cor por produto próprio (pelo prefixo do nº de série) + Mikrotik; os outros itens do estoque usam a paleta
const CORES: Record<string, string> = {
  OLIE: "#ef4444", // vermelho
  PULSE: "#f59e0b", // laranja
  CUBE: "#22c55e", // verde
  SENSE: "#f8fafc", // branco
  POSTE: "#22d3ee", // ciano (poste padrão)
  POSTEA: "#3b82f6", // azul (poste autônomo)
  MIKROTIK: "#a855f7", // roxo
};
// Outros itens do estoque: cores que não se confundem com as de cima
const EXTRAS = ["#f97316", "#14b8a6", "#eab308", "#84cc16", "#f43f5e", "#94a3b8"];
const ehMikrotik = (nome: string) => nome.toLowerCase().includes("mikrotik");
const corDe = (c: { chave: string; nome: string; proprio: boolean }) =>
  (c.proprio ? CORES[c.chave] : ehMikrotik(c.nome) ? CORES.MIKROTIK : undefined) ??
  EXTRAS[[...c.chave].reduce((s, ch) => s + ch.charCodeAt(0), 0) % EXTRAS.length]!;
// Itens do estoque que aparecem de cara: só Mikrotik (os outros ficam na legenda para ligar)
const visivelDeInicio = (c: { nome: string; proprio: boolean }) => c.proprio || ehMikrotik(c.nome);

/* ---------- Página ---------- */
interface Camada {
  chave: string;
  nome: string;
  proprio: boolean;
  cor: string;
  total: number;
}

export function Mapa() {
  const { admin } = useAuth();
  const dados = useQuery({ queryKey: ["mapa"], queryFn: api.mapa });
  const projetos = useQuery({ queryKey: ["projetos"], queryFn: api.projetos });
  const [escolhas, setEscolhas] = useState<Record<string, boolean>>({});
  const [editar, setEditar] = useState<{ id: number; nome: string } | null>(null);

  const pontos = dados.data?.pontos ?? [];
  const semLocal = dados.data?.sem_local ?? [];

  // Legenda: todos os tipos (no mapa ou esperando local), com o total de cada um
  const legenda = useMemo(() => {
    const m = new Map<string, Camada>();
    for (const c of [...pontos, ...semLocal]) {
      const atual = m.get(c.chave);
      m.set(c.chave, { chave: c.chave, nome: c.nome, proprio: c.proprio, cor: corDe(c), total: (atual?.total ?? 0) + c.total });
    }
    return [...m.values()].sort((a, b) => Number(b.proprio) - Number(a.proprio) || a.nome.localeCompare(b.nome));
  }, [pontos, semLocal]);
  const visivel = (c: { chave: string; nome: string; proprio: boolean }) => escolhas[c.chave] ?? visivelDeInicio(c);

  const noMapa = pontos.filter(visivel);

  // Projetos com coisas mas sem local, juntando os tipos
  const semLocalPorProjeto = useMemo(() => {
    const m = new Map<number, { id: number; nome: string; tipos: typeof semLocal }>();
    for (const s of semLocal) {
      if (s.projeto_id == null) continue;
      const g = m.get(s.projeto_id) ?? { id: s.projeto_id, nome: s.projeto_nome ?? "", tipos: [] };
      g.tipos.push(s);
      m.set(s.projeto_id, g);
    }
    return [...m.values()];
  }, [semLocal]);

  return (
    <>
      <CabecalhoPagina
        titulo="Mapa"
        descricao="Onde estão os produtos próprios e os itens mandados: pela cidade de cada um ou, sem cidade, pelo local do projeto."
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <Card className="min-w-0 overflow-hidden">
          {legenda.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-3" role="group" aria-label="Mostrar ou esconder tipos no mapa">
              {legenda.map((c) => {
                const ligado = visivel(c);
                return (
                  <button
                    key={c.chave}
                    type="button"
                    aria-pressed={ligado}
                    onClick={() => setEscolhas((e) => ({ ...e, [c.chave]: !ligado }))}
                    className={cn(
                      "inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border px-3 text-[13px] transition-colors",
                      ligado ? "border-line-strong bg-surface-2 text-fg" : "border-line bg-surface text-subtle",
                    )}
                    title={c.proprio ? "Produto próprio" : "Item do estoque mandado"}
                  >
                    <span className="size-2.5 rounded-full ring-1 ring-black/25" style={{ background: ligado ? c.cor : "var(--border-strong)" }} />
                    {c.nome}
                    <span className="tabular text-xs text-muted">{fmtNum(c.total)}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="isolate h-[calc(100vh-16rem)] min-h-[420px]">
            {dados.isLoading ? (
              <Esqueleto className="size-full rounded-none" />
            ) : (
              <MapaDesenhado
                pinos={noMapa.map((p) => ({
                  id: `${p.lat},${p.lng}-${p.chave}`,
                  lat: p.lat,
                  lng: p.lng,
                  cor: corDe(p),
                  icone: p.proprio ? urlIcone(p.chave) : undefined,
                  simbolo: !p.proprio && ehMikrotik(p.nome) ? "roteador" : "caixa",
                  nome: p.nome,
                  lugar: p.lugar,
                  total: p.total,
                  itens: p.itens,
                }))}
              />
            )}
          </div>
        </Card>

        <Card className="min-w-0 self-start">
          <CardHeader
            titulo="Sem local no mapa"
            descricao={semLocalPorProjeto.length ? "Projetos sem local; as coisas deles não têm cidade própria" : undefined}
            icone={<MapPinOff />}
          />
          {semLocalPorProjeto.length === 0 ? (
            <Vazio icone={<MapPinned />} titulo={legenda.length ? "Tudo está no mapa" : "Nada mandado para projetos ou cidades ainda"} />
          ) : (
            <ul className="divide-y divide-line">
              {semLocalPorProjeto.map((g) => (
                <li key={g.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                      <FolderKanban className="size-3.5 shrink-0 text-primary" />
                      <span className="truncate">{g.nome}</span>
                    </p>
                    <p className="mt-1 flex flex-wrap gap-x-2.5 gap-y-1 text-xs text-muted">
                      {g.tipos.map((t) => (
                        <span key={t.chave} className="inline-flex items-center gap-1">
                          <span className="size-2 rounded-full ring-1 ring-black/25" style={{ background: corDe(t) }} />
                          {t.nome} {fmtNum(t.total)}
                        </span>
                      ))}
                    </p>
                  </div>
                  {admin && (
                    <Botao tamanho="sm" onClick={() => setEditar({ id: g.id, nome: g.nome })}>
                      <LocateFixed /> Definir
                    </Botao>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-line px-4 py-3 text-xs text-subtle">
            Para pôr uma unidade ou um envio numa cidade, use o campo <strong className="font-medium text-muted">Cidade</strong> na unidade
            (Mudar situação) ou na aba Localização do produto.
          </p>
        </Card>
      </div>

      {editar && (
        <LocalModal
          projeto={(projetos.data ?? []).find((p) => p.id === editar.id) ?? { id: editar.id, nome: editar.nome, lat: null, lng: null, local_nome: null }}
          aoFechar={() => setEditar(null)}
        />
      )}
    </>
  );
}

/* ---------- Local padrão de um projeto (quem não tem cidade própria aparece aqui) ---------- */
function LocalModal({
  projeto,
  aoFechar,
}: {
  projeto: { id: number; nome: string; lat: number | null; lng: number | null; local_nome: string | null };
  aoFechar: () => void;
}) {
  const invalidar = useInvalidar();
  const [cidade, setCidade] = useState<Cidade | null>(
    projeto.lat != null && projeto.lng != null ? { nome: projeto.local_nome ?? "Local definido", lat: projeto.lat, lng: projeto.lng } : null,
  );
  const salvar = useMutation({
    mutationFn: async () => {
      if (cidade) await api.definirLocalProjeto(projeto.id, { lat: cidade.lat, lng: cidade.lng, local_nome: cidade.nome });
      else await api.tirarLocalProjeto(projeto.id);
    },
    onSuccess: () => {
      toast.success(cidade ? `Local: ${cidade.nome}` : "Projeto tirado do mapa", { description: projeto.nome });
      invalidar();
      aoFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Local do projeto"
      descricao={projeto.nome}
      icone={<MapPinned />}
      rodape={
        <>
          <Botao variante="ghost" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primary" onClick={() => salvar.mutate()} carregando={salvar.isPending}>
            Salvar
          </Botao>
        </>
      }
    >
      <Campo rotulo="Cidade" dica="Unidades e envios deste projeto sem cidade própria aparecem aqui no mapa.">
        {(id) => <CampoCidade id={id} valor={cidade} aoMudar={setCidade} />}
      </Campo>
    </Modal>
  );
}
