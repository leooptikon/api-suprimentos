import cube from "../assets/icones/cube.svg";
import olie from "../assets/icones/olie.svg";
import sense from "../assets/icones/sense.svg";
import { cn } from "./ui";

// Desenhos dos produtos da Optikon, pelo prefixo do nº de série (SENSE-0001, CUBE-0001…)
const ICONES: Record<string, string> = { OLIE: olie, CUBE: cube, SENSE: sense };

export function temIcone(prefixo: string) {
  return prefixo in ICONES;
}

/** Desenho do produto próprio; sem desenho cadastrado, não mostra nada (quem chama usa o ícone padrão). */
export function IconeProprio({ prefixo, className }: { prefixo: string; className?: string }) {
  const src = ICONES[prefixo];
  return src ? <img src={src} alt="" draggable={false} className={cn("size-full object-contain", className)} /> : null;
}
