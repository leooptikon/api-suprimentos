"""Espelho do estoque numa planilha Excel no OneDrive/SharePoint da empresa (Microsoft Graph, grátis).

Fluxo:
1. Um administrador conecta a conta Microsoft da empresa pelo login com código: o site mostra um código,
   a pessoa abre microsoft.com/devicelogin, digita e entra. Não precisa de endereço de retorno nem de
   senha do aplicativo no servidor (no Microsoft Entra o cadastro é um "cliente público").
2. Ela cola o link da pasta do OneDrive (ou de uma planilha .xlsx que já exista lá).
3. A cada ONEDRIVE_INTERVALO segundos o site monta as linhas das abas; se mudaram desde o último envio,
   gera o .xlsx e substitui o arquivo na pasta. É só do site para a planilha: o que for editado na
   planilha é sobrescrito no envio seguinte.

O access token dura ~1 h; o refresh token muda a cada renovação e só vence após 90 dias SEM uso
(como renovamos a toda hora, na prática não vence).
"""

import base64
import hashlib
import json
import logging
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models, relatorios
from .models import agora
from .planilhas import FUSO, pasta_de_trabalho

log = logging.getLogger("suprimentos.onedrive")

LOGIN = os.getenv("MS_LOGIN_URL", "https://login.microsoftonline.com")  # trocáveis só para testes locais
GRAPH = os.getenv("MS_GRAPH_URL", "https://graph.microsoft.com/v1.0")
CLIENT_ID = os.getenv("MS_CLIENT_ID", "")
TENANT_ID = os.getenv("MS_TENANT_ID", "")
ARQUIVO_PADRAO = os.getenv("ONEDRIVE_ARQUIVO", "Estoque Trace.xlsx")
INTERVALO = max(5, int(os.getenv("ONEDRIVE_INTERVALO", "120")))  # segundos entre conferências
ESCOPOS = "offline_access User.Read Files.ReadWrite.All"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class ErroOneDrive(Exception):
    pass


class ErroHTTP(ErroOneDrive):
    """Resposta de erro da Microsoft. O login usa {error, error_description}; o Graph usa {error: {code, message}}."""

    def __init__(self, status: int, dados: dict, bruto: str):
        self.status = status
        erro = dados.get("error")
        if isinstance(erro, dict):
            self.codigo, self.descricao = erro.get("code") or "", erro.get("message") or ""
        else:
            self.codigo, self.descricao = erro or "", dados.get("error_description") or bruto[:300]
        super().__init__(f"A Microsoft respondeu {status}: {self.descricao or self.codigo}")


def configurado() -> bool:
    return bool(CLIENT_ID and TENANT_ID)


# ---------- HTTP (biblioteca padrão; sem dependências extras) ----------
def _http(metodo: str, url: str, token: str | None = None, form: dict | None = None,
          corpo: bytes | None = None, tipo: str | None = None) -> dict:
    dados = urllib.parse.urlencode(form).encode() if form is not None else corpo
    req = urllib.request.Request(url, data=dados, method=metodo)
    req.add_header("Accept", "application/json")
    if form is not None:
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
    elif tipo:
        req.add_header("Content-Type", tipo)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        bruto = e.read().decode(errors="replace")[:2000]
        try:
            j = json.loads(bruto)
        except ValueError:
            j = {}
        raise ErroHTTP(e.code, j if isinstance(j, dict) else {}, bruto) from e
    except urllib.error.URLError as e:
        raise ErroOneDrive(f"Sem conexão com a Microsoft: {e.reason}") from e


# Erros comuns do login da Microsoft (códigos AADSTS…) explicados em português
_ERROS_LOGIN = {
    "AADSTS65001": "A empresa exige que um administrador do Microsoft 365 aprove o aplicativo (“consentimento do administrador”) "
                   "antes do primeiro uso. Peça ao TI para aprovar as permissões do app no Microsoft Entra.",
    "AADSTS90094": "A empresa exige que um administrador do Microsoft 365 aprove o aplicativo antes do primeiro uso. "
                   "Peça ao TI para aprovar as permissões do app no Microsoft Entra.",
    "AADSTS7000218": "No cadastro do aplicativo no Microsoft Entra, abra “Autenticação”, ative “Permitir fluxos de "
                     "clientes públicos” e salve.",
    "AADSTS700016": "O ID do aplicativo (MS_CLIENT_ID) não foi encontrado nesta empresa. Confira MS_CLIENT_ID e MS_TENANT_ID no servidor.",
    "AADSTS90002": "O ID do diretório (MS_TENANT_ID) não foi encontrado. Confira o valor no servidor.",
    "AADSTS900023": "O ID do diretório (MS_TENANT_ID) está em formato errado. Confira o valor no servidor.",
    "AADSTS50020": "Essa conta não pertence à empresa cadastrada. Entre com a conta Microsoft da empresa.",
    "AADSTS50194": "O aplicativo é só da empresa: use o ID do diretório (MS_TENANT_ID) da empresa no servidor.",
}


def _explicar_login(e: ErroHTTP) -> str:
    for codigo, texto in _ERROS_LOGIN.items():
        if codigo in e.descricao:
            return texto
    primeira_linha = (e.descricao or e.codigo).splitlines()[0][:220]
    return f"A Microsoft recusou: {primeira_linha}"


def _explicar_graph(e: ErroHTTP) -> str:
    if e.status == 423 or e.codigo == "resourceLocked":
        return "A planilha está aberta e travada no Excel de alguém. O site tenta de novo daqui a pouco."
    if e.status == 401:
        return "A Microsoft não aceitou a conexão. Se continuar, desconecte e conecte de novo."
    if e.status == 403:
        return "A conta Microsoft conectada não tem permissão para editar essa pasta. Peça acesso de edição ou escolha outra pasta."
    if e.status == 404:
        return "A pasta não foi encontrada (foi apagada, movida ou o link não vale mais). Escolha a pasta de novo."
    if e.status in (429, 503, 504):
        return "A Microsoft pediu para esperar um pouco. O site tenta de novo sozinho."
    return str(e)


# ---------- Conexão (login com código) ----------
def _integracao(db: Session) -> models.IntegracaoOneDrive:
    reg = db.get(models.IntegracaoOneDrive, 1)
    if not reg:
        reg = models.IntegracaoOneDrive(id=1)
        db.add(reg)
        db.flush()
    return reg


def _url_login(acao: str) -> str:
    return f"{LOGIN}/{TENANT_ID}/oauth2/v2.0/{acao}"


def conectado(reg: models.IntegracaoOneDrive | None) -> bool:
    return bool(reg and reg.refresh_token)


def destino_definido(reg: models.IntegracaoOneDrive | None) -> bool:
    return bool(reg and reg.drive_id and reg.pasta_id and reg.arquivo_nome)


def login_pendente(reg: models.IntegracaoOneDrive | None) -> bool:
    return bool(reg and reg.device_code and reg.codigo_expira_em and reg.codigo_expira_em > agora())


def _limpar_login(reg: models.IntegracaoOneDrive):
    reg.device_code = reg.codigo_usuario = reg.link_verificacao = reg.codigo_expira_em = None


def iniciar_login(db: Session) -> models.IntegracaoOneDrive:
    """Pede à Microsoft um código para a pessoa digitar em microsoft.com/devicelogin."""
    if not configurado():
        raise ErroOneDrive("Integração não configurada no servidor (MS_CLIENT_ID e MS_TENANT_ID)")
    try:
        r = _http("POST", _url_login("devicecode"), form={"client_id": CLIENT_ID, "scope": ESCOPOS})
    except ErroHTTP as e:
        raise ErroOneDrive(_explicar_login(e)) from e
    reg = _integracao(db)
    reg.device_code = r["device_code"]
    reg.codigo_usuario = r["user_code"]
    reg.link_verificacao = r.get("verification_uri") or "https://microsoft.com/devicelogin"
    reg.codigo_expira_em = agora() + timedelta(seconds=int(r.get("expires_in", 900)))
    db.commit()
    return reg


def verificar_login(db: Session) -> bool:
    """Pergunta uma vez à Microsoft se a pessoa já entrou. True = conectou; False = ainda esperando."""
    reg = _integracao(db)
    if not reg.device_code:
        raise ErroOneDrive("Nenhum login em andamento. Clique em “Conectar” de novo.")
    if not login_pendente(reg):
        _limpar_login(reg)
        db.commit()
        raise ErroOneDrive("O código expirou. Clique em “Conectar” para gerar outro.")
    try:
        r = _http(
            "POST",
            _url_login("token"),
            form={
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                "client_id": CLIENT_ID,
                "device_code": reg.device_code,
            },
        )
    except ErroHTTP as e:
        if e.codigo in ("authorization_pending", "slow_down"):
            return False
        _limpar_login(reg)
        db.commit()
        if e.codigo == "authorization_declined":
            raise ErroOneDrive("O acesso foi recusado na tela da Microsoft.") from e
        if e.codigo == "expired_token":
            raise ErroOneDrive("O código expirou. Clique em “Conectar” para gerar outro.") from e
        raise ErroOneDrive(_explicar_login(e)) from e

    _guardar_tokens(reg, r)
    _limpar_login(reg)
    reg.conectado_em = agora()
    reg.erro = None
    try:
        eu = _http("GET", f"{GRAPH}/me?$select=displayName,userPrincipalName,mail", token=reg.access_token)
        reg.nome_conta = (eu.get("displayName") or "")[:160] or None
        reg.conta = (eu.get("mail") or eu.get("userPrincipalName") or "")[:160] or None
    except ErroOneDrive:
        pass
    db.commit()
    return True


def _guardar_tokens(reg: models.IntegracaoOneDrive, resp: dict):
    reg.access_token = resp["access_token"]
    reg.refresh_token = resp.get("refresh_token") or reg.refresh_token
    reg.expira_em = agora() + timedelta(seconds=int(resp.get("expires_in", 3600)))


_trava_token = threading.Lock()


def token_valido(db: Session) -> str:
    """Access token válido, renovando quando faltar menos de 5 min (a trava evita duas renovações juntas)."""
    with _trava_token:
        reg = _integracao(db)
        if not reg.refresh_token:
            raise ErroOneDrive("A conta Microsoft não está conectada.")
        if reg.access_token and reg.expira_em and reg.expira_em - agora() > timedelta(minutes=5):
            return reg.access_token
        try:
            r = _http(
                "POST",
                _url_login("token"),
                form={"grant_type": "refresh_token", "client_id": CLIENT_ID, "refresh_token": reg.refresh_token, "scope": ESCOPOS},
            )
        except ErroHTTP as e:
            if e.codigo == "invalid_grant":
                # Senha trocada, acesso revogado ou 90 dias sem uso: só conectando de novo
                reg.access_token = reg.refresh_token = reg.expira_em = None
                db.commit()
                raise ErroOneDrive("A conexão com a Microsoft expirou ou foi cancelada. Conecte a conta de novo.") from e
            raise ErroOneDrive(_explicar_login(e)) from e
        _guardar_tokens(reg, r)
        db.commit()  # grava o refresh token novo na hora
        return reg.access_token


def desconectar(db: Session):
    """Esquece a conta e as pastas. Os projetos já lidos continuam (as unidades apontam para eles)."""
    reg = _integracao(db)
    for campo in ("access_token", "refresh_token", "expira_em", "conta", "nome_conta", "conectado_em", "drive_id",
                  "pasta_id", "pasta_nome", "pasta_url", "arquivo_nome", "arquivo_url", "ultimo_hash", "ultimo_envio",
                  "ultima_tentativa", "erro", "projetos_drive_id", "projetos_pasta_id", "projetos_pasta_nome",
                  "projetos_pasta_url", "projetos_lidos_em", "projetos_erro"):
        setattr(reg, campo, None)
    _limpar_login(reg)
    db.commit()


# ---------- Pasta de destino ----------
def _q(parte: str) -> str:
    """Escapa um pedaço do caminho da URL do Graph (ids de drive têm '!', que pode ficar)."""
    return urllib.parse.quote(parte, safe="!")


def _codificar_link(url: str) -> str:
    """Formato que o Graph pede em /shares/{id}: 'u!' + base64url sem '='."""
    return "u!" + base64.urlsafe_b64encode(url.encode()).decode().rstrip("=")


def _candidatos(link: str) -> list[str]:
    """O link de compartilhamento funciona direto. O endereço da pasta aberta no navegador
    (…/onedrive.aspx?id=/personal/…/Documents/Pasta) vira o endereço “real” da pasta."""
    candidatos = [link]
    p = urllib.parse.urlparse(link)
    params = urllib.parse.parse_qs(p.query)
    for nome in ("id", "RootFolder"):
        caminho = (params.get(nome) or [""])[0]
        if caminho.startswith("/"):
            candidatos.insert(0, f"{p.scheme}://{p.netloc}{urllib.parse.quote(caminho)}")
    # Atalho para pasta de outra pessoa (…/my?remoteItem={"mp":{…},"rsi":{…}}): "rsi" é a pasta de verdade
    remoto = (params.get("remoteItem") or [""])[0]
    if remoto:
        try:
            dados = json.loads(remoto)
        except ValueError:
            dados = {}
        for chave in ("mp", "rsi"):  # inserido no início: rsi fica primeiro
            d = dados.get(chave) or {}
            web, pasta = d.get("webAbsoluteUrl"), d.get("rootFolder")
            if web and pasta and pasta.startswith("/"):
                u = urllib.parse.urlparse(web)
                candidatos.insert(0, f"{u.scheme}://{u.netloc}{urllib.parse.quote(pasta)}")
    return candidatos


def _nome_da_pasta(ref: dict) -> str | None:
    if ref.get("name"):
        return ref["name"]
    caminho = (ref.get("path") or "").split(":", 1)[-1].strip("/")
    return caminho.rsplit("/", 1)[-1] if caminho else None


def _resolver_link(token: str, link: str) -> tuple[dict, str]:
    """Item do OneDrive (pasta ou arquivo) apontado pelo link + id do drive onde ele está."""
    link = link.strip()
    if not link.startswith(("https://", "http://")):
        raise ErroOneDrive("Cole o link de uma pasta do OneDrive ou SharePoint (começa com https://).")
    item, ultimo_erro = None, None
    for candidato in _candidatos(link):
        try:
            item = _http("GET", f"{GRAPH}/shares/{_codificar_link(candidato)}/driveItem", token=token)
            break
        except ErroHTTP as e:
            ultimo_erro = e
    if item is None:
        if ultimo_erro and ultimo_erro.status in (400, 403, 404):
            raise ErroOneDrive(
                "Não consegui abrir esse link com a conta conectada. No OneDrive, use “Compartilhar” → “Copiar link” "
                "da pasta e confira se essa conta tem acesso a ela."
            )
        raise ErroOneDrive(_explicar_graph(ultimo_erro)) if ultimo_erro else ErroOneDrive("Link inválido")
    if "remoteItem" in item:  # atalho "Adicionar ao meu OneDrive": usa a pasta original
        item = {**item["remoteItem"], "name": item["remoteItem"].get("name") or item.get("name")}
    drive_id = (item.get("parentReference") or {}).get("driveId")
    if not drive_id:
        raise ErroOneDrive("Não consegui identificar o OneDrive dessa pasta. Tente o link de uma pasta dentro dele.")
    return item, drive_id


def definir_destino(db: Session, link: str) -> models.IntegracaoOneDrive:
    """Guarda a pasta (ou a pasta da planilha indicada) e envia a planilha na hora."""
    item, drive_id = _resolver_link(token_valido(db), link)
    pai = item.get("parentReference") or {}
    reg = _integracao(db)
    if "folder" in item:
        reg.pasta_id, reg.pasta_nome, reg.pasta_url = item["id"], item.get("name"), item.get("webUrl")
        reg.arquivo_nome, reg.arquivo_url = ARQUIVO_PADRAO, None
    elif "file" in item and (item.get("name") or "").lower().endswith(".xlsx") and pai.get("id"):
        # Link de uma planilha que já existe: o site passa a substituir esse arquivo
        reg.pasta_id, reg.pasta_nome, reg.pasta_url = pai["id"], _nome_da_pasta(pai), None
        reg.arquivo_nome, reg.arquivo_url = item["name"], item.get("webUrl")
    else:
        raise ErroOneDrive("Esse link não é de uma pasta nem de uma planilha .xlsx. Use o link da pasta.")
    reg.drive_id = drive_id
    reg.ultimo_hash = None  # destino novo: envia mesmo sem mudança no estoque
    reg.erro = None
    db.commit()
    try:
        sincronizar(db, forcar=True)
    except ErroOneDrive:
        pass  # a pasta fica salva; o motivo aparece em reg.erro e o envio é tentado de novo sozinho
    return reg


# ---------- Projetos: subpastas no formato "21.40 - TM ENGENHARIA" ----------
_PASTA_PROJETO = re.compile(r"^\s*(\d+(?:\.\d+)*)\s*[-–—]\s*\S")
LER_PROJETOS_A_CADA = timedelta(minutes=10)


def chave_codigo(codigo: str) -> tuple[int, ...]:
    """'21.40' → (21, 40): ordena 21.0, 21.5, 21.40 nessa ordem (e não como texto)."""
    return tuple(int(p) for p in codigo.split(".") if p.isdigit())


def definir_pasta_projetos(db: Session, link: str) -> dict:
    """Guarda a pasta onde ficam as pastas dos projetos e já lê os projetos."""
    item, drive_id = _resolver_link(token_valido(db), link)
    if "folder" not in item:
        raise ErroOneDrive("Esse link não é de uma pasta. Use o link da pasta onde ficam as pastas dos projetos.")
    reg = _integracao(db)
    reg.projetos_drive_id, reg.projetos_pasta_id = drive_id, item["id"]
    reg.projetos_pasta_nome, reg.projetos_pasta_url = item.get("name"), item.get("webUrl")
    reg.projetos_erro = None
    db.commit()
    return ler_projetos(db)


_trava_projetos = threading.Lock()


def ler_projetos(db: Session) -> dict:
    """Lê as subpastas e atualiza a tabela de projetos. O nome do projeto é exatamente o nome da pasta.

    Pasta nova vira projeto; pasta renomeada atualiza o nome (o id da pasta não muda); pasta que sumiu
    sai da lista de escolha, mas as unidades que estavam nela continuam mostrando o projeto.
    """
    with _trava_projetos:
        reg = _integracao(db)
        if not conectado(reg) or not reg.projetos_pasta_id:
            raise ErroOneDrive("Conecte a conta Microsoft (em Integrações) e escolha a pasta dos projetos primeiro.")
        try:
            token = token_valido(db)
            itens: list[dict] = []
            url = f"{GRAPH}/drives/{_q(reg.projetos_drive_id)}/items/{_q(reg.projetos_pasta_id)}/children?$select=id,name,folder,webUrl&$top=999"
            while url:
                r = _http("GET", url, token=token)
                itens += r.get("value") or []
                url = r.get("@odata.nextLink")
        except ErroHTTP as e:
            reg.projetos_erro = _explicar_graph(e)[:500]
            db.commit()
            raise ErroOneDrive(reg.projetos_erro) from e
        except ErroOneDrive as e:
            reg.projetos_erro = str(e)[:500]
            db.commit()
            raise

        pastas = [(i, m.group(1)) for i in itens if "folder" in i and (m := _PASTA_PROJETO.match(i.get("name") or ""))]
        existentes = {p.pasta_id: p for p in db.scalars(select(models.Projeto))}
        novos = renomeados = sumiram = 0
        vistos = set()
        for item, codigo in pastas:
            nome = item["name"][:255]
            p = existentes.get(item["id"])
            if p is None:
                db.add(models.Projeto(nome=nome, codigo=codigo, pasta_id=item["id"], url=item.get("webUrl"), no_onedrive=True))
                novos += 1
            else:
                renomeados += p.nome != nome
                p.nome, p.codigo, p.url, p.no_onedrive = nome, codigo, item.get("webUrl") or p.url, True
            vistos.add(item["id"])
        for pasta_id, p in existentes.items():
            if pasta_id not in vistos and p.no_onedrive:
                p.no_onedrive = False
                sumiram += 1
        reg.projetos_lidos_em = agora()
        reg.projetos_erro = None
        db.commit()
        return {"total": len(pastas), "novos": novos, "renomeados": renomeados, "sumiram": sumiram}


# ---------- Envio da planilha ----------
def _abas(db: Session) -> list[tuple[str, list[str], list[list]]]:
    return [
        ("Produtos", *relatorios.estoque(db)),
        ("Produtos próprios", *relatorios.proprios(db)),
        ("Fornecedores", *relatorios.fornecedores(db)),
    ]


def _aba_sobre() -> tuple[str, list[str], list[list]]:
    return (
        "Sobre",
        ["Informação", "Valor"],
        [
            ["Gerada por", "Site Trace (controle de estoque)"],
            ["Atualizada em", datetime.now(FUSO).strftime("%d/%m/%Y %H:%M")],
            ["Atenção", "Esta planilha é atualizada automaticamente pelo site. O que for alterado aqui é substituído."],
        ],
    )


def _enviar(token: str, reg: models.IntegracaoOneDrive, conteudo: bytes) -> dict:
    url = f"{GRAPH}/drives/{_q(reg.drive_id)}/items/{_q(reg.pasta_id)}:/{_q(reg.arquivo_nome)}:/content"
    return _http("PUT", url, token=token, corpo=conteudo, tipo=XLSX)


_trava_envio = threading.Lock()


def sincronizar(db: Session, forcar: bool = False) -> bool:
    """Envia a planilha se o conteúdo mudou desde o último envio (ou sempre, com `forcar`).

    True = enviou; False = nada mudou. Em caso de erro, o motivo fica em reg.erro e sobe como ErroOneDrive.
    """
    if not _trava_envio.acquire(timeout=90):
        raise ErroOneDrive("Já existe um envio em andamento. Tente de novo em instantes.")
    try:
        reg = _integracao(db)
        if not conectado(reg) or not destino_definido(reg):
            raise ErroOneDrive("Conecte a conta Microsoft e escolha a pasta primeiro.")
        abas = _abas(db)
        assinatura = hashlib.sha256(json.dumps(abas, default=str, ensure_ascii=False).encode()).hexdigest()
        # Igual ao último envio e sem erro pendente: nada a fazer. Com erro, tenta de novo mesmo sem mudança
        # (ex.: "Atualizar agora" falhou com a planilha travada e depois ninguém mexeu no estoque)
        if assinatura == reg.ultimo_hash and not forcar and not reg.erro:
            return False
        reg.ultima_tentativa = agora()
        try:
            item = _enviar(token_valido(db), reg, pasta_de_trabalho(abas + [_aba_sobre()]))
        except ErroHTTP as e:
            if e.status == 401:
                reg.expira_em = agora()  # força renovar o token na próxima tentativa
            reg.erro = _explicar_graph(e)[:500]
            db.commit()
            raise ErroOneDrive(reg.erro) from e
        except ErroOneDrive as e:
            reg.erro = str(e)[:500]
            db.commit()
            raise
        reg.ultimo_hash = assinatura
        reg.ultimo_envio = agora()
        reg.erro = None
        reg.arquivo_url = item.get("webUrl") or reg.arquivo_url
        db.commit()
        return True
    finally:
        _trava_envio.release()


def iniciar_agendador(fabrica_sessao):
    """A cada INTERVALO segundos confere se o estoque mudou (e, se mudou, envia a planilha);
    a cada LER_PROJETOS_A_CADA relê as pastas dos projetos."""

    def laco():
        while True:
            time.sleep(INTERVALO)
            try:
                with fabrica_sessao() as db:
                    reg = db.get(models.IntegracaoOneDrive, 1)
                    if conectado(reg) and destino_definido(reg) and sincronizar(db):
                        log.info("Planilha do OneDrive atualizada")
            except ErroOneDrive as e:
                log.warning("OneDrive: %s", e)
            except Exception:  # o agendador nunca pode morrer por causa de um envio com erro
                log.exception("Falha ao atualizar a planilha do OneDrive")
            try:
                with fabrica_sessao() as db:
                    reg = db.get(models.IntegracaoOneDrive, 1)
                    if (
                        conectado(reg)
                        and reg.projetos_pasta_id
                        and (not reg.projetos_lidos_em or agora() - reg.projetos_lidos_em >= LER_PROJETOS_A_CADA)
                    ):
                        r = ler_projetos(db)
                        if r["novos"] or r["renomeados"] or r["sumiram"]:
                            log.info("Projetos do OneDrive: %s", r)
            except ErroOneDrive as e:
                log.warning("Projetos do OneDrive: %s", e)
            except Exception:
                log.exception("Falha ao ler os projetos do OneDrive")

    threading.Thread(target=laco, name="espelho-onedrive", daemon=True).start()
