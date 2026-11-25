import { Maximize2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ALTURA, ESTADOS, LARGURA, projetar } from "../lib/brasil";
import { fmtNum } from "../lib/format";
import { cn } from "./ui";

/** Um alfinete no desenho (já com a cor do tipo). */
export interface PinoDesenho {
  id: string;
  lat: number;
  lng: number;
  cor: string;
  /** Desenho do produto próprio dentro da gota; sem ele, um símbolo (roteador ou caixa) */
  icone?: string;
  simbolo?: "roteador" | "caixa";
  nome: string;
  lugar: string | null;
  total: number;
  itens: { texto: string; detalhe: string | null; projeto: string | null }[];
}

type Caixa = { x: number; y: number; w: number; h: number };
const BRASIL: Caixa = { x: 0, y: 0, w: LARGURA, h: ALTURA };

// Contornos dos estados como listas de pontos (para saber em qual estado cada alfinete está)
const ANEIS = ESTADOS.map((e) =>
  e.d
    .split("Z")
    .filter(Boolean)
    .map((anel) =>
      anel
        .replace("M", "")
        .split("L")
        .map((p) => p.split(",").map(Number) as [number, number]),
    ),
);
function dentro([x, y]: [number, number], anel: [number, number][]) {
  let ok = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i]!;
    const [xj, yj] = anel[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ok = !ok;
  }
  return ok;
}
const estadoDe = (p: [number, number]) => ESTADOS.findIndex((_, i) => ANEIS[i]!.some((a) => dentro(p, a)));
function caixaDoEstado(i: number): Caixa {
  const pts = ANEIS[i]!.flat();
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0;
  const h = Math.max(...ys) - y0;
  const m = Math.max(w, h) * 0.18 + 20; // folga em volta
  return { x: x0 - m, y: y0 - m, w: w + 2 * m, h: h + 2 * m };
}

/** Anima a "câmera" (viewBox) de uma caixa para outra. */
function useCamera(alvo: Caixa) {
  const [cam, setCam] = useState(alvo);
  const atual = useRef(alvo);
  useEffect(() => {
    const de = atual.current;
    const inicio = performance.now();
    let raf = 0;
    const passo = (t: number) => {
      const k = Math.min(1, (t - inicio) / 420);
      const e = 1 - Math.pow(1 - k, 3);
      const c = { x: de.x + (alvo.x - de.x) * e, y: de.y + (alvo.y - de.y) * e, w: de.w + (alvo.w - de.w) * e, h: de.h + (alvo.h - de.h) * e };
      atual.current = c;
      setCam(c);
      if (k < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [alvo]);
  return cam;
}

/**
 * Mapa do Brasil desenhado no estilo do site (estados lisos, contorno fino, brilho de destaque),
 * com alfinetes coloridos. Clique num estado para aproximar; no alfinete, para ver o que tem ali.
 */
export function MapaDesenhado({ pinos }: { pinos: PinoDesenho[] }) {
  const [foco, setFoco] = useState<number | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);
  const cam = useCamera(useMemo(() => (foco == null ? BRASIL : caixaDoEstado(foco)), [foco]));
  const zoom = LARGURA / cam.w; // >1 quando aproximado: alfinetes e textos mantêm o tamanho na tela

  // Posição no desenho + estado de cada alfinete; vários tipos na mesma cidade ficam lado a lado
  const marcados = useMemo(() => {
    const porLugar = new Map<string, number>();
    const base = pinos.map((p) => {
      const xy = projetar(p.lat, p.lng);
      const k = `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`;
      const i = porLugar.get(k) ?? 0;
      porLugar.set(k, i + 1);
      return { p, xy, k, i, uf: estadoDe(xy) };
    });
    return base.map((b) => ({ ...b, n: porLugar.get(b.k) ?? 1 }));
  }, [pinos]);

  // Resumo por estado (para colorir os que têm equipamento e para o texto ao passar o mouse)
  const porEstado = useMemo(() => {
    const m = new Map<number, Map<string, { cor: string; total: number }>>();
    for (const { p, uf } of marcados) {
      if (uf < 0) continue;
      const tipos = m.get(uf) ?? new Map();
      const t = tipos.get(p.nome) ?? { cor: p.cor, total: 0 };
      t.total += p.total;
      tipos.set(p.nome, t);
      m.set(uf, tipos);
    }
    return m;
  }, [marcados]);

  // Clique fora do quadro do mapa ou Esc também saem do zoom
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (foco == null && aberto == null) return;
    const fora = (e: PointerEvent) => {
      const alvo = e.target as HTMLElement;
      // a legenda (liga/desliga tipos) fica fora do desenho, mas não deve tirar o zoom
      if (caixa.current && !caixa.current.contains(alvo) && !alvo.closest?.("[data-mapa-manter-zoom]")) {
        setAberto(null);
        setFoco(null);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(null);
        setFoco(null);
      }
    };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [foco, aberto]);

  const pinoAberto = marcados.find((m) => m.p.id === aberto);
  const pct = (x: number, y: number) => ({ left: `${((x - cam.x) / cam.w) * 100}%`, top: `${((y - cam.y) / cam.h) * 100}%` });
  const infoEstado = sobre ?? foco;

  return (
    <div
      ref={caixa}
      className="relative size-full overflow-hidden"
      // Clique fora dos estados (mar, países vizinhos): fecha o quadro e volta para o Brasil inteiro
      onClick={() => {
        setAberto(null);
        setFoco(null);
      }}
    >
      <svg
        viewBox={`${cam.x} ${cam.y} ${cam.w} ${cam.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="size-full select-none"
        role="img"
        aria-label="Mapa do Brasil com os equipamentos"
      >
        <defs>
          <filter id="brilho-brasil" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation={10 / zoom} result="b" />
            <feFlood floodColor="var(--primary)" floodOpacity=".35" />
            <feComposite in2="b" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* estados */}
        <g filter="url(#brilho-brasil)" strokeLinejoin="round">
          {ESTADOS.map((e, i) => {
            const tem = porEstado.has(i);
            return (
              <path
                key={e.sigla}
                d={e.d}
                fillRule="evenodd"
                className={cn(
                  "cursor-pointer transition-[fill] duration-200",
                  foco === i
                    ? "fill-primary/25"
                    : tem
                      ? "fill-primary/14 hover:fill-primary/22"
                      : "fill-[var(--surface-2)] hover:fill-[var(--border)]",
                )}
                stroke={tem || foco === i ? "var(--primary)" : "var(--border-strong)"}
                strokeOpacity={tem || foco === i ? 0.75 : 1}
                strokeWidth={1.4 / zoom}
                onMouseEnter={() => setSobre(i)}
                onMouseLeave={() => setSobre((s) => (s === i ? null : s))}
                onClick={(ev) => {
                  ev.stopPropagation();
                  setAberto(null);
                  setFoco((f) => (f === i ? null : i));
                }}
              >
                <title>{e.nome}</title>
              </path>
            );
          })}
        </g>

        {/* siglas */}
        <g pointerEvents="none" textAnchor="middle" className="fill-[var(--subtle)]" fontFamily="var(--font-mono)" fontWeight={600}>
          {ESTADOS.map((e, i) => (
            <text key={e.sigla} x={e.cx} y={e.cy + 4 / zoom} fontSize={(foco === i ? 13 : 11) / zoom} opacity={porEstado.has(i) || foco === i ? 0.9 : 0.55}>
              {e.sigla}
            </text>
          ))}
        </g>

        {/* alfinetes */}
        {marcados.map(({ p, xy: [x, y], i, n }) => {
          const s = 1.6 / zoom; // tamanho do alfinete na tela (fica igual com zoom)
          const dx = (i - (n - 1) / 2) * 27 * s;
          const ativo = aberto === p.id;
          return (
            <g
              key={p.id}
              transform={`translate(${x + dx} ${y}) scale(${s * (ativo ? 1.2 : 1)})`}
              className="cursor-pointer"
              onClick={(ev) => {
                ev.stopPropagation();
                setAberto(ativo ? null : p.id);
              }}
            >
              <title>{`${p.nome} · ${fmtNum(p.total)}${p.lugar ? ` · ${p.lugar}` : ""}`}</title>
              <Alfinete cor={p.cor} total={p.total} icone={p.icone} simbolo={p.simbolo} />
            </g>
          );
        })}
      </svg>

      {/* estado em foco / sob o mouse */}
      {infoEstado != null && (
        <div className="pointer-events-none absolute top-3 left-3 rounded-xl border border-line bg-surface/90 px-3 py-2 text-xs shadow-card backdrop-blur">
          <p className="font-medium text-fg">{ESTADOS[infoEstado]!.nome}</p>
          {porEstado.get(infoEstado) ? (
            <ul className="mt-1 space-y-0.5">
              {[...porEstado.get(infoEstado)!.entries()].map(([nome, t]) => (
                <li key={nome} className="flex items-center gap-1.5 text-muted">
                  <span className="size-2 rounded-full ring-1 ring-black/25" style={{ background: t.cor }} />
                  {nome} <span className="tabular text-fg">{fmtNum(t.total)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-0.5 text-subtle">Nada aqui</p>
          )}
        </div>
      )}

      {foco != null && (
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            setFoco(null);
            setAberto(null);
          }}
          className="absolute top-3 right-3 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface/90 px-3 text-xs text-muted backdrop-blur hover:text-fg"
        >
          <Maximize2 className="size-3.5" /> Brasil inteiro
        </button>
      )}

      {/* detalhes do alfinete */}
      {pinoAberto && (
        <div
          className="absolute z-10 w-64 -translate-x-1/2 -translate-y-[calc(100%+58px)] rounded-xl border border-line-strong bg-surface p-3 text-[13px] shadow-card"
          style={pct(pinoAberto.xy[0], pinoAberto.xy[1])}
          onClick={(ev) => ev.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">{pinoAberto.p.lugar ?? "Sem nome"}</p>
            <button type="button" onClick={() => setAberto(null)} className="cursor-pointer text-subtle hover:text-fg" aria-label="Fechar">
              <X className="size-3.5" />
            </button>
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 font-medium">
            <span className="size-2.5 rounded-full ring-1 ring-black/25" style={{ background: pinoAberto.p.cor }} />
            {pinoAberto.p.nome} · {fmtNum(pinoAberto.p.total)}
          </p>
          <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto">
            {pinoAberto.p.itens.map((it, j) => (
              <li key={j}>
                <div className="flex justify-between gap-3">
                  <span className="font-mono text-xs">{it.texto}</span>
                  {it.detalhe && <span className="text-xs text-muted">{it.detalhe}</span>}
                </div>
                {it.projeto && <div className="text-[11px] text-subtle">{it.projeto}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Gota de mapa na cor do tipo, com o desenho do produto dentro (OLIE, CUBE, SENSE…). Sem desenho:
 * roteador (Mikrotik) ou caixinha (outros itens do estoque). A ponta da gota fica no ponto exato (0,0).
 * Mais de um no mesmo lugar: o número aparece numa bolinha no canto.
 */
function Alfinete({ cor, total, icone, simbolo = "caixa" }: { cor: string; total: number; icone?: string; simbolo?: "roteador" | "caixa" }) {
  return (
    <g>
      <ellipse cy="0.6" rx="4.8" ry="1.7" fill="#000" opacity=".45" />
      <path d="M0 0C-3-6-12-12-12-22A12 12 0 0 1 12-22C12-12 3-6 0 0z" fill={cor} stroke="#0b0f17" strokeWidth="1.5" />
      <circle cy="-22" r="8.8" fill="#0b0f17" />
      {icone ? (
        <image href={icone} x="-7.6" y="-29.6" width="15.2" height="15.2" />
      ) : simbolo === "roteador" ? (
        <g fill="none" stroke={cor} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <rect x="-5.6" y="-22" width="11.2" height="5.2" rx="1.3" />
          <path d="M-3-22v-3.8M3-22v-3.8" />
          <circle cx="-2.6" cy="-19.4" r=".55" fill={cor} stroke="none" />
          <circle cx="0" cy="-19.4" r=".55" fill={cor} stroke="none" />
        </g>
      ) : (
        <g fill="none" stroke={cor} strokeWidth="1.3" strokeLinejoin="round">
          <path d="M-5-24.5 0-27l5 2.5v6L0-16l-5-2.5z" />
          <path d="M-5-24.5 0-22l5-2.5M0-22v6" />
        </g>
      )}
      {total > 1 && (
        <g transform="translate(11 -32)">
          <circle r="7.2" fill="#0b0f17" stroke={cor} strokeWidth="1.4" />
          <text y="3.2" textAnchor="middle" fontSize={total > 99 ? 6 : 8.5} fontWeight="700" fill="#fff" fontFamily="var(--font-sans)">
            {total > 99 ? "99+" : fmtNum(total)}
          </text>
        </g>
      )}
    </g>
  );
}
