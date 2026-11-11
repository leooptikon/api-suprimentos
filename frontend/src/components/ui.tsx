import clsx from "clsx";
import { Loader2, X } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import type { StatusEstoque } from "../lib/api";
import { fmtNum, iniciais } from "../lib/format";

export const cn = clsx;

/* ---------- Botão ---------- */
type Variante = "primary" | "secondary" | "ghost" | "danger" | "ai";

const VARIANTES: Record<Variante, string> = {
  primary:
    "bg-primary text-primary-fg hover:bg-primary-strong shadow-[0_0_0_1px_var(--primary),0_6px_20px_-8px_var(--primary)] hover:shadow-[0_0_0_1px_var(--primary-strong),0_8px_28px_-8px_var(--primary)]",
  secondary: "bg-surface-2 text-fg border border-line hover:border-line-strong hover:bg-surface-2/70",
  ghost: "text-muted hover:text-fg hover:bg-surface-2",
  danger: "bg-danger-soft text-danger border border-danger/30 hover:bg-danger-strong hover:text-white",
  ai: "bg-ai-soft text-ai border border-ai/30 hover:border-ai/60",
};

interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamanho?: "sm" | "md" | "icon";
  carregando?: boolean;
}

export const Botao = forwardRef<HTMLButtonElement, BotaoProps>(function Botao(
  { variante = "secondary", tamanho = "md", carregando, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || carregando}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-all duration-150 select-none",
        "disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:size-4 [&_svg]:shrink-0",
        tamanho === "sm" && "h-8 px-3 text-[13px]",
        tamanho === "md" && "h-9 px-3.5 text-sm",
        tamanho === "icon" && "size-8",
        VARIANTES[variante],
        className,
      )}
      {...rest}
    >
      {carregando && <Loader2 className="animate-spin" />}
      {children}
    </button>
  );
});

/* ---------- Campos ---------- */
const CAMPO =
  "w-full rounded-lg border border-line bg-bg/60 px-3 text-sm text-fg placeholder:text-subtle transition-colors hover:border-line-strong focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary-soft disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(CAMPO, "h-9", className)} {...rest} />;
});

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CAMPO, "min-h-20 resize-y py-2", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        CAMPO,
        "h-9 cursor-pointer appearance-none bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-8",
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238a96a8' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Campo({
  rotulo,
  dica,
  erro,
  obrigatorio,
  children,
  className,
}: {
  rotulo: string;
  dica?: ReactNode;
  erro?: string;
  obrigatorio?: boolean;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-muted">
        {rotulo}
        {obrigatorio && <span className="ml-0.5 text-primary">*</span>}
      </label>
      {children(id)}
      {erro ? (
        <p className="text-xs text-danger">{erro}</p>
      ) : (
        dica && <p className="text-xs text-subtle">{dica}</p>
      )}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  rotulo,
  descricao,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  rotulo: string;
  descricao?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-line bg-bg/40 p-3 hover:border-line-strong">
      <span>
        <span className="block text-sm font-medium">{rotulo}</span>
        {descricao && <span className="mt-0.5 block text-xs text-muted">{descricao}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-line-strong transition-colors peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-primary after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4"
      />
    </label>
  );
}

/* ---------- Superfícies ---------- */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-xl border border-line bg-surface shadow-card", className)}>{children}</section>;
}

export function CardHeader({
  titulo,
  descricao,
  acao,
  icone,
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
  icone?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="flex items-center gap-2.5">
        {icone && <span className="text-muted [&_svg]:size-4">{icone}</span>}
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{titulo}</h2>
          {descricao && <p className="mt-0.5 text-xs text-muted">{descricao}</p>}
        </div>
      </div>
      {acao}
    </header>
  );
}

/* ---------- Badges ---------- */
type Tom = "neutro" | "primary" | "ok" | "warn" | "danger" | "ai";
const TONS: Record<Tom, string> = {
  neutro: "bg-surface-2 text-muted border-line",
  primary: "bg-primary-soft text-primary border-primary/25",
  ok: "bg-ok-soft text-ok border-ok/25",
  warn: "bg-warn-soft text-warn border-warn/25",
  danger: "bg-danger-soft text-danger border-danger/25",
  ai: "bg-ai-soft text-ai border-ai/25",
};

export function Badge({ tom = "neutro", children, className }: { tom?: Tom; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        TONS[tom],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS: Record<StatusEstoque, { tom: Tom; rotulo: string }> = {
  ok: { tom: "ok", rotulo: "Em estoque" },
  baixo: { tom: "warn", rotulo: "Estoque baixo" },
  esgotado: { tom: "danger", rotulo: "Esgotado" },
};

export function StatusBadge({ status }: { status: StatusEstoque }) {
  const s = STATUS[status];
  return (
    <Badge tom={s.tom}>
      <span className="size-1.5 rounded-full bg-current" />
      {s.rotulo}
    </Badge>
  );
}

/** Barra que compara o saldo com o estoque mínimo (o mínimo fica a 1/3 da barra). */
export function MedidorEstoque({
  quantidade,
  minimo,
  status,
  className,
}: {
  quantidade: number;
  minimo: number;
  status: StatusEstoque;
  className?: string;
}) {
  const referencia = minimo > 0 ? minimo * 3 : Math.max(quantidade, 1);
  const pct = Math.min(100, (quantidade / referencia) * 100);
  const cor = status === "esgotado" ? "bg-danger" : status === "baixo" ? "bg-warn" : "bg-ok";
  return (
    <div className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-surface-2", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", cor)} style={{ width: `${pct}%` }} />
      {minimo > 0 && <div className="absolute top-0 left-1/3 h-full w-px bg-fg/30" title={`Mínimo: ${fmtNum(minimo)}`} />}
    </div>
  );
}

/* ---------- Modal (dialog nativo) ---------- */
export function Modal({
  aberto,
  aoFechar,
  titulo,
  descricao,
  children,
  rodape,
  largura = "md",
  icone,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao?: ReactNode;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: "sm" | "md" | "lg";
  icone?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) {
      d.showModal();
      // O autoFocus do React roda antes do showModal; foca o primeiro campo depois que o diálogo abre
      d.querySelector<HTMLElement>(
        "input:not([type=hidden]):not([type=radio]):not([type=checkbox]):not([disabled]), select:not([disabled]), textarea",
      )?.focus();
    }
    if (!aberto && d.open) d.close();
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      onClose={aoFechar}
      onMouseDown={(e) => e.target === ref.current && aoFechar()}
      className={cn(
        "m-auto max-h-[90vh] w-[calc(100%-2rem)] overflow-visible rounded-2xl border border-line-strong bg-surface p-0 text-fg shadow-2xl backdrop:bg-transparent",
        largura === "sm" && "max-w-md",
        largura === "md" && "max-w-lg",
        largura === "lg" && "max-w-2xl",
      )}
    >
      {aberto && (
        <div className="flex max-h-[90vh] flex-col">
          <header className="flex items-start gap-3 px-6 pt-5 pb-4">
            {icone && (
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 [&_svg]:size-4">
                {icone}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold tracking-tight">{titulo}</h2>
              {descricao && <p className="mt-0.5 text-sm text-muted">{descricao}</p>}
            </div>
            <Botao variante="ghost" tamanho="icon" onClick={aoFechar} aria-label="Fechar" className="-mt-1 -mr-2">
              <X />
            </Botao>
          </header>
          <div className="overflow-y-auto px-6 pb-5">{children}</div>
          {rodape && (
            <footer className="flex items-center justify-end gap-2 rounded-b-2xl border-t border-line bg-bg/40 px-6 py-3.5">
              {rodape}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}

/* ---------- Estados ---------- */
export function Vazio({ icone, titulo, texto, acao }: { icone: ReactNode; titulo: string; texto?: string; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-xl border border-line bg-surface-2 text-muted [&_svg]:size-5">
        {icone}
      </div>
      <p className="text-sm font-medium">{titulo}</p>
      {texto && <p className="mt-1 max-w-sm text-sm text-muted">{texto}</p>}
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  );
}

export function Esqueleto({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} />;
}

export function Avatar({ nome, className }: { nome: string; className?: string }) {
  const paleta = ["#22d3ee", "#a78bfa", "#34d399", "#fbbf24", "#fb7185", "#60a5fa"];
  const cor = paleta[[...nome].reduce((a, c) => a + c.charCodeAt(0), 0) % paleta.length];
  return (
    <span
      className={cn("grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold", className)}
      style={{ background: `color-mix(in srgb, ${cor} 18%, transparent)`, color: cor }}
    >
      {iniciais(nome)}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-surface-2 px-1.5 py-px font-mono text-[10px] text-muted">
      {children}
    </kbd>
  );
}

export function Confirmar({
  titulo,
  texto,
  rotulo,
  perigo,
  carregando,
  aoConfirmar,
  aoFechar,
}: {
  titulo: string;
  texto: ReactNode;
  rotulo: string;
  perigo?: boolean;
  carregando?: boolean;
  aoConfirmar: () => void;
  aoFechar: () => void;
}) {
  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      largura="sm"
      titulo={titulo}
      rodape={
        <>
          <Botao variante="ghost" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante={perigo ? "danger" : "primary"} onClick={aoConfirmar} carregando={carregando} autoFocus>
            {rotulo}
          </Botao>
        </>
      }
    >
      <div className="text-sm text-muted">{texto}</div>
    </Modal>
  );
}
