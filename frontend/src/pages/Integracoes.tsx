import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  Link2,
  Loader2,
  Plug,
  RefreshCw,
  ShoppingBag,
  Unplug,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useInvalidar } from "../components/acoes";
import { useAuth } from "../components/auth";
import { CabecalhoPagina } from "../components/Layout";
import { Badge, Botao, Card, Confirmar, Esqueleto, Input } from "../components/ui";
import { api, type StatusML, type StatusOneDrive } from "../lib/api";
import { copiar } from "../lib/copiar";
import { fmtDataHora, fmtRelativo } from "../lib/format";

function Passo({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="tabular grid size-6 shrink-0 place-items-center rounded-full border border-line text-xs text-muted">{n}</span>
      <div className="min-w-0 flex-1 text-sm text-muted">{children}</div>
    </li>
  );
}

function Codigo({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] break-all text-fg">{children}</code>;
}

export function Integracoes() {
  const { admin } = useAuth();
  const [params, setParams] = useSearchParams();
  const status = useQuery({ queryKey: ["status-ml"], queryFn: api.statusML });
  // Recarrega de tempos em tempos para mostrar a hora do último envio da planilha
  const onedrive = useQuery({ queryKey: ["status-onedrive"], queryFn: api.statusOneDrive, refetchInterval: 60_000 });

  // Volta do Mercado Livre direto para cá (quando o redirect aponta para este servidor)
  useEffect(() => {
    if (params.get("conectado")) toast.success("Conta do Mercado Livre conectada");
    if (params.get("erro")) toast.error(params.get("erro")!);
    if (params.get("conectado") || params.get("erro")) setParams({}, { replace: true });
  }, [params, setParams]);

  return (
    <>
      <CabecalhoPagina titulo="Integrações" descricao="Conexões com serviços de fora do site." />
      <div className="flex flex-col gap-6">
        {status.isLoading || !status.data ? (
          <Esqueleto className="h-72 max-w-3xl rounded-xl" />
        ) : (
          <CartaoMercadoLivre s={status.data} admin={admin} />
        )}
        {onedrive.isLoading || !onedrive.data ? (
          <Esqueleto className="h-60 max-w-3xl rounded-xl" />
        ) : (
          <CartaoOneDrive s={onedrive.data} admin={admin} />
        )}
      </div>
    </>
  );
}

function CartaoMercadoLivre({ s, admin }: { s: StatusML; admin: boolean }) {
  const invalidar = useInvalidar();
  const [aguardando, setAguardando] = useState(false);
  const [colado, setColado] = useState("");
  const [desconectar, setDesconectar] = useState(false);
  const sugestaoRedirect = `${window.location.origin}/api/mercadolivre/callback`;

  const conectar = useMutation({
    // A aba é aberta no próprio clique; se esperasse a resposta, o bloqueador de pop-up a barraria
    mutationFn: async (aba: Window | null) => ({ aba, ...(await api.conectarML()) }),
    onSuccess: ({ aba, url }) => {
      setAguardando(true);
      if (aba) {
        aba.opener = null;
        aba.location.href = url;
      } else window.location.href = url;
    },
    onError: (e: Error, aba) => {
      aba?.close();
      toast.error(e.message);
    },
  });
  const concluir = useMutation({
    mutationFn: () => api.concluirML(colado),
    onSuccess: () => {
      toast.success("Conta do Mercado Livre conectada");
      setAguardando(false);
      setColado("");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const atualizar = useMutation({
    mutationFn: api.atualizarML,
    onSuccess: (ex) => {
      if (ex.anuncios === 0) toast.info("Nenhum link de anúncio do Mercado Livre cadastrado ainda");
      else if (ex.falhas) toast.warning(`${ex.atualizados} de ${ex.anuncios} preços atualizados`, { description: ex.mensagem ?? undefined });
      else toast.success(`${ex.atualizados} preços atualizados`);
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const sair = useMutation({
    mutationFn: api.desconectarML,
    onSuccess: () => {
      toast.success("Mercado Livre desconectado");
      setDesconectar(false);
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pertoDeVencer = s.reconectar_ate && new Date(s.reconectar_ate).getTime() - Date.now() < 15 * 86400000;

  return (
    <Card className="max-w-3xl overflow-hidden">
      <div className="flex items-start gap-4 border-b border-line p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-warn/30 bg-warn-soft text-warn">
          <ShoppingBag className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">Mercado Livre</h2>
            {s.conectado && !s.renovacao_automatica ? (
              <Badge tom="warn">
                <Clock className="size-3" /> Conexão temporária
              </Badge>
            ) : s.conectado ? (
              <Badge tom="ok">
                <CheckCircle2 className="size-3" /> Conectado
              </Badge>
            ) : s.configurado ? (
              <Badge tom="warn">Não conectado</Badge>
            ) : (
              <Badge>Não configurado</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            Atualiza todo dia, de graça, o preço dos anúncios do Mercado Livre cadastrados nos fornecedores dos produtos.
          </p>
        </div>
      </div>

      <div className="p-5">
        {!s.configurado ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">Para ativar, alguém com acesso ao servidor precisa fazer uma configuração única:</p>
            <ol className="flex flex-col gap-3">
              <Passo n={1}>
                Entre em{" "}
                <a href="https://developers.mercadolivre.com.br" target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">
                  developers.mercadolivre.com.br
                </a>{" "}
                com a <strong className="text-fg">conta principal</strong> da empresa (não pode ser conta de colaborador) e crie uma aplicação.
              </Passo>
              <Passo n={2}>
                Em <strong className="text-fg">URI de redirect</strong>, coloque <Codigo>{sugestaoRedirect}</Codigo>. Se o Mercado Livre exigir um endereço
                <Codigo>https://</Codigo>, use o endereço público do site; se ainda não houver, pode usar qualquer página <Codigo>https</Codigo> e colar o
                endereço de volta aqui no fim da conexão.
              </Passo>
              <Passo n={3}>
                No servidor, defina as variáveis <Codigo>ML_CLIENT_ID</Codigo> (App ID), <Codigo>ML_CLIENT_SECRET</Codigo> (Secret Key) e{" "}
                <Codigo>ML_REDIRECT_URI</Codigo> (igual ao passo 2) e reinicie a API.
              </Passo>
            </ol>
          </div>
        ) : !s.conectado ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">
              Clique abaixo, entre com a <strong className="text-fg">conta principal</strong> da empresa no Mercado Livre e autorize o acesso. A conexão
              vale por 6 meses.
            </p>
            {admin ? (
              <div>
                <Botao variante="primary" onClick={() => conectar.mutate(window.open("", "_blank"))} carregando={conectar.isPending}>
                  <Plug /> Conectar conta do Mercado Livre
                </Botao>
              </div>
            ) : (
              <p className="text-sm text-subtle">Peça para um administrador conectar.</p>
            )}
            {aguardando && (
              <div className="rounded-xl border border-line bg-bg/40 p-4">
                <p className="text-sm font-medium">Depois de autorizar</p>
                <p className="mt-1 text-sm text-muted">
                  Se o Mercado Livre trouxer você de volta para cá, está pronto. Se cair numa página diferente, copie o{" "}
                  <strong className="text-fg">endereço completo</strong> da barra do navegador (ele tem <Codigo>code=TG-…</Codigo>) e cole aqui:
                </p>
                <form
                  className="mt-3 flex flex-col gap-2 sm:flex-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (colado.trim()) concluir.mutate();
                  }}
                >
                  <Input value={colado} onChange={(e) => setColado(e.target.value)} placeholder="https://…?code=TG-…&state=…" aria-label="Endereço de retorno" />
                  <Botao type="submit" variante="primary" disabled={!colado.trim()} carregando={concluir.isPending}>
                    Concluir
                  </Botao>
                </form>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-subtle">Conta</dt>
                <dd className="mt-0.5 font-medium">{s.nickname ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Anúncios monitorados</dt>
                <dd className="tabular mt-0.5 font-medium">{s.anuncios_monitorados}</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Próxima atualização</dt>
                <dd className="mt-0.5 flex items-center gap-1.5">
                  <Clock className="size-3.5 text-subtle" />
                  {s.proxima_execucao ? fmtDataHora(s.proxima_execucao) : "—"}
                </dd>
              </div>
            </dl>

            {s.ultima && (
              <div className="rounded-xl border border-line bg-bg/40 p-4 text-sm">
                <p className="font-medium">
                  Última atualização {fmtRelativo(s.ultima.inicio)}
                  <span className="ml-2 text-xs font-normal text-subtle">{s.ultima.automatica ? "automática" : "pelo botão"}</span>
                </p>
                <p className="mt-1 text-muted">
                  <span className="tabular">{s.ultima.atualizados}</span> de <span className="tabular">{s.ultima.anuncios}</span> anúncios atualizados
                  {s.ultima.falhas > 0 && <span className="text-warn"> · {s.ultima.falhas} com problema (veja nos produtos)</span>}
                </p>
                {s.ultima.mensagem && s.ultima.falhas === s.ultima.anuncios && <p className="mt-1 text-danger">{s.ultima.mensagem}</p>}
              </div>
            )}

            {!s.renovacao_automatica && (
              <div className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn-soft p-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
                <div>
                  <p className="font-medium">A conexão não se renova sozinha e expira {s.expira_em ? `às ${fmtDataHora(s.expira_em)}` : "em breve"}.</p>
                  <p className="mt-1 text-muted">
                    O Mercado Livre não enviou a permissão de renovação. Clique em <strong className="text-fg">Desconectar</strong> e conecte de novo: o site
                    agora pede o <strong className="text-fg">acesso offline</strong> na autorização. Se mesmo assim continuar temporária, verifique as
                    permissões da aplicação no DevCenter.
                  </p>
                </div>
              </div>
            )}

            {pertoDeVencer && (
              <p className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn-soft p-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />A autorização vence em {fmtDataHora(s.reconectar_ate!)}. Desconecte e
                conecte de novo para renovar por mais 6 meses.
              </p>
            )}

            <div className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
              <p className="flex items-center gap-2 font-medium text-fg">
                <Link2 className="size-4" /> Como monitorar um produto
              </p>
              <p className="mt-1">
                Na página do produto, em <strong className="text-fg">Fornecedores</strong>, cole o link da <strong className="text-fg">página do produto</strong>{" "}
                no Mercado Livre — o endereço com <Codigo>/p/MLB…</Codigo> (é o que aparece ao clicar num resultado da busca). Se o link tiver o vendedor
                escolhido, o site acompanha o preço dele; senão, a menor oferta. O preço se atualiza sozinho todo dia às {s.horario}.
              </p>
            </div>

            {admin && (
              <div className="flex flex-wrap gap-2">
                <Botao variante="primary" onClick={() => atualizar.mutate()} carregando={atualizar.isPending}>
                  <RefreshCw /> Atualizar agora
                </Botao>
                <Botao variante="ghost" onClick={() => setDesconectar(true)} className="hover:text-danger">
                  <Unplug /> Desconectar
                </Botao>
                <a href="https://www.mercadolivre.com.br" target="_blank" rel="noreferrer noopener" className="ml-auto">
                  <Botao variante="ghost" tabIndex={-1}>
                    Abrir Mercado Livre <ExternalLink />
                  </Botao>
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {desconectar && (
        <Confirmar
          titulo="Desconectar o Mercado Livre?"
          texto="Os preços param de ser atualizados automaticamente. O histórico já coletado continua salvo."
          rotulo="Desconectar"
          perigo
          carregando={sair.isPending}
          aoConfirmar={() => sair.mutate()}
          aoFechar={() => setDesconectar(false)}
        />
      )}
    </Card>
  );
}

function fmtIntervalo(segundos: number) {
  if (segundos < 60) return `${segundos} segundos`;
  const min = Math.round((segundos / 60) * 10) / 10;
  return `${String(min).replace(".", ",")} ${min === 1 ? "minuto" : "minutos"}`;
}

function CartaoOneDrive({ s, admin }: { s: StatusOneDrive; admin: boolean }) {
  const qc = useQueryClient();
  const invalidar = useInvalidar();
  const [link, setLink] = useState("");
  const [trocarPasta, setTrocarPasta] = useState(false);
  const [desconectar, setDesconectar] = useState(false);
  const guardar = (novo: StatusOneDrive) => qc.setQueryData(["status-onedrive"], novo);

  const conectar = useMutation({
    mutationFn: api.conectarOneDrive,
    onSuccess: guardar,
    onError: (e: Error) => toast.error(e.message),
  });

  // Enquanto o código está na tela, pergunta a cada 5 s se a pessoa já entrou na página da Microsoft
  const esperandoLogin = admin && !s.conectado && !!s.login_pendente;
  useEffect(() => {
    if (!esperandoLogin) return;
    let ativo = true;
    const id = window.setInterval(async () => {
      try {
        const novo = await api.verificarOneDrive();
        if (!ativo) return;
        qc.setQueryData(["status-onedrive"], novo);
        if (novo.conectado) toast.success("Conta Microsoft conectada");
      } catch (e) {
        if (!ativo) return;
        toast.error((e as Error).message);
        qc.invalidateQueries({ queryKey: ["status-onedrive"] });
      }
    }, 5000);
    return () => {
      ativo = false;
      window.clearInterval(id);
    };
  }, [esperandoLogin, qc]);

  const pasta = useMutation({
    mutationFn: () => api.pastaOneDrive(link.trim()),
    onSuccess: (novo) => {
      guardar(novo);
      setLink("");
      setTrocarPasta(false);
      if (novo.erro) toast.warning("Pasta salva, mas a planilha ainda não foi enviada", { description: novo.erro });
      else toast.success("Planilha enviada para o OneDrive");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const sincronizar = useMutation({
    mutationFn: api.sincronizarOneDrive,
    onSuccess: (novo) => {
      guardar(novo);
      toast.success("Planilha atualizada no OneDrive");
    },
    onError: (e: Error) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["status-onedrive"] });
    },
  });
  const sair = useMutation({
    mutationFn: api.desconectarOneDrive,
    onSuccess: () => {
      toast.success("OneDrive desconectado");
      setDesconectar(false);
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const escolherPasta = s.conectado && (!s.destino_definido || trocarPasta);

  return (
    <Card className="max-w-3xl overflow-hidden">
      <div className="flex items-start gap-4 border-b border-line p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-ok/30 bg-ok-soft text-ok">
          <FileSpreadsheet className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">OneDrive · planilha Excel</h2>
            {s.conectado && s.destino_definido && s.erro ? (
              <Badge tom="warn">
                <AlertTriangle className="size-3" /> Com problema
              </Badge>
            ) : s.conectado && s.destino_definido ? (
              <Badge tom="ok">
                <CheckCircle2 className="size-3" /> Sincronizando
              </Badge>
            ) : s.conectado ? (
              <Badge tom="warn">Falta escolher a pasta</Badge>
            ) : s.configurado ? (
              <Badge tom="warn">Não conectado</Badge>
            ) : (
              <Badge>Não configurado</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            Mantém uma planilha numa pasta do OneDrive da empresa sempre igual ao site, com as abas{" "}
            <strong className="text-fg">Produtos</strong> e <strong className="text-fg">Produtos próprios</strong>. É só do site para a planilha: o que
            for editado nela é substituído.
          </p>
        </div>
      </div>

      <div className="p-5">
        {!s.configurado ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">Para ativar, é preciso cadastrar o site na conta Microsoft da empresa (grátis, uma vez só):</p>
            <ol className="flex flex-col gap-3">
              <Passo n={1}>
                Em{" "}
                <a href="https://portal.azure.com" target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">
                  portal.azure.com
                </a>
                , com a conta da empresa, abra <strong className="text-fg">Microsoft Entra ID → Registros de aplicativo → Novo registro</strong>. Nome{" "}
                <Codigo>Trace</Codigo>, opção <strong className="text-fg">Somente contas deste diretório organizacional</strong>, sem URI de
                redirecionamento.
              </Passo>
              <Passo n={2}>
                Em <strong className="text-fg">Autenticação</strong>, ative <strong className="text-fg">Permitir fluxos de clientes públicos</strong>. Em{" "}
                <strong className="text-fg">Permissões de API</strong>, adicione Microsoft Graph → permissões delegadas <Codigo>Files.ReadWrite.All</Codigo>{" "}
                e <Codigo>offline_access</Codigo>.
              </Passo>
              <Passo n={3}>
                No servidor, defina <Codigo>MS_CLIENT_ID</Codigo> (ID do aplicativo) e <Codigo>MS_TENANT_ID</Codigo> (ID do diretório), da página{" "}
                <strong className="text-fg">Visão geral</strong> do aplicativo, e reinicie a API.
              </Passo>
            </ol>
          </div>
        ) : !s.conectado ? (
          s.login_pendente && admin ? (
            <div className="flex flex-col gap-4">
              <ol className="flex flex-col gap-3">
                <Passo n={1}>
                  Abra a página da Microsoft:{" "}
                  <a href={s.login_pendente.link} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">
                    {s.login_pendente.link.replace(/^https?:\/\//, "")}
                  </a>
                </Passo>
                <Passo n={2}>Digite este código:</Passo>
              </ol>
              <div className="flex flex-wrap items-center gap-3 sm:pl-9">
                <span className="rounded-xl border border-primary/30 bg-primary-soft px-4 py-2.5 font-mono text-2xl font-semibold tracking-[0.2em] text-fg">
                  {s.login_pendente.codigo}
                </span>
                <Botao
                  variante="ghost"
                  onClick={() =>
                    copiar(s.login_pendente!.codigo).then(
                      () => toast.success("Código copiado"),
                      (e: Error) => toast.error(e.message),
                    )
                  }
                >
                  <Copy /> Copiar
                </Botao>
              </div>
              <ol className="flex flex-col gap-3">
                <Passo n={3}>
                  Entre com a <strong className="text-fg">conta Microsoft da empresa</strong> e aceite as permissões.
                </Passo>
              </ol>
              <p className="flex items-center gap-2 text-sm text-muted sm:pl-9">
                <Loader2 className="size-4 animate-spin text-primary" />
                Aguardando você entrar… o código vale até {fmtDataHora(s.login_pendente.expira_em)}.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted">
                Clique abaixo: o site mostra um código para você digitar na página da Microsoft e entrar com a{" "}
                <strong className="text-fg">conta da empresa</strong>. Depois a conexão se renova sozinha.
              </p>
              {admin ? (
                <div>
                  <Botao variante="primary" onClick={() => conectar.mutate()} carregando={conectar.isPending}>
                    <Plug /> Conectar conta Microsoft
                  </Botao>
                </div>
              ) : (
                <p className="text-sm text-subtle">Peça para um administrador conectar.</p>
              )}
            </div>
          )
        ) : (
          <div className="flex flex-col gap-5">
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div className="min-w-0">
                <dt className="text-xs text-subtle">Conta</dt>
                <dd className="mt-0.5 truncate font-medium" title={s.conta ?? undefined}>
                  {s.nome_conta ?? s.conta ?? "—"}
                </dd>
                {s.nome_conta && s.conta && <dd className="truncate text-xs text-muted">{s.conta}</dd>}
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-subtle">Pasta</dt>
                <dd className="mt-0.5 truncate font-medium">
                  {s.pasta_url ? (
                    <a href={s.pasta_url} target="_blank" rel="noreferrer noopener" className="hover:text-primary hover:underline">
                      {s.pasta_nome ?? "Abrir pasta"}
                    </a>
                  ) : (
                    (s.pasta_nome ?? "—")
                  )}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-subtle">Planilha</dt>
                <dd className="mt-0.5 truncate font-medium">
                  {s.arquivo_url ? (
                    <a href={s.arquivo_url} target="_blank" rel="noreferrer noopener" className="hover:text-primary hover:underline">
                      {s.arquivo_nome}
                    </a>
                  ) : (
                    (s.arquivo_nome ?? "—")
                  )}
                </dd>
              </div>
            </dl>

            {escolherPasta ? (
              admin ? (
                <div className="rounded-xl border border-line bg-bg/40 p-4">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <FolderOpen className="size-4" /> {trocarPasta ? "Trocar a pasta" : "Escolha a pasta da planilha"}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    No OneDrive (ou no SharePoint/Teams), clique com o botão direito na pasta → <strong className="text-fg">Compartilhar</strong> →{" "}
                    <strong className="text-fg">Copiar link</strong> e cole aqui. Também serve o endereço da pasta aberta no navegador, ou o link de uma
                    planilha <strong className="text-fg">.xlsx</strong> que já exista (aí o site passa a substituir esse arquivo).
                  </p>
                  <form
                    className="mt-3 flex flex-col gap-2 sm:flex-row"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (link.trim()) pasta.mutate();
                    }}
                  >
                    <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…sharepoint.com/…" aria-label="Link da pasta" />
                    <Botao type="submit" variante="primary" disabled={!link.trim()} carregando={pasta.isPending}>
                      Usar esta pasta
                    </Botao>
                    {trocarPasta && (
                      <Botao variante="ghost" onClick={() => setTrocarPasta(false)}>
                        Cancelar
                      </Botao>
                    )}
                  </form>
                </div>
              ) : (
                <p className="text-sm text-subtle">Falta um administrador escolher a pasta do OneDrive.</p>
              )
            ) : (
              <div className="rounded-xl border border-line bg-bg/40 p-4 text-sm">
                <p className="font-medium">{s.ultimo_envio ? `Última atualização ${fmtRelativo(s.ultimo_envio)}` : "A planilha ainda não foi enviada"}</p>
                <p className="mt-1 text-muted">
                  O site confere a cada {fmtIntervalo(s.intervalo_segundos)} e só envia a planilha quando algo muda no estoque ou nos produtos próprios.
                </p>
              </div>
            )}

            {s.erro && !escolherPasta && (
              <div className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn-soft p-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
                <div>
                  <p className="font-medium">{s.erro}</p>
                  {s.ultima_tentativa && <p className="mt-1 text-muted">Última tentativa {fmtRelativo(s.ultima_tentativa)}.</p>}
                </div>
              </div>
            )}

            {admin && !escolherPasta && (
              <div className="flex flex-wrap gap-2">
                <Botao variante="primary" onClick={() => sincronizar.mutate()} carregando={sincronizar.isPending}>
                  <RefreshCw /> Atualizar agora
                </Botao>
                <Botao variante="ghost" onClick={() => setTrocarPasta(true)}>
                  <FolderOpen /> Trocar pasta
                </Botao>
                <Botao variante="ghost" onClick={() => setDesconectar(true)} className="hover:text-danger">
                  <Unplug /> Desconectar
                </Botao>
                {s.arquivo_url && (
                  <a href={s.arquivo_url} target="_blank" rel="noreferrer noopener" className="ml-auto">
                    <Botao variante="ghost" tabIndex={-1}>
                      Abrir planilha <ExternalLink />
                    </Botao>
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {desconectar && (
        <Confirmar
          titulo="Desconectar o OneDrive?"
          texto="A planilha para de ser atualizada. O arquivo que já está no OneDrive continua lá, do jeito que está."
          rotulo="Desconectar"
          perigo
          carregando={sair.isPending}
          aoConfirmar={() => sair.mutate()}
          aoFechar={() => setDesconectar(false)}
        />
      )}
    </Card>
  );
}
