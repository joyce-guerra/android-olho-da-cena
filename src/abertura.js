'use strict';

/**
 * Abertura do Editar vídeo: um título e/ou um logo por cima dos PRIMEIROS
 * 3 SEGUNDOS do próprio vídeo editado. Não acrescenta tempo nenhum e não mexe
 * no som: é só uma camada de imagem que entra e some suavemente.
 *
 * O desenho é decidido pelo programa (quem edita pode não ver a tela):
 *   - logo grande, centrado, com uma sombra suave;
 *   - título logo abaixo, centrado, em letra grande e limpa, sobre uma faixa
 *     escura translúcida da largura do vídeo, com sombra no texto;
 *   - o conjunto fica no meio da tela, com medidas próprias para vídeo
 *     deitado, em pé e quadrado;
 *   - tudo entra junto num fade de 0,5 segundo e some junto nos últimos 0,5.
 */

const { quebrarLinhas } = require('./titulos');
const { caminhoFiltro } = require('./ffmpeg-builder');

const DURACAO = 3;
const FADE_ENTRADA = 0.5;
const FADE_SAIDA = 0.5;
const LIMITE_TITULO = 90;
const MAX_LINHAS = 3;
const FAIXA_COR = 'black@0.5';
const TEXTO_COR = '0xFFFFFF';

// Letras limpas, das mais bonitas para as de reserva (titulos.resolverFonte
// ainda acrescenta Arial, Liberation e DejaVu no fim da lista).
const FONTES = [
  'C:/Windows/Fonts/seguisb.ttf',
  'C:/Windows/Fonts/segoeuib.ttf',
  'C:/Windows/Fonts/arialbd.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'
];

function par(n) {
  return Math.max(2, Math.round(n / 2) * 2);
}

function orientacao(W, H) {
  if (W > H * 1.1) return 'horizontal';
  if (H > W * 1.1) return 'vertical';
  return 'quadrado';
}

/** Problemas do que foi pedido (lista vazia se está tudo certo). */
function validarAbertura(a) {
  const erros = [];
  if (!a) return erros;
  const titulo = String(a.titulo || '').trim();
  if (titulo.length > LIMITE_TITULO) {
    erros.push(`O título da abertura tem ${titulo.length} letras. O máximo é ${LIMITE_TITULO}.`);
  }
  if (a.logo && !a.logo.caminho) erros.push('Falta a imagem do logo da abertura.');
  return erros;
}

/** Há algo para desenhar? */
function temAbertura(a) {
  return !!(a && (String(a.titulo || '').trim() || (a.logo && a.logo.caminho)));
}

// Medidas por orientação, em fração do vídeo.
const MEDIDAS = {
  //            letra (lado menor)  logo: larg. máx.  alt. máx. c/ título  sem título
  horizontal: { letra: 0.085, logoLarg: 0.42, logoAltT: 0.42, logoAlt: 0.55 },
  vertical:   { letra: 0.095, logoLarg: 0.72, logoAltT: 0.26, logoAlt: 0.34 },
  quadrado:   { letra: 0.08,  logoLarg: 0.6,  logoAltT: 0.36, logoAlt: 0.5 }
};

/**
 * Onde cada coisa fica, em pixels do vídeo salvo. `logo` traz a largura e a
 * altura originais da imagem (de infoLogo).
 */
function planejarAbertura({ largura: W, altura: H, titulo, logo }) {
  const ori = orientacao(W, H);
  const m = MEDIDAS[ori];
  const S = Math.min(W, H);
  const texto = String(titulo || '').trim().replace(/\s+/g, ' ');

  // Título: começa grande e só diminui se não couber em três linhas.
  let linhas = [];
  let letra = 0;
  if (texto) {
    const minimo = Math.round(S * 0.05);
    letra = Math.round(S * m.letra);
    for (;;) {
      const porLinha = Math.max(6, Math.floor((W * 0.86) / (letra * 0.56)));
      linhas = quebrarLinhas(texto, porLinha);
      if (linhas.length <= MAX_LINHAS || letra <= minimo) break;
      letra = Math.max(minimo, Math.round(letra * 0.92));
    }
  }
  const passo = Math.round(letra * 1.3);
  const respiro = Math.round(letra * 0.5);
  const faixaAlt = linhas.length ? linhas.length * passo + 2 * respiro : 0;

  // Logo: o maior possível dentro da caixa, sem ampliar mais de 3 vezes.
  let lw = 0;
  let lh = 0;
  if (logo && logo.caminho) {
    const forma = logo.largura > 0 && logo.altura > 0 ? logo.largura / logo.altura : 1;
    const maxL = W * m.logoLarg;
    const maxA = H * (linhas.length ? m.logoAltT : m.logoAlt);
    lw = maxL;
    lh = lw / forma;
    if (lh > maxA) { lh = maxA; lw = lh * forma; }
    if (logo.largura > 0 && lw > logo.largura * 3) { lw = logo.largura * 3; lh = lw / forma; }
    lw = par(lw);
    lh = par(lh);
  }

  const vao = lh && faixaAlt ? Math.round(S * 0.045) : 0;
  const total = lh + vao + faixaAlt;
  const topo = Math.max(0, Math.round((H - total) / 2));

  const plano = { largura: W, altura: H, orientacao: ori, duracao: DURACAO, fade: FADE_SAIDA, fadeEntrada: FADE_ENTRADA };
  plano.logo = lh ? { largura: lw, altura: lh, x: Math.round((W - lw) / 2), y: topo } : null;
  plano.titulo = linhas.length ? {
    linhas,
    letra,
    passo,
    faixa: { y: topo + lh + vao, altura: faixaAlt },
    // Centro vertical de cada linha.
    centros: linhas.map((_, i) => topo + lh + vao + respiro + Math.round(passo * (i + 0.5)))
  } : null;
  return plano;
}


/**
 * Pedaços de filter_complex que põem a abertura sobre `rotuloV`.
 *
 * A camada da abertura é montada à parte, num quadro transparente de 3
 * segundos (faixa, texto e logo), e entra e some de uma vez com fade no canal alfa.
 * Depois ela é sobreposta ao vídeo; terminada a camada, o vídeo segue
 * intocado (eof_action=pass). Nada aqui toca o áudio.
 *
 * `entradaLogo` é o rótulo da imagem do logo (ex.: '[1:v]'), que deve entrar
 * com '-loop 1 -framerate 30 -t 3'. `arquivosLinhas` são arquivos de texto,
 * um por linha do título (evita ter de escapar o texto no filtro).
 */
function filtroAbertura({ plano, rotuloV, entradaLogo, logo, fonte, arquivosLinhas, fps = 30 }) {
  const { largura: W, altura: H } = plano;
  const partes = [];
  const fimFade = (DURACAO - FADE_SAIDA).toFixed(3);

  let camada = `color=c=black@0.0:s=${W}x${H}:r=${fps}:d=${DURACAO},format=rgba`;
  if (plano.titulo) {
    const t = plano.titulo;
    // A faixa entra por overlay (drawbox não escreve no canal alfa).
    partes.push(`color=c=${FAIXA_COR}:s=${W}x${t.faixa.altura}:r=${fps}:d=${DURACAO},format=rgba[abfaixa]`);
    partes.push(`${camada}[abvazio]`);
    camada = `[abvazio][abfaixa]overlay=x=0:y=${t.faixa.y}:format=auto`;
    const sombra = Math.max(2, Math.round(t.letra * 0.05));
    (arquivosLinhas || []).forEach((arq, i) => {
      camada += `,drawtext=fontfile='${caminhoFiltro(fonte)}':textfile='${caminhoFiltro(arq)}'` +
        `:expansion=none:fontcolor=${TEXTO_COR}:fontsize=${t.letra}` +
        `:shadowcolor=black@0.6:shadowx=${sombra}:shadowy=${sombra}` +
        `:x=(w-tw)/2:y=${t.centros[i]}-(ascent-descent)/2`;
    });
  }
  partes.push(`${camada}[abbase]`);
  let atual = '[abbase]';

  if (plano.logo && entradaLogo) {
    const { largura: lw, altura: lh, x, y } = plano.logo;
    const cadeia = ['format=rgba'];
    if (logo && logo.removerFundo && logo.corFundo) cadeia.push(`colorkey=${logo.corFundo}:0.16:0.06`, 'format=rgba');
    cadeia.push(`scale=${lw}:${lh}:flags=lanczos`, 'format=rgba');
    // Sombra suave: a própria forma do logo, preta, desfocada e deslocada.
    const p = Math.round(Math.min(lw, lh) * 0.06) + 4;
    const raio = Math.max(3, Math.round(Math.min(lw, lh) * 0.03));
    const desl = Math.max(2, Math.round(Math.min(lw, lh) * 0.02));
    partes.push(`${entradaLogo}${cadeia.join(',')},split=2[ablogo][absb]`);
    partes.push(
      `[absb]pad=iw+${2 * p}:ih+${2 * p}:${p}:${p}:color=black@0,` +
      'colorchannelmixer=rr=0:rg=0:rb=0:gr=0:gg=0:gb=0:br=0:bg=0:bb=0:aa=0.55,' +
      `boxblur=${raio}:1[absombra]`
    );
    partes.push(`${atual}[absombra]overlay=x=${x - p + desl}:y=${y - p + desl}:format=auto[abs1]`);
    partes.push(`[abs1][ablogo]overlay=x=${x}:y=${y}:format=auto[abs2]`);
    atual = '[abs2]';
  }

  partes.push(`${atual}fade=t=in:st=0:d=${FADE_ENTRADA.toFixed(3)}:alpha=1,fade=t=out:st=${fimFade}:d=${FADE_SAIDA.toFixed(3)}:alpha=1[abcamada]`);
  partes.push(`${rotuloV}[abcamada]overlay=x=0:y=0:format=auto:eof_action=pass:repeatlast=0[vabert]`);
  return { partes, rotulo: '[vabert]' };
}

/** Argumentos de entrada do logo (vão depois de '-i video'). */
function entradasAbertura(plano, logo) {
  if (!plano.logo || !logo) return [];
  return ['-loop', '1', '-framerate', '30', '-t', String(DURACAO), '-i', logo.caminho];
}

/** Frase curta para a pessoa sobre o que vai aparecer. */
function descreverAbertura(a) {
  if (!temAbertura(a)) return 'Sem abertura.';
  const titulo = String(a.titulo || '').trim();
  const partes = [];
  if (a.logo && a.logo.caminho) partes.push(`o logo ${a.logo.nome || ''}`.trim());
  if (titulo) partes.push(`o título "${titulo}"`);
  return `Abertura: ${partes.join(' e ')}, nos 3 primeiros segundos do vídeo.`;
}

module.exports = {
  DURACAO, FADE_ENTRADA, FADE_SAIDA, LIMITE_TITULO, MAX_LINHAS, FONTES, MEDIDAS,
  orientacao, validarAbertura, temAbertura, planejarAbertura, filtroAbertura,
  entradasAbertura, descreverAbertura
};
