import { useMutation, useQuery } from "@tanstack/react-query";
import { KeyRound, Pencil, ShieldCheck, ShieldOff, UserPlus, Users, UserX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useInvalidar } from "../components/acoes";
import { useAuth } from "../components/auth";
import { CabecalhoPagina } from "../components/Layout";
import { Avatar, Badge, Botao, Campo, Card, cn, Confirmar, Esqueleto, Input, Modal, Switch, Vazio } from "../components/ui";
import { api, type Papel, type Pessoa } from "../lib/api";
import { limparUsuario, sugerirUsuario, USUARIO_VALIDO } from "../lib/format";

export function Pessoas() {
  const { admin, usuario } = useAuth();
  const invalidar = useInvalidar();
  const [inativos, setInativos] = useState(false);
  const [editar, setEditar] = useState<Pessoa | "nova" | null>(null);
  const [acesso, setAcesso] = useState<Pessoa | null>(null);
  const [revogar, setRevogar] = useState<Pessoa | null>(null);
  const lista = useQuery({ queryKey: ["pessoas", inativos ? "todas" : "ativas"], queryFn: () => api.pessoas(inativos) });

  const remover = useMutation({
    mutationFn: (id: number) => api.removerAcesso(id),
    onSuccess: (p) => {
      toast.success("Acesso removido", { description: `${p.nome} não consegue mais entrar no site.` });
      invalidar();
      setRevogar(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <CabecalhoPagina
        titulo="Pessoas"
        descricao={admin ? "Quem pode retirar itens e quem tem acesso ao site." : "Quem pode retirar itens do estoque."}
        acoes={
          <>
            <Botao variante="ghost" onClick={() => setInativos((v) => !v)}>
              {inativos ? "Ocultar inativos" : "Mostrar inativos"}
            </Botao>
            {admin && (
              <Botao variante="primary" onClick={() => setEditar("nova")}>
                <UserPlus /> Nova pessoa
              </Botao>
            )}
          </>
        }
      />

      {admin && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {[
            { icone: <ShieldCheck />, tom: "text-primary", titulo: "Administrador", texto: "Cadastra, edita e exclui tudo. Libera o acesso das pessoas." },
            { icone: <KeyRound />, tom: "text-fg", titulo: "Membro", texto: "Consulta o estoque e registra retiradas e entradas." },
            { icone: <UserX />, tom: "text-subtle", titulo: "Sem acesso", texto: "Não entra no site, mas pode aparecer como quem retirou." },
          ].map((c) => (
            <div key={c.titulo} className="flex gap-3 rounded-xl border border-line bg-surface/60 p-4">
              <span className={cn("mt-0.5 [&_svg]:size-4", c.tom)}>{c.icone}</span>
              <div>
                <p className="text-sm font-medium">{c.titulo}</p>
                <p className="mt-0.5 text-xs text-muted">{c.texto}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        {lista.isLoading ? (
          <div className="flex flex-col gap-3 p-4">
            {[0, 1, 2].map((i) => (
              <Esqueleto key={i} className="h-12" />
            ))}
          </div>
        ) : !lista.data?.length ? (
          <Vazio icone={<Users />} titulo="Nenhuma pessoa cadastrada" />
        ) : (
          <ul className="divide-y divide-line">
            {lista.data.map((p) => (
              <li key={p.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5", !p.ativo && "opacity-55")}>
                <Avatar nome={p.nome} className="size-9 text-xs" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-medium">
                    {p.nome}
                    {p.id === usuario.id && <span className="text-xs font-normal text-subtle">(você)</span>}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {[p.setor, admin && p.usuario ? `@${p.usuario}` : null].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!p.ativo ? (
                    <Badge>Inativo</Badge>
                  ) : p.tem_acesso ? (
                    <Badge tom={p.papel === "admin" ? "primary" : "neutro"}>
                      {p.papel === "admin" ? <ShieldCheck className="size-3" /> : <KeyRound className="size-3" />}
                      {p.papel === "admin" ? "Administrador" : "Membro"}
                    </Badge>
                  ) : (
                    <Badge className="border-dashed">Sem acesso</Badge>
                  )}
                  {admin && (
                    <div className="flex gap-0.5">
                      {p.ativo && (
                        <Botao variante="ghost" tamanho="sm" onClick={() => setAcesso(p)}>
                          <KeyRound /> {p.tem_acesso ? "Acesso" : "Liberar acesso"}
                        </Botao>
                      )}
                      {p.tem_acesso && p.id !== usuario.id && (
                        <Botao variante="ghost" tamanho="icon" aria-label={`Remover acesso de ${p.nome}`} title="Remover acesso" onClick={() => setRevogar(p)} className="hover:text-danger">
                          <ShieldOff />
                        </Botao>
                      )}
                      <Botao variante="ghost" tamanho="icon" aria-label={`Editar ${p.nome}`} onClick={() => setEditar(p)}>
                        <Pencil />
                      </Botao>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editar && <PessoaModal pessoa={editar === "nova" ? undefined : editar} aoFechar={() => setEditar(null)} />}
      {acesso && <AcessoModal pessoa={acesso} aoFechar={() => setAcesso(null)} />}
      {revogar && (
        <Confirmar
          perigo
          titulo="Remover acesso?"
          texto={
            <>
              <strong className="text-fg">{revogar.nome}</strong> não vai mais conseguir entrar no site. Continua aparecendo na lista de quem pode retirar
              itens.
            </>
          }
          rotulo="Remover acesso"
          carregando={remover.isPending}
          aoConfirmar={() => remover.mutate(revogar.id)}
          aoFechar={() => setRevogar(null)}
        />
      )}
    </>
  );
}

function PessoaModal({ pessoa, aoFechar }: { pessoa?: Pessoa; aoFechar: () => void }) {
  const invalidar = useInvalidar();
  const { usuario } = useAuth();
  const [nome, setNome] = useState(pessoa?.nome ?? "");
  const [setor, setSetor] = useState(pessoa?.setor ?? "");
  const [ativo, setAtivo] = useState(pessoa?.ativo ?? true);

  const salvar = useMutation({
    mutationFn: () => {
      const d = { nome, setor: setor || null, ativo };
      return pessoa ? api.atualizarPessoa(pessoa.id, d) : api.criarPessoa(d);
    },
    onSuccess: (p) => {
      toast.success(pessoa ? "Pessoa atualizada" : "Pessoa cadastrada", { description: p.nome });
      invalidar();
      aoFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      largura="sm"
      titulo={pessoa ? "Editar pessoa" : "Nova pessoa"}
      icone={<UserPlus />}
      rodape={
        <>
          <Botao variante="ghost" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primary" type="submit" form="form-pessoa" disabled={!nome.trim()} carregando={salvar.isPending}>
            Salvar
          </Botao>
        </>
      }
    >
      <form
        id="form-pessoa"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (nome.trim()) salvar.mutate();
        }}
      >
        <Campo rotulo="Nome" obrigatorio>
          {(id) => <Input id={id} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} autoFocus />}
        </Campo>
        <Campo rotulo="Setor">
          {(id) => <Input id={id} value={setor} onChange={(e) => setSetor(e.target.value)} placeholder="Ex.: Engenharia" maxLength={80} />}
        </Campo>
        {pessoa && pessoa.id !== usuario.id && (
          <Switch checked={ativo} onChange={setAtivo} rotulo="Ativa" descricao="Pessoas inativas somem das listas e perdem o acesso ao site." />
        )}
      </form>
    </Modal>
  );
}

function AcessoModal({ pessoa, aoFechar }: { pessoa: Pessoa; aoFechar: () => void }) {
  const invalidar = useInvalidar();
  const primeira = !pessoa.tem_acesso;
  const [usuario, setUsuario] = useState(pessoa.usuario ?? sugerirUsuario(pessoa.nome));
  const [papel, setPapel] = useState<Papel>(pessoa.papel ?? "membro");
  const [senha, setSenha] = useState("");

  const senhaOk = primeira ? senha.length >= 8 : senha.length === 0 || senha.length >= 8;
  const usuarioOk = USUARIO_VALIDO.test(usuario);
  const valido = usuarioOk && senhaOk;

  const salvar = useMutation({
    mutationFn: () => api.definirAcesso(pessoa.id, { usuario, papel, senha: senha || null }),
    onSuccess: () => {
      toast.success(primeira ? "Acesso liberado" : "Acesso atualizado", {
        description: primeira ? `Passe o usuário "${usuario}" e a senha para ${pessoa.nome}.` : undefined,
      });
      invalidar();
      aoFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={primeira ? "Liberar acesso ao site" : "Acesso ao site"}
      descricao={pessoa.nome}
      icone={<KeyRound />}
      rodape={
        <>
          <Botao variante="ghost" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primary" type="submit" form="form-acesso" disabled={!valido} carregando={salvar.isPending}>
            {primeira ? "Liberar acesso" : "Salvar"}
          </Botao>
        </>
      }
    >
      <form
        id="form-acesso"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valido) salvar.mutate();
        }}
      >
        <Campo
          rotulo="Usuário de login"
          obrigatorio
          dica="Letras minúsculas, números, ponto, hífen ou _"
          erro={usuario && !usuarioOk ? "Use de 3 a 40 caracteres: letras minúsculas, números, ponto, hífen ou _" : undefined}
        >
          {(id) => (
            <Input
              id={id}
              value={usuario}
              onChange={(e) => setUsuario(limparUsuario(e.target.value))}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={40}
              className="tabular"
            />
          )}
        </Campo>

        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-muted">Papel</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["membro", "Membro", "Consulta e registra retiradas"],
                ["admin", "Administrador", "Controla tudo no site"],
              ] as const
            ).map(([v, r, d]) => (
              <label
                key={v}
                className={cn(
                  "cursor-pointer rounded-lg border p-3 transition-colors",
                  papel === v ? "border-primary/50 bg-primary-soft" : "border-line hover:border-line-strong",
                )}
              >
                <input type="radio" name="papel" value={v} checked={papel === v} onChange={() => setPapel(v)} className="sr-only" />
                <span className={cn("block text-sm font-medium", papel === v && "text-primary")}>{r}</span>
                <span className="mt-0.5 block text-xs text-muted">{d}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Campo
          rotulo={primeira ? "Senha inicial" : "Redefinir senha"}
          obrigatorio={primeira}
          dica={primeira ? "Mínimo de 8 caracteres. A pessoa pode trocar depois." : "Deixe em branco para manter a senha atual."}
          erro={senha && senha.length < 8 ? "Mínimo de 8 caracteres" : undefined}
        >
          {(id) => <Input id={id} type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />}
        </Campo>
      </form>
    </Modal>
  );
}
