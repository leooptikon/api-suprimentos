import {
  Battery,
  Cable,
  Camera,
  Cog,
  Cpu,
  Droplets,
  Hammer,
  Lightbulb,
  Monitor,
  Nut,
  Package,
  Paperclip,
  Printer,
  Radio,
  Ruler,
  ShieldCheck,
  Sparkles,
  Wifi,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../components/ui";

/** Palavras-chave → ícone. Funciona com qualquer categoria nova que contenha a palavra. */
const ICONES: [RegExp, LucideIcon][] = [
  [/energia|bateria|pilha|fonte|carregador/, Battery],
  [/cabo|fio|conector/, Cable],
  [/visao|camera|imagem|lente/, Camera],
  [/mecanica|motor|roda|engrenagem|rolamento/, Cog],
  [/eletronica|placa|chip|sensor|micro|arduino|esp/, Cpu],
  [/fixacao|parafuso|porca|arruela|rebite/, Nut],
  [/ferramenta/, Wrench],
  [/manutencao|reparo/, Hammer],
  [/iluminacao|led|lampada/, Lightbulb],
  [/informatica|computador|monitor|periferico/, Monitor],
  [/rede|wifi|roteador/, Wifi],
  [/radio|antena|rf/, Radio],
  [/impressao|impressora|toner|tinta/, Printer],
  [/escritorio|papelaria|papel/, Paperclip],
  [/limpeza|quimico|cola|adesivo/, Droplets],
  [/medicao|medida|instrumento/, Ruler],
  [/epi|seguranca|protecao/, ShieldCheck],
  [/consumivel|insumo/, Sparkles],
];

/** Matizes escolhidos para conversar com o ciano/violeta da marca e manter contraste nos dois temas. */
const CORES = ["#22d3ee", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#60a5fa", "#fb923c", "#2dd4bf", "#c084fc", "#a3e635"];

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export function visualCategoria(categoria: string | null | undefined) {
  if (!categoria) return { Icone: Package, cor: "var(--muted)" };
  const n = normalizar(categoria);
  const Icone = ICONES.find(([re]) => re.test(n))?.[1] ?? Package;
  let h = 0;
  for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { Icone, cor: CORES[h % CORES.length]! };
}

export function IconeCategoria({
  categoria,
  tamanho = "md",
  className,
}: {
  categoria: string | null | undefined;
  tamanho?: "sm" | "md" | "lg";
  className?: string;
}) {
  const { Icone, cor } = visualCategoria(categoria);
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-lg border",
        tamanho === "sm" && "size-7 [&_svg]:size-3.5",
        tamanho === "md" && "size-9 [&_svg]:size-4",
        tamanho === "lg" && "size-12 rounded-xl [&_svg]:size-6",
        className,
      )}
      style={{
        color: cor,
        background: `color-mix(in srgb, ${cor} 12%, transparent)`,
        borderColor: `color-mix(in srgb, ${cor} 28%, transparent)`,
      }}
    >
      <Icone />
    </span>
  );
}

/** Etiqueta da categoria com um ponto colorido. */
export function EtiquetaCategoria({ categoria, className }: { categoria: string | null | undefined; className?: string }) {
  const { cor } = visualCategoria(categoria);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted", className)}>
      <span className="size-1.5 rounded-full" style={{ background: cor }} />
      {categoria ?? "Sem categoria"}
    </span>
  );
}

/** Foto do produto quando existir; senão o ícone da categoria. */
export function MiniaturaProduto({
  produto,
  tamanho = "md",
  className,
}: {
  produto: { categoria: string | null; foto_url: string | null; nome: string };
  tamanho?: "sm" | "md" | "lg";
  className?: string;
}) {
  if (!produto.foto_url) return <IconeCategoria categoria={produto.categoria} tamanho={tamanho} className={className} />;
  return (
    <img
      src={produto.foto_url}
      alt=""
      loading="lazy"
      className={cn(
        "shrink-0 rounded-lg border border-line bg-surface-2 object-cover",
        tamanho === "sm" && "size-7",
        tamanho === "md" && "size-9",
        tamanho === "lg" && "size-12 rounded-xl",
        className,
      )}
    />
  );
}
