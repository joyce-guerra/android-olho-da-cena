'use strict';
/** Proporções de saída, qualidades e o recorte central da imagem da câmera. */

const FORMATOS = {
  horizontal: { largura: 1920, altura: 1080, nome: 'horizontal' },
  vertical: { largura: 1080, altura: 1920, nome: 'vertical' },
  quadrado: { largura: 1080, altura: 1080, nome: 'quadrado' }
};
const formatoValido = (f) => (Object.prototype.hasOwnProperty.call(FORMATOS, f) ? f : null);

/** Tamanho do vídeo final: 1080p nas qualidades Alta e Padrão, 720p na Leve. */
function tamanhoSaida(formato, qualidade) {
  const f = FORMATOS[formatoValido(formato) || 'horizontal'];
  const k = qualidade === 'leve' ? 2 / 3 : 1;
  const par = (n) => Math.round((n * k) / 2) * 2;
  return { largura: par(f.largura), altura: par(f.altura) };
}

/**
 * Pedaço da imagem da câmera (vw x vh) que vai para o vídeo, sem deformar:
 * o maior retângulo com a proporção do formato, centralizado (ou, com cx, centrado no ponto dado da largura). No vertical, de uma
 * câmera 16:9, é a faixa do meio; no quadrado, o quadrado do meio.
 */
function recorte(vw, vh, formato, cx) {
  const f = FORMATOS[formatoValido(formato) || 'horizontal'];
  const alvo = f.largura / f.altura;
  if (!vw || !vh) return { sx: 0, sy: 0, sw: 0, sh: 0 };
  if (vw / vh > alvo) {
    const sw = Math.round(vh * alvo);
    // 2.0.7: cx (0 a 1) é onde fica o centro do pedaço na largura da câmera; sem ele, o centro (0,5).
    const c = Number.isFinite(cx) ? Math.min(1, Math.max(0, cx)) : 0.5;
    const sx = Math.min(vw - sw, Math.max(0, Math.round(c * vw - sw / 2)));
    return { sx, sy: 0, sw, sh: vh };
  }
  const sh = Math.round(vw / alvo);
  return { sx: 0, sy: Math.round((vh - sh) / 2), sw: vw, sh };
}

module.exports = { FORMATOS, formatoValido, tamanhoSaida, recorte };
