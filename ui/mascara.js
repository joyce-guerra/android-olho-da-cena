'use strict';
/**
 * Suavização da máscara de pessoa entre quadros (usada no "Melhorar").
 * Onde a máscara muda pouco (ruído), segue devagar: a borda não treme.
 * Onde muda muito (movimento de verdade), segue rápido: não deixa rastro.
 * Depois, uma curva suave deixa a borda mais firme sem ficar serrilhada.
 * Funciona no programa (worker, via importScripts) e nos testes (require).
 */
(function (raiz) {
  function suavizarMascara(anterior, atual, saida, { lento = 0.4, rapido = 1, limiar = 0.3, baixo = 0.3, alto = 0.7 } = {}) {
    const n = atual.length;
    const faixa = alto - baixo;
    for (let i = 0; i < n; i++) {
      let m = atual[i];
      if (anterior) {
        const p = anterior[i];
        const d = Math.abs(m - p);
        const k = d >= limiar ? rapido : lento + (rapido - lento) * (d / limiar);
        m = p + k * (m - p);
        anterior[i] = m;
      }
      let t = (m - baixo) / faixa;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      saida[i] = Math.round(t * t * (3 - 2 * t) * 255);
    }
    return saida;
  }
  const M = { suavizarMascara };
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  else raiz.Mascara = M;
})(typeof self !== 'undefined' ? self : this);
