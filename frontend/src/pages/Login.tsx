import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { MarcaTrace } from "../components/LogoTrace";
import { Botao, Campo, Input } from "../components/ui";
import { api, type Usuario } from "../lib/api";
import { limparUsuario, SENHA_MIN, USUARIO_VALIDO } from "../lib/format";

function CampoSenha({ id, valor, aoMudar, novo }: { id: string; valor: string; aoMudar: (v: string) => void; novo?: boolean }) {
  const [ver, setVer] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={ver ? "text" : "password"}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        autoComplete={novo ? "new-password" : "current-password"}
        minLength={novo ? SENHA_MIN : undefined}
        required
        className="h-10 pr-10"
      />
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-subtle hover:text-fg"
        aria-label={ver ? "Ocultar senha" : "Mostrar senha"}
      >
        {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function Login({ aoEntrar }: { aoEntrar: (u: Usuario) => void }) {
  const estado = useQuery({ queryKey: ["auth-estado"], queryFn: api.estadoAuth });
  const primeiroAcesso = estado.data?.configurado === false;

  const [nome, setNome] = useState("");
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const entrar = useMutation({
    mutationFn: () => (primeiroAcesso ? api.configurar({ nome, usuario, senha }) : api.login(usuario, senha)),
    onSuccess: aoEntrar,
    onError: (e: Error) => setErro(e.message),
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (primeiroAcesso && !USUARIO_VALIDO.test(usuario)) {
      setErro("O usuário deve ter de 3 a 40 caracteres: letras minúsculas, números, ponto, hífen ou _.");
      return;
    }
    entrar.mutate();
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Painel da marca */}
      <aside className="relative hidden overflow-hidden border-r border-line bg-surface/50 lg:flex lg:flex-col lg:justify-center lg:p-12 xl:p-16">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -left-40 size-[520px] rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--primary-soft), transparent)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -bottom-48 size-[480px] rounded-full opacity-70 blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--ai-soft), transparent)" }}
        />

        <h1 className="relative w-full max-w-[440px]">
          <MarcaTrace />
        </h1>
      </aside>

      {/* Formulário */}
      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="animate-in w-full max-w-sm">
          <div className="mb-8">
            {/* No celular o painel da marca some; a logo aparece aqui em cima */}
            <MarcaTrace compacta className="mb-8 w-40 lg:hidden" />
            <h2 className="text-2xl font-semibold tracking-tight">{primeiroAcesso ? "Primeiro acesso" : "Entrar"}</h2>
            <p className="mt-1.5 text-sm text-muted">
              {primeiroAcesso
                ? "Crie a conta do administrador. Depois você libera o acesso das outras pessoas."
                : "Use o usuário e a senha que o administrador liberou para você."}
            </p>
          </div>

          {estado.isLoading ? (
            <div className="h-48 animate-pulse rounded-xl bg-surface-2" />
          ) : (
            <form onSubmit={enviar} className="flex flex-col gap-4">
              {primeiroAcesso && (
                <Campo rotulo="Seu nome">
                  {(id) => (
                    <Input id={id} value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" required className="h-10" autoFocus />
                  )}
                </Campo>
              )}
              <Campo rotulo="Usuário" dica={primeiroAcesso ? "Ex.: leonc — é com ele que você vai entrar" : undefined}>
                {(id) => (
                  <Input
                    id={id}
                    value={usuario}
                    onChange={(e) => setUsuario(limparUsuario(e.target.value))}
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="seu.usuario"
                    maxLength={40}
                    required
                    className="h-10"
                    autoFocus={!primeiroAcesso}
                  />
                )}
              </Campo>
              <Campo rotulo="Senha" dica={primeiroAcesso ? `Mínimo de ${SENHA_MIN} caracteres` : undefined}>
                {(id) => <CampoSenha id={id} valor={senha} aoMudar={setSenha} novo={primeiroAcesso} />}
              </Campo>

              {erro && (
                <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
                  {erro}
                </p>
              )}

              <Botao variante="primary" type="submit" carregando={entrar.isPending} className="mt-2 h-10">
                {primeiroAcesso ? "Criar conta e entrar" : "Entrar"}
                {!entrar.isPending && <ArrowRight />}
              </Botao>

              {!primeiroAcesso && (
                <p className="text-center text-xs text-subtle">Esqueceu a senha? Peça para um administrador redefinir.</p>
              )}
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
