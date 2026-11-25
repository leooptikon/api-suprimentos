import { Loader2, MapPin, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type Cidade } from "../lib/api";
import { Input } from "./ui";

/**
 * Campo "Cidade": digita, escolhe uma das cidades sugeridas e pronto — as coordenadas vêm junto,
 * então o mapa já sabe onde marcar. Vazio = usa o local do projeto.
 */
export function CampoCidade({
  id,
  valor,
  aoMudar,
  placeholder = "Digite a cidade, ex.: Macaé",
}: {
  id?: string;
  valor: Cidade | null;
  aoMudar: (c: Cidade | null) => void;
  placeholder?: string;
}) {
  const [texto, setTexto] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [lugares, setLugares] = useState<{ nome: string; curto: string | null; lat: number; lng: number }[] | null>(null);
  const [ativo, setAtivo] = useState(0);

  // Busca enquanto digita (com uma pausa, para não pedir a cada letra)
  useEffect(() => {
    const q = texto.trim();
    if (q.length < 3) {
      setLugares(null);
      return;
    }
    let cancelado = false;
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await api.buscarLugar(q);
        if (!cancelado) {
          setLugares(r);
          setAtivo(0);
        }
      } catch {
        if (!cancelado) setLugares([]);
      } finally {
        if (!cancelado) setBuscando(false);
      }
    }, 450);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [texto]);

  const escolher = (l: { nome: string; curto: string | null; lat: number; lng: number }) => {
    aoMudar({ nome: l.curto || l.nome, lat: l.lat, lng: l.lng });
    setTexto("");
    setLugares(null);
  };

  if (valor) {
    return (
      <div className="flex h-9 items-center gap-2 rounded-xl border border-line bg-bg/60 px-3 text-sm">
        <MapPin className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate">{valor.nome}</span>
        <button
          type="button"
          onClick={() => aoMudar(null)}
          aria-label="Tirar a cidade"
          className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-subtle hover:bg-surface-2 hover:text-danger"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
        <Input
          id={id}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="pl-9"
          role="combobox"
          aria-expanded={!!lugares?.length}
          onKeyDown={(e) => {
            if (!lugares?.length) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setAtivo((i) => Math.min(lugares.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1))));
            } else if (e.key === "Enter") {
              e.preventDefault(); // escolhe a cidade em vez de enviar o formulário
              escolher(lugares[ativo]!);
            }
          }}
        />
        {buscando && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-subtle" />}
      </div>
      {lugares &&
        (lugares.length === 0 ? (
          <p className="mt-1.5 text-xs text-muted">Nenhuma cidade encontrada. Confira o nome.</p>
        ) : (
          <ul role="listbox" className="mt-1.5 overflow-hidden rounded-xl border border-line-strong bg-surface p-1">
            {lugares.map((l, i) => (
              <li key={i} role="option" aria-selected={i === ativo}>
                <button
                  type="button"
                  onMouseEnter={() => setAtivo(i)}
                  onClick={() => escolher(l)}
                  className={`flex w-full cursor-pointer flex-col rounded-lg px-2.5 py-1.5 text-left ${i === ativo ? "bg-surface-2" : ""}`}
                >
                  <span className="text-sm">{l.curto || l.nome}</span>
                  <span className="truncate text-xs text-subtle">{l.nome}</span>
                </button>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
