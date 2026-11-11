import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, Rocket, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { GUIA_ETIQUETAS } from "../pages/Etiquetas";
import { useAcoes } from "./acoes";
import { useAuth } from "./auth";
import { Botao, Card, cn } from "./ui";

const GUIA_OCULTO = "suprimentos:guia-oculto";

function lerFlag(chave: string) {
  try {
    return localStorage.getItem(chave) === "1";
  } catch {
    return false;
  }
}

/** Checklist para o administrador nos primeiros dias. Some sozinho quando tudo estiver feito. */
export function PrimeirosPassos({ totalProdutos }: { totalProdutos: number }) {
  const { admin } = useAuth();
  const acoes = useAcoes();
  const [oculto, setOculto] = useState(() => lerFlag(GUIA_OCULTO));
  const pessoas = useQuery({ queryKey: ["pessoas"], queryFn: () => api.pessoas(), enabled: admin && !oculto });

  if (!admin || oculto || !pessoas.data) return null;

  const comAcesso = pessoas.data.filter((p) => p.tem_acesso).length;
  const passos = [
    {
      titulo: "Cadastre os produtos",
      texto: "Os itens que vocês têm no escritório, com quantidade e local.",
      feito: totalProdutos > 0,
      acao: (
        <Botao tamanho="sm" variante="primary" onClick={() => acoes.editarProduto()}>
          Novo produto
        </Botao>
      ),
    },
    {
      titulo: "Cadastre quem retira itens",
      texto: "Assim dá para anotar quem pegou o quê, mesmo quem não usa o site.",
      feito: pessoas.data.length >= 2,
      link: "/pessoas",
    },
    {
      titulo: "Libere o acesso da equipe",
      texto: "Crie o usuário de cada pessoa como administrador ou membro.",
      feito: comAcesso >= 2,
      link: "/pessoas",
    },
    {
      titulo: "Imprima as etiquetas QR",
      texto: "Cole nas gavetas: apontar o celular já abre a retirada.",
      feito: lerFlag(GUIA_ETIQUETAS),
      link: "/etiquetas",
    },
  ];
  const feitos = passos.filter((p) => p.feito).length;
  if (feitos === passos.length) return null;
  const proximo = passos.findIndex((p) => !p.feito);

  function ocultar() {
    try {
      localStorage.setItem(GUIA_OCULTO, "1");
    } catch {
      /* sem armazenamento */
    }
    setOculto(true);
  }

  return (
    <Card className="animate-in mb-4 overflow-hidden border-primary/25">
      <div className="flex items-start gap-4 border-b border-line bg-[linear-gradient(120deg,var(--primary-soft),transparent_55%)] px-5 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-primary/30 bg-primary-soft text-primary">
          <Rocket className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Primeiros passos</h2>
          <p className="mt-0.5 text-xs text-muted">
            {feitos} de {passos.length} concluídos
          </p>
          <div className="mt-2 h-1 max-w-xs overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${(feitos / passos.length) * 100}%` }} />
          </div>
        </div>
        <Botao variante="ghost" tamanho="icon" onClick={ocultar} aria-label="Ocultar guia" title="Ocultar guia">
          <X />
        </Botao>
      </div>
      <ol className="grid divide-line sm:grid-cols-2 sm:divide-x xl:grid-cols-4">
        {passos.map((p, i) => (
          <li key={p.titulo} className={cn("flex gap-3 border-line p-4 max-sm:border-b max-sm:last:border-b-0", i === proximo && "bg-surface-2/40")}>
            <span
              className={cn(
                "tabular mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-xs",
                p.feito ? "border-ok/40 bg-ok-soft text-ok" : i === proximo ? "border-primary/50 text-primary" : "border-line text-subtle",
              )}
            >
              {p.feito ? <Check className="size-3.5" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium", p.feito && "text-muted line-through decoration-subtle")}>{p.titulo}</p>
              <p className="mt-0.5 text-xs text-muted">{p.texto}</p>
              {!p.feito && i === proximo && (
                <div className="mt-3">
                  {p.acao ?? (
                    <Link to={p.link!} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                      Fazer agora <ChevronRight className="size-3.5" />
                    </Link>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
