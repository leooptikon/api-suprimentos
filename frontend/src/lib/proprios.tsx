import { CircleCheck, Hammer, MapPin, PowerOff, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "../components/ui";
import type { StatusUnidade } from "./api";

type Tom = "primary" | "ok" | "ai" | "warn" | "neutro";

export const STATUS_UNIDADE: Record<StatusUnidade, { rotulo: string; curto: string; tom: Tom; icone: ReactNode; ajuda: string }> = {
  em_producao: { rotulo: "Em produção", curto: "Produção", tom: "primary", icone: <Wrench className="size-3" />, ajuda: "Peças separadas, sendo montado" },
  pronto: { rotulo: "Pronto (em estoque)", curto: "Prontos", tom: "ok", icone: <CircleCheck className="size-3" />, ajuda: "Montado e guardado, pronto para sair" },
  em_campo: { rotulo: "Em campo", curto: "Em campo", tom: "ai", icone: <MapPin className="size-3" />, ajuda: "Instalado ou em uso fora do escritório" },
  manutencao: { rotulo: "Em manutenção", curto: "Manutenção", tom: "warn", icone: <Hammer className="size-3" />, ajuda: "Voltou para conserto ou ajuste" },
  desativado: { rotulo: "Desativado", curto: "Desativados", tom: "neutro", icone: <PowerOff className="size-3" />, ajuda: "Fora de uso (perdido, descartado…)" },
};

export const ORDEM_STATUS: StatusUnidade[] = ["em_producao", "pronto", "em_campo", "manutencao", "desativado"];

export function BadgeStatusUnidade({ status }: { status: StatusUnidade }) {
  const s = STATUS_UNIDADE[status];
  return (
    <Badge tom={s.tom}>
      {s.icone}
      {s.rotulo}
    </Badge>
  );
}

/** Sugestão de prefixo a partir do nome: "Sensor de visão" → "SDV", "Olie" → "OLIE". */
export function sugerirPrefixo(nome: string) {
  const palavras = nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (!palavras.length) return "";
  if (palavras.length === 1) return palavras[0]!.slice(0, 6);
  return palavras.map((p) => p[0]).join("").slice(0, 6);
}
