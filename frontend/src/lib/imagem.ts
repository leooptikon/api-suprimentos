/**
 * Reduz a foto no próprio navegador antes de enviar (fotos de celular têm 3–8 MB).
 * Resultado: WebP com no máximo `lado` px no maior lado, normalmente 40–120 KB.
 */
export async function reduzirImagem(arquivo: File, lado = 900, qualidade = 0.85): Promise<Blob> {
  if (!arquivo.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem");
  const bitmap = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem");
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();

  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/webp", qualidade));
  // Navegadores sem WebP no canvas devolvem PNG; o backend aceita os dois
  if (!blob) throw new Error("Não foi possível processar a imagem");
  return blob;
}
