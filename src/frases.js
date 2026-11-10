'use strict';
/**
 * Leitura sombreada: divide o texto em frases, do mesmo jeito que o Voz da Cena
 * (não corta em "Sr.", "Dra.", "p. ex.", reticências no meio ou números como 3.5).
 * Cada linha/parágrafo vira um bloco; linhas vazias e espaços sobrando são ignorados.
 */

const ABREVIACOES = ['sr', 'sra', 'srta', 'dr', 'dra', 'prof', 'profa', 'exmo', 'exma', 'ilmo', 'ilma', 'av', 'r', 'n', 'nº', 'no', 'pág', 'pag', 'p', 'pp',
  'cap', 'vol', 'ed', 'etc', 'ex', 'obs', 'fig', 'tel', 'cia', 'ltda', 'jr', 'sto', 'sta', 'gen', 'cel', 'ten', 'sgt', 'pe', 'fr', 'd', 'vs', 'aprox', 'séc', 'sec', 'a.c', 'd.c', 'i.e', 'e.g', 'v', 'cf', 'op', 'cit'];
const ABREV = new Set(ABREVIACOES);

function dividirFrases(paragrafo) {
  const t = String(paragrafo).replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const frases = [];
  let inicio = 0;
  const re = /([.!?…]+)(["'”»)\]]*)\s+(?=["'“«(\[—–-]?\s*[\p{Lu}\d¿¡—–])/gu;
  let m;
  while ((m = re.exec(t))) {
    const antes = t.slice(inicio, m.index);
    const ultima = (/(\S+)$/.exec(antes) || [])[1] || '';
    const palavra = ultima.replace(/^["'“«(\[]+/, '').toLowerCase();
    if (m[1] === '.' && (ABREV.has(palavra) || /^[\p{L}]$/u.test(palavra) || /^(\p{L}\.)+\p{L}$/u.test(palavra))) continue;
    const fim = m.index + m[1].length + m[2].length;
    frases.push(t.slice(inicio, fim).trim());
    inicio = fim;
  }
  const resto = t.slice(inicio).trim();
  if (resto) frases.push(resto);
  return frases.filter(Boolean);
}

/** Texto inteiro (colado ou de arquivo) -> lista de frases, na ordem. */
function frasesDoTexto(texto) {
  const limpo = String(texto || '').replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  // Markdown simples: tira marcas de título, ênfase e listas, que o leitor leria em voz alta.
  const linhas = limpo.split(/\n\s*\n|\n/).map((l) => l.replace(/^\s{0,3}(#{1,6}\s+|[-*+]\s+|>\s?)/, '').replace(/(\*\*|__|\*|_)(\S[^*_]*?\S|\S)\1/g, '$2'));
  const frases = [];
  for (const l of linhas) frases.push(...dividirFrases(l));
  return frases;
}

module.exports = { dividirFrases, frasesDoTexto };
