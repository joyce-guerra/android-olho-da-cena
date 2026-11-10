'use strict';
/**
 * 2.0: o jeito de dizer cada opção em todas as telas: nome, indicação, contraindicação e descrição.
 * O nome é o rótulo da opção; o resto vem junto, nessa ordem, com cada parte marcada.
 */
(function (raiz) {
const maiuscula = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const ponto = (t) => (/[.!?…:]$/.test(t) ? t : t + '.');
/** "Bom para música." -> "Música." ; "Menos indicado para vídeos alegres." -> "Vídeos alegres." */
function indicacaoDe(t) { return maiuscula(ponto(String(t || '').trim().replace(/^bom para\s+/i, ''))); }
function contraDe(t) { return maiuscula(ponto(String(t || '').trim().replace(/^menos indicado para\s+/i, ''))); }
/** "Indicação: ... Contraindicação: ... Descrição: ..." (partes vazias ficam de fora). */
function descricaoPadrao({ indicacao, contraindicacao, descricao }) {
  const p = [];
  if (indicacao) p.push(`Indicação: ${indicacaoDe(indicacao)}`);
  if (contraindicacao) p.push(`Contraindicação: ${contraDe(contraindicacao)}`);
  if (descricao) p.push(`Descrição: ${ponto(String(descricao).trim())}`);
  return p.join(' ');
}
const api = { descricaoPadrao, indicacaoDe, contraDe };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else raiz.Padrao = api;
})(typeof window !== 'undefined' ? window : globalThis);
