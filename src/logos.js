'use strict';

/**
 * Logo (marca) no vídeo.
 *
 * Dois modos, para o logo nunca cobrir a imagem:
 *   - "titulo": aparece junto de cada título, logo acima do texto, com o mesmo
 *     fade. Quem troca o título não precisa mexer no logo.
 *   - "faixa": fica o tempo todo (ou num trecho) numa faixa fina no topo do
 *     vídeo. As imagens são encaixadas no espaço que sobra, então nada é
 *     coberto. A cor da faixa é escolhida pelo programa, para o logo sempre
 *     aparecer bem.
 * Tamanho, sombra e fundo transparente também são decididos pelo programa:
 * quem monta o vídeo pode não ver a tela.
 */

const MODOS = [
  { id: 'titulo', nome: 'junto de cada título' },
  { id: 'faixa', nome: 'na faixa do topo' }
];

// Altura da faixa, em fração da altura do vídeo, e o quanto dela o logo ocupa.
const FAIXA_FRACAO = 0.09;
const FAIXA_OCUPACAO = 0.7;
const COR_FAIXA_CLARA = '0xF2EEE6';
const COR_FAIXA_ESCURA = '0x101010';

// O tamanho de cada logo é calculado pela forma dela, para ocupar mais ou menos
// a mesma área na tela, seja larga, quadrada ou alta. A pessoa só escolhe entre
// três palavras; nunca precisa ver números.
const TAMANHOS = { pequeno: 0.7, medio: 1, grande: 1.4 };
const TAMANHO_PADRAO = 'medio';
const AREA_BASE = 0.02;      // fatia do quadro ocupada por um logo médio
const LARGURA_MIN = 0.04;    // limites, em fração da largura do vídeo
const LARGURA_MAX = 0.4;
const FADE = 0.4;

// Estilo de logo de cada preset: escala do tamanho, força da sombra (0 a 1),
// duração do fade em segundos e margem da borda, em fração do lado menor.
const ESTILO_PADRAO = { escala: 1, sombra: 0.6, fade: FADE, margem: 0.035 };
const MAXIMO_LOGOS = 6;

const FORMATOS_COM_ALFA = new Set([
  'rgba', 'bgra', 'argb', 'abgr', 'ya8', 'ya16be', 'ya16le', 'gbrap',
  'rgba64be', 'rgba64le', 'bgra64be', 'bgra64le', 'yuva420p', 'yuva422p',
  'yuva444p', 'pal8'
]);

function temCanalAlfa(pixFmt) {
  return FORMATOS_COM_ALFA.has(String(pixFmt || '').toLowerCase());
}

/** Largura do logo em pixels, par, a partir da forma dele. */
function larguraDoLogo({ larguraVideo, alturaVideo, largura, altura, tamanho, escala = 1 }) {
  const mult = (TAMANHOS[tamanho] || 1) * escala;
  const forma = largura > 0 && altura > 0 ? largura / altura : 1;
  let lw = Math.sqrt(AREA_BASE * larguraVideo * alturaVideo * forma) * mult;
  lw = Math.min(Math.max(lw, larguraVideo * LARGURA_MIN), larguraVideo * LARGURA_MAX);
  // Não amplia a imagem além de um pouco mais que o tamanho original.
  if (largura > 0) lw = Math.min(lw, largura * 1.25);
  return Math.max(16, Math.round(lw / 2) * 2);
}

function nomeDoTamanho(t) {
  return t === 'pequeno' ? 'pequeno' : t === 'grande' ? 'grande' : 'médio';
}

function nomeDoModo(id) {
  const m = MODOS.find((x) => x.id === id);
  return m ? m.nome : id;
}

/** Altura da faixa em pixels, par. */
function alturaFaixa(alturaVideo) {
  return Math.max(2, Math.round((alturaVideo * FAIXA_FRACAO) / 2) * 2);
}

/**
 * Cor da faixa, pelo primeiro logo que vai nela. Fundo liso no próprio logo: a
 * faixa tem a mesma cor, e o logo se emenda nela sem recorte. Senão, faixa
 * clara para logo escuro e faixa escura para logo claro.
 */
function corDaFaixa(logos) {
  const ref = (logos || []).find((l) => l.modo === 'faixa');
  if (!ref) return { cor: COR_FAIXA_ESCURA, ref: null, semRecorte: false };
  if (ref.removerFundo && ref.corFundo) return { cor: ref.corFundo, ref, semRecorte: true };
  const claro = typeof ref.luminancia === 'number' ? ref.luminancia >= 0.5 : false;
  return { cor: claro ? COR_FAIXA_ESCURA : COR_FAIXA_CLARA, ref, semRecorte: false };
}

/** Mensagem se dois logos da faixa aparecem ao mesmo tempo; senão, null. */
function conflitoNaFaixa(logos, duracao) {
  const lista = (logos || [])
    .map((l, i) => ({ l, i }))
    .filter((x) => x.l.modo === 'faixa')
    .sort((m, n) => (m.l.inicio || 0) - (n.l.inicio || 0));
  for (let k = 1; k < lista.length; k++) {
    const ant = lista[k - 1];
    const fimAnt = ant.l.fim != null ? ant.l.fim : (duracao || Infinity);
    if ((lista[k].l.inicio || 0) < fimAnt - 0.01) {
      return `O logo ${ant.i + 1} e o logo ${lista[k].i + 1} ficam na faixa ao mesmo tempo. ` +
        'A faixa tem lugar para um logo por vez: acerte o fim de um ou o início do outro.';
    }
  }
  return null;
}

function hex(n) {
  return n.toString(16).padStart(2, '0').toUpperCase();
}

/** Valida um logo. Devolve a lista de problemas (vazia se está tudo certo). */
function validarLogo(l, duracaoVideo) {
  const erros = [];
  if (!l || !l.caminho) erros.push('Falta escolher a imagem do logo.');
  if (!MODOS.some((m) => m.id === (l && l.modo))) erros.push('Escolha onde o logo aparece: junto do título ou na faixa.');
  if (l && l.modo === 'faixa') {
    const ini = l.inicio || 0;
    if (!(ini >= 0)) erros.push('O início do logo é inválido.');
    if (duracaoVideo && ini >= duracaoVideo) erros.push('O logo começaria depois do fim do vídeo.');
    if (l.fim != null && !(l.fim > ini)) erros.push('O fim do logo precisa ser depois do início.');
  }
  return erros;
}

/** Par mais próximo, no mínimo 2. */
function par(n) {
  return Math.max(2, Math.round(n / 2) * 2);
}

/** Tamanho do logo na faixa: ocupa a faixa, sem passar de 40% da largura. */
function tamanhoNaFaixa({ larguraVideo, faixaPx, largura, altura }) {
  const forma = largura > 0 && altura > 0 ? largura / altura : 1;
  let lh = faixaPx * FAIXA_OCUPACAO;
  let lw = lh * forma;
  if (lw > larguraVideo * LARGURA_MAX) { lw = larguraVideo * LARGURA_MAX; lh = lw / forma; }
  if (largura > 0 && lw > largura * 1.25) { lw = largura * 1.25; lh = lw / forma; }
  return { lw: par(lw), lh: par(lh) };
}

/** Tamanho do logo que acompanha o título: pela forma, sem passar de 12% da altura. */
function tamanhoComTitulo({ larguraVideo, alturaVideo, largura, altura, escala = 1 }) {
  const forma = largura > 0 && altura > 0 ? largura / altura : 1;
  let lw = larguraDoLogo({ larguraVideo, alturaVideo, largura, altura, tamanho: 'medio', escala });
  let lh = lw / forma;
  if (lh > alturaVideo * 0.12) { lh = alturaVideo * 0.12; lw = lh * forma; }
  return { lw: par(lw), lh: par(lh) };
}

/**
 * Argumentos do FFmpeg para aplicar todos os logos de uma vez.
 *
 * `video` já vem com as imagens encaixadas abaixo da faixa (quando há faixa).
 * `ocorrencias` são os momentos em que um título aparece: { inicio, fim,
 * entrada, baixoY }, com baixoY em pixels do vídeo final (onde fica a base do
 * logo, logo acima do texto). O vídeo é recodificado; o áudio é copiado.
 */
function argsAplicarLogos({
  video, logos, formato, duracao, estilo, ocorrencias, faixaPx, fps, fadeFaixa, saida
}) {
  const W = formato.largura;
  const H = formato.altura;
  const e = { ...ESTILO_PADRAO, ...(estilo || {}) };
  const faixa = faixaPx > 0 ? faixaPx : 0;
  const { cor, ref, semRecorte } = corDaFaixa(logos);
  const ocs = Array.isArray(ocorrencias) ? ocorrencias : [];

  const args = ['-y', '-i', video];
  const partes = [];
  let atual = '[0:v]';
  let contador = 0;
  const proximo = () => `[n${contador++}]`;

  if (faixa) {
    const fi = (fadeFaixa && fadeFaixa.entrada) || 0;
    const fo = (fadeFaixa && fadeFaixa.saida) || 0;
    let fundo = `color=c=${cor}:s=${W}x${H}:r=${fps || 30}:d=${duracao.toFixed(3)},format=rgb24`;
    if (fi > 0) fundo += `,fade=t=in:st=0:d=${fi.toFixed(3)}`;
    if (fo > 0) fundo += `,fade=t=out:st=${Math.max(0, duracao - fo).toFixed(3)}:d=${fo.toFixed(3)}`;
    partes.push(`${fundo}[bg]`);
    partes.push(`[bg]${atual}overlay=x=0:y=${faixa}:format=auto:eof_action=pass${proximo()}`);
    atual = `[n${contador - 1}]`;
  }

  // Logos que acompanham o título formam uma fila centralizada.
  const delTitulo = [];
  logos.forEach((l, k) => { if (l.modo === 'titulo') delTitulo.push({ l, k }); });
  let fila = null;
  if (delTitulo.length && ocs.length) {
    const medidas = delTitulo.map(({ l }) => tamanhoComTitulo({
      larguraVideo: W, alturaVideo: H, largura: l.largura, altura: l.altura, escala: e.escala
    }));
    const vao = Math.round(W * 0.02);
    let total = medidas.reduce((a, m) => a + m.lw, 0) + vao * (medidas.length - 1);
    if (total > W * 0.85) {
      const f = (W * 0.85) / total;
      medidas.forEach((m, i) => { medidas[i] = { lw: par(m.lw * f), lh: par(m.lh * f) }; });
      total = medidas.reduce((a, m) => a + m.lw, 0) + vao * (medidas.length - 1);
    }
    let x = Math.round((W - total) / 2);
    const xs = medidas.map((m) => { const r = x; x += m.lw + vao; return r; });
    fila = { medidas, xs, altura: Math.max(...medidas.map((m) => m.lh)) };
  }

  logos.forEach((l, k) => {
    args.push('-loop', '1', '-framerate', '30', '-t', duracao.toFixed(3), '-i', l.caminho);
    const entrada = `[${k + 1}:v]`;

    const base = ['format=rgba'];
    const tiraFundo = l.removerFundo && l.corFundo && !(semRecorte && l === ref);
    if (tiraFundo) base.push(`colorkey=${l.corFundo}:0.16:0.06`, 'format=rgba');

    if (l.modo === 'faixa') {
      if (!faixa) return;
      const { lw, lh } = tamanhoNaFaixa({ larguraVideo: W, faixaPx: faixa, largura: l.largura, altura: l.altura });
      const ini = Math.max(0, l.inicio || 0);
      const fim = l.fim != null ? Math.min(l.fim, duracao) : null;
      const cadeia = [...base, `scale=${lw}:${lh}`, 'format=rgba',
        `fade=t=in:st=${ini.toFixed(3)}:d=${e.fade}:alpha=1`];
      if (fim != null && fim < duracao - 0.05) {
        cadeia.push(`fade=t=out:st=${Math.max(ini, fim - e.fade).toFixed(3)}:d=${e.fade}:alpha=1`);
      }
      partes.push(`${entrada}${cadeia.join(',')}[lg${k}]`);
      const x = Math.round((W - lw) / 2);
      const y = Math.round((faixa - lh) / 2);
      partes.push(`${atual}[lg${k}]overlay=x=${x}:y=${y}:format=auto:eof_action=pass${proximo()}`);
      atual = `[n${contador - 1}]`;
      return;
    }

    // Junto do título.
    if (!fila) return;
    const idx = delTitulo.findIndex((d) => d.k === k);
    const { lw, lh } = fila.medidas[idx];
    const cadeia = [...base, `scale=${lw}:${lh}`, 'format=rgba'];
    let desl = 0;
    let rotulo = `[pl${k}]`;
    if (l.sombra !== false) {
      const p = Math.round(lw * 0.05) + 2;
      const raio = Math.max(2, Math.round(lw * 0.02));
      desl = Math.max(2, Math.round(lw * 0.02));
      partes.push(`${entrada}${cadeia.join(',')},split=2[lg${k}][sb${k}]`);
      partes.push(
        `[sb${k}]pad=iw+${2 * p}:ih+${2 * p}:${p}:${p}:color=black@0,` +
        `colorchannelmixer=rr=0:rg=0:rb=0:gr=0:gg=0:gb=0:br=0:bg=0:bb=0:aa=${e.sombra},` +
        `boxblur=${raio}:1[sh${k}]`
      );
      partes.push(`[sh${k}][lg${k}]overlay=x=${p - desl}:y=${p - desl}:format=rgb[ps${k}]`);
      desl = p - desl;
      rotulo = `[ps${k}]`;
    } else {
      partes.push(`${entrada}${cadeia.join(',')}[pl${k}]`);
    }

    const n = ocs.length;
    if (n === 1) partes.push(`${rotulo}null[c${k}_0]`);
    else partes.push(`${rotulo}split=${n}${ocs.map((_, i) => `[c${k}_${i}]`).join('')}`);

    ocs.forEach((o, i) => {
      const f = Math.max(0.05, o.entrada || 0.4);
      const ini = Math.max(0, o.inicio);
      const fim = Math.min(duracao, o.fim);
      if (fim - ini < 0.1) { partes.push(`[c${k}_${i}]nullsink`); return; }
      const cad = `fade=t=in:st=${ini.toFixed(3)}:d=${f.toFixed(3)}:alpha=1,` +
        `fade=t=out:st=${Math.max(ini, fim - f).toFixed(3)}:d=${f.toFixed(3)}:alpha=1`;
      partes.push(`[c${k}_${i}]${cad}[q${k}_${i}]`);
      const x = fila.xs[idx] - desl;
      const y = Math.max(0, Math.round(o.baixoY - fila.altura + (fila.altura - lh) / 2) - desl);
      partes.push(`${atual}[q${k}_${i}]overlay=x=${x}:y=${y}:format=auto:eof_action=pass${proximo()}`);
      atual = `[n${contador - 1}]`;
    });
  });

  partes.push(`${atual}format=yuv420p[v]`);

  args.push(
    '-filter_complex', partes.join(';'),
    '-map', '[v]',
    '-map', '0:a?',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-c:a', 'copy',
    '-t', duracao.toFixed(3),
    '-movflags', '+faststart',
    saida
  );
  return args;
}

/** Frase falada que descreve um logo na lista. Só o que a pessoa escolheu. */
function descreverLogo(l, numero, total, formatarTempo) {
  if (l.modo === 'titulo') {
    return `Logo ${numero} de ${total}: ${l.nome}, aparece junto de cada título.`;
  }
  const trecho = l.fim != null
    ? `de ${formatarTempo(l.inicio || 0)} até ${formatarTempo(l.fim)}`
    : (l.inicio ? `de ${formatarTempo(l.inicio)} até o fim` : 'o vídeo inteiro');
  return `Logo ${numero} de ${total}: ${l.nome}, na faixa do topo, ${trecho}.`;
}

module.exports = {
  MODOS, FAIXA_FRACAO, TAMANHOS, TAMANHO_PADRAO, FADE, MAXIMO_LOGOS, larguraDoLogo, nomeDoTamanho,
  temCanalAlfa, nomeDoModo, alturaFaixa, corDaFaixa, conflitoNaFaixa, hex, validarLogo,
  argsAplicarLogos, descreverLogo
};
