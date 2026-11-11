import { ShoppingCart } from "lucide-react";
import type { Produto } from "../lib/api";
import { Botao, cn } from "./ui";

/**
 * Abre a página da loja (fornecedor preferido com link; senão o mais barato).
 * Só aparece para itens esgotados ou no mínimo que tenham algum link cadastrado.
 */
export function BotaoComprar({
  produto,
  compacto,
  className,
}: {
  produto: Pick<Produto, "nome" | "status" | "link_compra" | "loja_compra">;
  compacto?: boolean;
  className?: string;
}) {
  if (produto.status === "ok" || !produto.link_compra) return null;
  const titulo = `Comprar na ${produto.loja_compra}`;
  return (
    <a href={produto.link_compra} target="_blank" rel="noreferrer noopener" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
      <Botao
        variante="ghost"
        tamanho={compacto ? "icon" : "md"}
        title={titulo}
        aria-label={`${titulo}: ${produto.nome}`}
        className={cn("text-warn hover:bg-warn-soft hover:text-warn", className)}
      >
        <ShoppingCart />
        {!compacto && "Comprar"}
      </Botao>
    </a>
  );
}
