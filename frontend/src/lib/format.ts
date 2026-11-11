const numero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const relativo = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

export const fmtNum = (n: number) => numero.format(n);
export const fmtMoeda = (n: number) => moeda.format(n);
export const fmtDataHora = (iso: string) => dataHora.format(new Date(iso)).replace(".", "");
export const fmtDiaCurto = (isoDia: string) => dataCurta.format(new Date(`${isoDia}T12:00:00`));
export const fmtDiaMes = (quando: number | Date) => dataCurta.format(quando);
const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
export const fmtHora = (iso: string) => hora.format(new Date(iso));
const diaLongo = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });

/** Chave do dia no fuso local (para agrupar). */
export const chaveDia = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** "Hoje", "Ontem" ou "terça-feira, 4 de novembro". */
export function rotuloDia(iso: string) {
  const alvo = chaveDia(iso);
  const hoje = new Date();
  const ontem = new Date(hoje.getTime() - 86400000);
  if (alvo === chaveDia(hoje.toISOString())) return "Hoje";
  if (alvo === chaveDia(ontem.toISOString())) return "Ontem";
  const s = diaLongo.format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fmtRelativo(iso: string) {
  const seg = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(seg);
  if (abs < 60) return "agora";
  if (abs < 3600) return relativo.format(Math.round(seg / 60), "minute");
  if (abs < 86400) return relativo.format(Math.round(seg / 3600), "hour");
  if (abs < 86400 * 7) return relativo.format(Math.round(seg / 86400), "day");
  return fmtDataHora(iso);
}

export const hojeISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

/** Valor do filtro de local para "produtos sem localização" (igual ao backend). */
export const SEM_LOCAL = "__sem__";

/** Tamanho mínimo da senha (igual ao SENHA_MIN do backend) */
export const SENHA_MIN = 4;

/** Regra do backend: 3 a 40 caracteres, minúsculas, números, ponto, hífen ou _ */
export const USUARIO_VALIDO = /^[a-z0-9._-]{3,40}$/;

export const limparUsuario = (v: string) => v.toLowerCase().replace(/\s+/g, "");

/** Sugestão no estilo "leonc": primeiro nome + inicial do último sobrenome, sem acentos. */
export function sugerirUsuario(nome: string) {
  const partes = nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (!partes.length) return "";
  return partes.length > 1 ? partes[0] + partes[partes.length - 1]![0] : partes[0]!;
}
