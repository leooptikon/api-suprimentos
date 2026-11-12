/** Copia mesmo fora de HTTPS (ex.: acessando pelo IP da rede), onde navigator.clipboard não existe. */
export async function copiar(texto: string) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(texto);
  const area = Object.assign(document.createElement("textarea"), { value: texto });
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("Não foi possível copiar");
}
