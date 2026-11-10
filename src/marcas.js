'use strict';
/**
 * Marcação em lote do Editar vídeo. Alt I abre um trecho, Alt F fecha.
 * Dá pra marcar quantos pares quiser antes de salvar (Alt S) ou descartar
 * (Delete) todos de uma vez. Um início sem fim fica pendente e é ignorado.
 * Funciona no Node (testes) e no navegador (window.Marcas).
 */
(function (raiz) {
  const MINIMO = 0.1; // trecho mais curto que isso não conta

  function criar() {
    return { trechos: [], inicioAberto: null };
  }

  function limpar(m) {
    m.trechos = [];
    m.inicioAberto = null;
  }

  /** Alt I. Um início já aberto é trocado pelo novo. */
  function marcarInicio(m, t) {
    const anterior = m.inicioAberto;
    m.inicioAberto = Math.max(0, t);
    return { substituiu: anterior !== null, anterior };
  }

  /**
   * Alt F. Fecha o início aberto num trecho. Devolve { ok, numero, trecho }
   * ou { ok: false, erro: 'sem-inicio' | 'antes-do-inicio' }.
   */
  function marcarFim(m, t, duracao) {
    if (m.inicioAberto === null) return { ok: false, erro: 'sem-inicio' };
    const fim = duracao ? Math.min(t, duracao) : t;
    if (fim - m.inicioAberto < MINIMO) return { ok: false, erro: 'antes-do-inicio', inicio: m.inicioAberto };
    const trecho = { inicio: m.inicioAberto, fim };
    m.trechos.push(trecho);
    m.inicioAberto = null;
    return { ok: true, numero: m.trechos.length, trecho };
  }

  /** Trechos em ordem de tempo, para salvar um arquivo por trecho. */
  function emOrdem(trechos) {
    return trechos.map((t) => ({ inicio: t.inicio, fim: t.fim })).sort((a, b) => a.inicio - b.inicio);
  }

  /** Para descartar: em ordem e com os que se encostam ou cruzam unidos. */
  function paraDescarte(trechos) {
    const out = [];
    for (const t of emOrdem(trechos)) {
      const ult = out[out.length - 1];
      if (ult && t.inicio <= ult.fim + 0.05) ult.fim = Math.max(ult.fim, t.fim);
      else out.push(t);
    }
    return out;
  }

  /**
   * Nomes dos arquivos do lote. Com um trecho só, o nome escolhido; com mais,
   * o nome escolhido com -01, -02... antes da extensão.
   */
  function nomesNumerados(saida, n) {
    if (n <= 1) return [saida];
    const m = /^(.*?)(\.[^.\\/]+)?$/.exec(saida);
    const base = m[1];
    const ext = m[2] || '';
    const digitos = Math.max(2, String(n).length);
    return Array.from({ length: n }, (_, i) => `${base}-${String(i + 1).padStart(digitos, '0')}${ext}`);
  }

  const api = { criar, limpar, marcarInicio, marcarFim, emOrdem, paraDescarte, nomesNumerados };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Marcas = api;
})(typeof window !== 'undefined' ? window : globalThis);
