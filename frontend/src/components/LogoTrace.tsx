/**
 * Logo "Trace" desenhada em SVG. O "T" com o vão no meio vem da marca da Optikon.
 * Usa a cor do texto (currentColor), então funciona nos temas claro e escuro.
 */
export function LogoTrace({ className, neon }: { className?: string; neon?: boolean }) {
  // neon: letra na cor do texto com brilho na cor de destaque em volta (menu lateral)
  return (
    <svg
      viewBox="110 115 1380 309"
      fill="currentColor"
      fillRule="evenodd"
      role="img"
      aria-label="Trace"
      className={className}
      style={
        neon
          ? {
              overflow: "visible",
              filter:
                "drop-shadow(0 0 2px color-mix(in srgb, var(--primary) 90%, transparent)) drop-shadow(0 0 8px color-mix(in srgb, var(--primary) 55%, transparent))",
            }
          : undefined
      }
    >
      {/* T */}
      <path d="M110 124h110v52H110zM219 176h64v237h-64zM282 124h110v52H282z" />
      {/* R */}
      <path d="M413 124H560A91 90 0 0 1 567 303.7L651 413H576L495 308.5H478V413H413ZM478 176H550A37 37 0 0 1 550 250H478Z" />
      {/* A */}
      <path d="M787 124H852L982 413H907L883 356H752.5L728 413H652ZM818 196L862 302H774Z" />
      {/* C */}
      <path d="M1240 176A155 154 0 1 0 1240 363L1187 326A90 93 0 1 1 1187 213Z" />
      {/* E */}
      <path d="M1257 124H1490V177H1323V235H1470V294H1323V357H1490V413H1257Z" />
    </svg>
  );
}

const ROTULO = "Controle de estoque";

/**
 * Logo + "CONTROLE DE ESTOQUE" embaixo, com as letras espalhadas para ocupar
 * exatamente a largura da logo (do T até o E). A largura vem de `className`.
 * Só usa <span> para poder ficar dentro de um <h1>.
 */
export function MarcaTrace({ compacta, className }: { compacta?: boolean; className?: string }) {
  return (
    <span className={`block ${className ?? ""}`}>
      <LogoTrace className="block h-auto w-full text-fg" />
      <span className={`flex justify-between font-mono font-normal text-primary uppercase ${compacta ? "mt-2.5 text-[10px]" : "mt-5 text-[15px]"}`}>
        <span className="sr-only">{ROTULO}</span>
        {[...ROTULO].map((letra, i) => (
          <span key={i} aria-hidden>
            {letra === " " ? " " : letra}
          </span>
        ))}
      </span>
    </span>
  );
}
