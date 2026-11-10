'use strict';
/** Legenda queimada no vídeo: quebra da frase em linhas e tamanho da letra. */

/** Quebra o texto em linhas que caibam em `largura`, medindo com `medir(texto)`. */
function quebrarLinhas(texto, largura, medir) {
  const palavras = String(texto || '').split(/\s+/).filter(Boolean);
  const linhas = [];
  let atual = '';
  for (const p of palavras) {
    const tentativa = atual ? atual + ' ' + p : p;
    if (!atual || medir(tentativa) <= largura) atual = tentativa;
    else { linhas.push(atual); atual = p; }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/**
 * Escolhe o tamanho da letra (do maior para o menor) para a frase caber em até
 * `maxLinhas` linhas. `medirCom(tamanho)` devolve uma função medir(texto).
 * Se nem no menor couber, usa o menor e corta as linhas extras com reticências.
 */
function montarLegenda(texto, { largura, tamanhoMax, tamanhoMin, maxLinhas = 3 }, medirCom) {
  for (let t = tamanhoMax; t >= tamanhoMin; t -= 2) {
    const linhas = quebrarLinhas(texto, largura, medirCom(t));
    if (linhas.length <= maxLinhas) return { tamanho: t, linhas };
  }
  const linhas = quebrarLinhas(texto, largura, medirCom(tamanhoMin));
  if (linhas.length > maxLinhas) {
    linhas.length = maxLinhas;
    linhas[maxLinhas - 1] = linhas[maxLinhas - 1].replace(/[\s.,;:!?…]*$/, '') + '…';
  }
  return { tamanho: tamanhoMin, linhas };
}

/** Medidas da legenda para cada formato (em pixels do vídeo final). */
function medidasLegenda(largura, altura) {
  const vertical = altura > largura;
  const quadrado = altura === largura;
  // Os tamanhos são pensados para 1080 pixels no lado menor; no 720p tudo diminui junto.
  const k = Math.min(largura, altura) / 1080;
  return {
    largura: Math.round(largura * (vertical || quadrado ? 0.86 : 0.8)),
    tamanhoMax: Math.round((vertical ? 64 : 56) * k),
    tamanhoMin: Math.round((vertical ? 40 : 34) * k),
    maxLinhas: 3,
    // No vertical, fica acima da faixa onde o Instagram e o YouTube põem os botões.
    margemBaixo: Math.round(altura * (vertical ? 0.16 : quadrado ? 0.09 : 0.07))
  };
}

module.exports = { quebrarLinhas, montarLegenda, medidasLegenda };
