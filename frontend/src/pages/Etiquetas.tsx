import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckSquare, Printer, QrCode, Search, Square } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CabecalhoPagina } from "../components/Layout";
import { Botao, Card, cn, Esqueleto, Input, Select, Vazio } from "../components/ui";
import { api, type Produto } from "../lib/api";
import { EtiquetaCategoria } from "../lib/categorias";

export const GUIA_ETIQUETAS = "suprimentos:etiquetas-impressas";

/** Endereço que o QR abre: a página do produto já com a retirada aberta. */
export const urlRetirada = (id: number) => `${window.location.origin}/produtos/${id}?acao=retirar`;

const ehLocal = () => ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);

export function QrSvg({ texto, className }: { texto: string; className?: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let vivo = true;
    QRCode.toString(texto, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } }).then(
      (s) => vivo && setSvg(s),
    );
    return () => {
      vivo = false;
    };
  }, [texto]);
  // SVG gerado pela biblioteca a partir do nosso próprio texto
  return <div role="img" aria-label="QR code" className={cn("bg-white [&_svg]:size-full", className)} dangerouslySetInnerHTML={{ __html: svg }} />;
}

function Etiqueta({ p }: { p: Produto }) {
  return (
    <div className="flex h-[38mm] break-inside-avoid items-center gap-3 overflow-hidden rounded-lg border border-dashed border-neutral-300 bg-white p-[3mm] text-black">
      <QrSvg texto={urlRetirada(p.id)} className="size-[27mm] shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-3 text-[10pt] leading-tight font-semibold">{p.nome}</p>
        {p.localizacao && <p className="mt-1 line-clamp-2 text-[8pt] leading-tight text-neutral-600">{p.localizacao}</p>}
        <p className="mt-1.5 text-[7pt] tracking-wide text-neutral-500 uppercase">Aponte a câmera para retirar</p>
      </div>
    </div>
  );
}

export function Etiquetas() {
  const [params] = useSearchParams();
  const produtos = useQuery({ queryKey: ["produtos", {}], queryFn: () => api.produtos() });
  const categorias = useQuery({ queryKey: ["categorias"], queryFn: api.categorias });
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [selecionados, setSelecionados] = useState<Set<number> | null>(() => {
    const ids = params.get("ids");
    return ids ? new Set(ids.split(",").map(Number).filter(Boolean)) : null;
  });

  const lista = produtos.data ?? [];
  // Sem seleção explícita, todos começam marcados
  const marcados = selecionados ?? new Set(lista.map((p) => p.id));
  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return lista.filter((p) => (!categoria || p.categoria === categoria) && (!t || p.nome.toLowerCase().includes(t)));
  }, [lista, busca, categoria]);
  const paraImprimir = lista.filter((p) => marcados.has(p.id));

  function alternar(id: number) {
    const novo = new Set(marcados);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    setSelecionados(novo);
  }

  function marcarVisiveis(valor: boolean) {
    const novo = new Set(marcados);
    for (const p of visiveis) {
      if (valor) novo.add(p.id);
      else novo.delete(p.id);
    }
    setSelecionados(novo);
  }

  function imprimir() {
    try {
      localStorage.setItem(GUIA_ETIQUETAS, "1");
    } catch {
      /* sem armazenamento */
    }
    window.print();
  }

  return (
    <>
      <div className="print:hidden">
        <CabecalhoPagina
          titulo="Etiquetas QR"
          descricao="Imprima e cole nas gavetas. Quem apontar a câmera do celular cai direto na retirada daquele item."
          acoes={
            <Botao variante="primary" onClick={imprimir} disabled={paraImprimir.length === 0}>
              <Printer /> Imprimir {paraImprimir.length > 0 && `(${paraImprimir.length})`}
            </Botao>
          }
        />

        {ehLocal() && (
          <div className="mb-4 flex gap-3 rounded-xl border border-warn/30 bg-warn-soft p-4 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
            <p>
              <strong className="font-medium">Você está acessando pelo “localhost”.</strong>{" "}
              <span className="text-muted">
                O QR vai apontar para este computador e não vai abrir no celular. Antes de imprimir, abra o site pelo endereço de rede desta máquina (ex.:
                http://192.168.0.10:5180).
              </span>
            </p>
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
          <Card className="flex max-h-[70vh] flex-col overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-line p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar produtos…" className="pl-9" aria-label="Filtrar" />
              </div>
              <Select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria">
                <option value="">Todas as categorias</option>
                {categorias.data?.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
              <div className="flex gap-2">
                <Botao tamanho="sm" variante="ghost" onClick={() => marcarVisiveis(true)}>
                  Marcar todos
                </Botao>
                <Botao tamanho="sm" variante="ghost" onClick={() => marcarVisiveis(false)}>
                  Desmarcar
                </Botao>
              </div>
            </div>
            <ul className="flex-1 overflow-y-auto p-1.5">
              {produtos.isLoading &&
                [0, 1, 2, 3].map((i) => (
                  <li key={i} className="p-1.5">
                    <Esqueleto className="h-9" />
                  </li>
                ))}
              {visiveis.map((p) => {
                const on = marcados.has(p.id);
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => alternar(p.id)}
                      aria-pressed={on}
                      className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2"
                    >
                      {on ? <CheckSquare className="size-4 shrink-0 text-primary" /> : <Square className="size-4 shrink-0 text-subtle" />}
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-sm", !on && "text-muted")}>{p.nome}</span>
                        <EtiquetaCategoria categoria={p.categoria} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="p-5">
            <p className="mb-4 text-sm text-muted">
              Prévia em tamanho real · folha A4, 3 etiquetas por linha. Use papel adesivo ou recorte na linha tracejada.
            </p>
            {paraImprimir.length === 0 ? (
              <Vazio icone={<QrCode />} titulo="Nenhum produto marcado" texto="Marque ao lado os itens que vão ganhar etiqueta." />
            ) : (
              // Mesmo tamanho do papel (A4 menos as margens), para a prévia ser fiel
              <div className="overflow-x-auto rounded-lg bg-neutral-200 p-4">
                <div className="mx-auto grid w-[190mm] grid-cols-3 gap-[3mm] bg-white p-[3mm] shadow-lg">
                  {paraImprimir.map((p) => (
                    <Etiqueta key={p.id} p={p} />
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Só aparece no papel */}
      <div className="hidden print:grid print:grid-cols-3 print:gap-[3mm]">
        {paraImprimir.map((p) => (
          <Etiqueta key={p.id} p={p} />
        ))}
      </div>
    </>
  );
}
