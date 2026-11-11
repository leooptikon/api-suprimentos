import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Link2, Plug, RefreshCw, ShoppingBag, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useInvalidar } from "../components/acoes";
import { useAuth } from "../components/auth";
import { CabecalhoPagina } from "../components/Layout";
import { Badge, Botao, Card, Confirmar, Esqueleto, Input } from "../components/ui";
import { api, type StatusML } from "../lib/api";
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

  // Volta do Mercado Livre direto para cá (quando o redirect aponta para este servidor)
  useEffect(() => {
    if (params.get("conectado")) toast.success("Conta do Mercado Livre conectada");
    if (params.get("erro")) toast.error(params.get("erro")!);
    if (params.get("conectado") || params.get("erro")) setParams({}, { replace: true });
  }, [params, setParams]);

  return (
    <>
      <CabecalhoPagina titulo="Integrações" descricao="Conexões com serviços de fora do site." />
      {status.isLoading || !status.data ? (
        <Esqueleto className="h-72 rounded-xl" />
      ) : (
        <CartaoMercadoLivre s={status.data} admin={admin} />
      )}
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
                    O Mercado Livre não enviou a permissão de renovação. No DevCenter, edite a aplicação, ative <strong className="text-fg">acesso offline</strong>{" "}
                    (offline_access / refresh token), salve e depois clique em <strong className="text-fg">Desconectar</strong> e conecte de novo.
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
