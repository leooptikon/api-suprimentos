import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  ArrowUpFromLine,
  CornerDownLeft,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  PackagePlus,
  Search,
  ShoppingCart,
  Store,
  Sun,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { MiniaturaProduto } from "../lib/categorias";
import { fmtNum, SENHA_MIN } from "../lib/format";
import { toast } from "sonner";
import { useAcoes } from "./acoes";
import { useAuth } from "./auth";
import { Avatar, Badge, Botao, Campo, cn, Input, Kbd, Modal, StatusBadge } from "./ui";

const NAV = [
  { to: "/", rotulo: "Visão geral", icone: <LayoutDashboard />, fim: true },
  { to: "/produtos", rotulo: "Produtos", icone: <Package /> },
  { to: "/compras", rotulo: "Lista de compras", icone: <ShoppingCart /> },
  { to: "/movimentacoes", rotulo: "Movimentações", icone: <ArrowLeftRight /> },
  { to: "/fornecedores", rotulo: "Fornecedores", icone: <Store /> },
  { to: "/pessoas", rotulo: "Pessoas", icone: <Users /> },
];


function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative grid size-8 place-items-center rounded-lg border border-primary/30 bg-primary-soft shadow-[0_0_24px_-6px_var(--primary)]">
        <svg viewBox="0 0 24 24" className="size-[18px] text-primary" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <path d="M12 2.5 20.5 7.25v9.5L12 21.5l-8.5-4.75v-9.5z" />
          <path d="M3.5 7.25 12 12l8.5-4.75M12 12v9.5" opacity=".55" />
        </svg>
      </span>
      <div className="leading-tight">
        <p className="text-sm font-semibold tracking-tight">Suprimentos</p>
        <p className="font-mono text-[10px] tracking-wider text-subtle uppercase">Estoque · v0.1</p>
      </div>
    </div>
  );
}

function Sidebar({ aoNavegar }: { aoNavegar?: () => void }) {
  const compras = useQuery({ queryKey: ["compras"], queryFn: api.compras, staleTime: 60_000 });
  const aComprar = compras.data?.length ?? 0;
  return (
    <nav className="flex h-full flex-col gap-6 px-3 py-5">
      <div className="px-2">
        <Logo />
      </div>
      <ul className="flex flex-col gap-0.5">
        {NAV.map((n) => (
          <li key={n.to}>
            <NavLink
              to={n.to}
              end={n.fim}
              onClick={aoNavegar}
              className={({ isActive }) =>
                cn(
                  "group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm transition-colors [&_svg]:size-4",
                  isActive ? "bg-surface-2 font-medium text-fg" : "text-muted hover:bg-surface-2/60 hover:text-fg",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute top-2 bottom-2 -left-3 w-0.5 rounded-r bg-primary shadow-[0_0_10px_var(--primary)]" />}
                  <span className={cn(isActive ? "text-primary" : "text-subtle group-hover:text-muted")}>{n.icone}</span>
                  <span className="flex-1">{n.rotulo}</span>
                  {n.to === "/compras" && aComprar > 0 && (
                    <span className="tabular rounded-full bg-warn-soft px-1.5 text-[11px] font-medium text-warn" aria-label={`${aComprar} itens para comprar`}>
                      {aComprar}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-3">
        <p className="px-2.5 text-xs leading-relaxed text-subtle">
          <Kbd>Ctrl</Kbd> <Kbd>K</Kbd> acha qualquer produto.
        </p>
        <CartaoUsuario />
      </div>
    </nav>
  );
}

function CartaoUsuario() {
  const { usuario, admin, sair } = useAuth();
  const [senha, setSenha] = useState(false);
  return (
    <div className="rounded-xl border border-line bg-bg/40 p-2">
      <div className="flex items-center gap-2.5 p-1.5">
        <Avatar nome={usuario.nome} className="size-8" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{usuario.nome}</p>
          <Badge tom={admin ? "primary" : "neutro"} className="mt-0.5 px-1 py-0 text-[10px]">
            {admin ? "Administrador" : "Membro"}
          </Badge>
        </div>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1">
        <Botao variante="ghost" tamanho="sm" onClick={() => setSenha(true)} className="justify-start px-2">
          <KeyRound /> Senha
        </Botao>
        <Botao variante="ghost" tamanho="sm" onClick={sair} className="justify-start px-2 hover:text-danger">
          <LogOut /> Sair
        </Botao>
      </div>
      {senha && <TrocarSenha aoFechar={() => setSenha(false)} />}
    </div>
  );
}

function TrocarSenha({ aoFechar }: { aoFechar: () => void }) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const salvar = useMutation({
    mutationFn: () => api.trocarSenha(atual, nova),
    onSuccess: () => {
      toast.success("Senha alterada", { description: "Suas outras sessões foram encerradas." });
      aoFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const diferente = confirma.length > 0 && confirma !== nova;
  const valido = atual && nova.length >= SENHA_MIN && nova === confirma;
  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      largura="sm"
      titulo="Alterar senha"
      icone={<KeyRound />}
      rodape={
        <>
          <Botao variante="ghost" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primary" type="submit" form="form-senha" disabled={!valido} carregando={salvar.isPending}>
            Salvar senha
          </Botao>
        </>
      }
    >
      <form
        id="form-senha"
        className="flex flex-col gap-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (valido) salvar.mutate();
        }}
      >
        <Campo rotulo="Senha atual">
          {(id) => <Input id={id} type="password" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} autoFocus />}
        </Campo>
        <Campo rotulo="Nova senha" dica={`Mínimo de ${SENHA_MIN} caracteres`}>
          {(id) => <Input id={id} type="password" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} />}
        </Campo>
        <Campo rotulo="Confirme a nova senha" erro={diferente ? "As senhas não conferem" : undefined}>
          {(id) => <Input id={id} type="password" autoComplete="new-password" value={confirma} onChange={(e) => setConfirma(e.target.value)} />}
        </Campo>
      </form>
    </Modal>
  );
}

/* ---------- Tema ---------- */
type Tema = "dark" | "light";
const CHAVE_TEMA = "suprimentos:tema";

function useTema(): [Tema, () => void] {
  const [tema, setTema] = useState<Tema>(() => {
    try {
      return localStorage.getItem(CHAVE_TEMA) === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = tema;
    try {
      localStorage.setItem(CHAVE_TEMA, tema);
    } catch {
      /* sem armazenamento */
    }
  }, [tema]);
  return [tema, () => setTema((t) => (t === "dark" ? "light" : "dark"))];
}

/* ---------- Busca rápida (Ctrl+K) ---------- */
function BuscaRapida({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const navegar = useNavigate();
  const acoes = useAcoes();
  const { admin } = useAuth();
  const [termo, setTermo] = useState("");
  const [sel, setSel] = useState(0);
  const produtos = useQuery({ queryKey: ["produtos", {}], queryFn: () => api.produtos(), enabled: aberto });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) {
      setTermo("");
      setSel(0);
      d.showModal();
      d.querySelector("input")?.focus();
    }
    if (!aberto && d.open) d.close();
  }, [aberto]);

  const itens = useMemo(() => {
    const t = termo
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .trim();
    const norm = (s: string | null) => (s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const achados = (produtos.data ?? []).filter(
      (p) => !t || norm(p.nome).includes(t) || norm(p.categoria).includes(t) || norm(p.localizacao).includes(t),
    );
    type Item = { chave: string; icone: ReactNode; rotulo: string; extra?: ReactNode; executar: () => void };
    const lista: Item[] = achados.slice(0, 8).map((p) => ({
      chave: `p${p.id}`,
      icone: <MiniaturaProduto produto={p} tamanho="sm" />,
      rotulo: p.nome,
      extra: (
        <span className="flex items-center gap-2">
          <span className="tabular text-xs text-muted">
            {fmtNum(p.quantidade)} {p.unidade}
          </span>
          <StatusBadge status={p.status} />
        </span>
      ),
      executar: () => navegar(`/produtos/${p.id}`),
    }));
    if (!t || "retirar retirada".includes(t))
      lista.push({ chave: "a-ret", icone: <ArrowUpFromLine />, rotulo: "Registrar retirada", executar: () => acoes.movimentar() });
    if (admin && (!t || "novo produto cadastrar".includes(t)))
      lista.push({ chave: "a-novo", icone: <PackagePlus />, rotulo: "Cadastrar novo produto", executar: () => acoes.editarProduto() });
    return lista;
  }, [termo, produtos.data, navegar, acoes, admin]);

  function escolher(i: number) {
    const item = itens[i];
    if (!item) return;
    aoFechar();
    item.executar();
  }

  return (
    <dialog
      ref={ref}
      onClose={aoFechar}
      onMouseDown={(e) => e.target === ref.current && aoFechar()}
      className="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-2xl border border-line-strong bg-surface p-0 text-fg shadow-2xl"
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search className="size-4 text-subtle" />
        <input
          autoFocus
          value={termo}
          onChange={(e) => {
            setTermo(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(s + 1, itens.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(s - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              escolher(sel);
            }
          }}
          placeholder="Buscar produto, categoria ou local…"
          className="h-13 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
          aria-label="Buscar"
        />
        <Kbd>Esc</Kbd>
      </div>
      <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
        {itens.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">Nada encontrado para “{termo}”.</li>}
        {itens.map((it, i) => (
          <li
            key={it.chave}
            role="option"
            aria-selected={i === sel}
            onMouseEnter={() => setSel(i)}
            onClick={() => escolher(i)}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm [&>svg]:size-4",
              i === sel ? "bg-surface-2 text-fg" : "text-muted",
            )}
          >
            <span className={cn("[&_svg]:size-4", i === sel ? "text-primary" : "text-subtle")}>{it.icone}</span>
            <span className="flex-1 truncate">{it.rotulo}</span>
            {it.extra}
            {i === sel && <CornerDownLeft className="size-3.5 text-subtle" />}
          </li>
        ))}
      </ul>
    </dialog>
  );
}

/* ---------- Estrutura ---------- */
export function Layout() {
  const [tema, alternarTema] = useTema();
  const [busca, setBusca] = useState(false);
  const [menu, setMenu] = useState(false);
  const acoes = useAcoes();
  const local = useLocation();

  useEffect(() => setMenu(false), [local.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBusca(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-screen border-r border-line bg-surface/60 backdrop-blur-xl lg:block">
        <Sidebar />
      </aside>

      {menu && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMenu(false)} />
          <aside className="animate-in absolute inset-y-0 left-0 w-72 border-r border-line bg-surface">
            <Botao variante="ghost" tamanho="icon" className="absolute top-5 right-3" onClick={() => setMenu(false)} aria-label="Fechar menu">
              <X />
            </Botao>
            <Sidebar aoNavegar={() => setMenu(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-bg/70 px-4 backdrop-blur-xl sm:px-6">
          <Botao variante="ghost" tamanho="icon" className="lg:hidden" onClick={() => setMenu(true)} aria-label="Abrir menu">
            <Menu />
          </Botao>
          <button
            onClick={() => setBusca(true)}
            className="flex h-9 w-full max-w-sm items-center gap-2.5 rounded-lg border border-line bg-surface/60 px-3 text-sm text-subtle transition-colors hover:border-line-strong hover:text-muted"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left">Buscar produtos…</span>
            <span className="hidden gap-1 sm:flex">
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <Botao variante="ghost" tamanho="icon" onClick={alternarTema} aria-label={tema === "dark" ? "Usar tema claro" : "Usar tema escuro"}>
              {tema === "dark" ? <Sun /> : <Moon />}
            </Botao>
            <Botao variante="primary" onClick={() => acoes.movimentar()}>
              <ArrowUpFromLine />
              <span className="hidden sm:inline">Registrar retirada</span>
            </Botao>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>

      <BuscaRapida aberto={busca} aoFechar={() => setBusca(false)} />
    </div>
  );
}

export function CabecalhoPagina({
  titulo,
  descricao,
  acoes,
  antes,
}: {
  titulo: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
  antes?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {antes}
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descricao && <div className="mt-1 text-sm text-muted">{descricao}</div>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}
