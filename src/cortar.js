'use strict';

/**
 * Cortar vídeo.
 *
 * Cortar o começo, cortar o fim e cortar no meio são a mesma operação: dizer
 * de onde até onde descartar. O começo é "de zero até aqui", o fim é "daqui até
 * a duração", o meio é "daqui até ali". Por isso o programa só conhece uma
 * coisa, o descarte, sempre com dois números.
 *
 * Internamente os descartes viram o contrário — a lista do que fica — porque é
 * isso que o FFmpeg precisa receber. Vários descartes são aplicados de uma vez
 * só, numa única passada, o que evita perder qualidade a cada corte.
 *
 * O corte é exato: o vídeo é recodificado. Existe um modo instantâneo que só
 * copia, mas ele só consegue cortar nos quadros-chave do arquivo, espaçados a
 * cada poucos segundos — pedir 1:23 e receber 1:21 seria comum, e num conto
 * isso cai no meio de uma palavra.
 */

const { filtroLegenda } = require('./ffmpeg-builder');
const AJ = require('./ajuste');

// Trecho que sobraria entre dois descartes, curto demais para valer a pena.
// Um pedaço de meio segundo entre dois cortes soa como um soluço, não como
// conteúdo.
const SOBRA_MINIMA = 0.5;

// Fade de áudio nas emendas, em segundos. Curto demais para ser percebido como
// fade: só existe para impedir o estalo que um corte seco no meio de uma onda
// sonora produz.
const MICRO_FADE = 0.02;

// Fade "de verdade" nas junções, usado só quando a pessoa pede explicitamente
// (opção de suavizar as emendas, em Gerar vídeo). Esse já é perceptível de
// propósito: é a transição estilo vídeo curto, não só um anti-estalo.
const FADE_PADRAO = 0.35;

/**
 * Limpa e confere a lista de descartes.
 *
 * Descartes que se sobrepõem são fundidos. Pedaços minúsculos que sobrariam
 * entre dois descartes são absorvidos, com aviso. Devolve o que fica, a
 * duração final e o que precisa ser dito à pessoa.
 */
function planejarCortes(descartes, duracao) {
  const erros = [];
  const avisos = [];

  if (!(duracao > 0)) {
    return { erros: ['Não sei a duração do vídeo.'], avisos, mantidos: [], descartes: [] };
  }

  // Confere cada um e prende nos limites do vídeo.
  const validos = [];
  (descartes || []).forEach((d, i) => {
    const pos = i + 1;
    let de = Number(d.inicio);
    let ate = Number(d.fim);

    if (!isFinite(de) || !isFinite(ate)) {
      erros.push(`Descarte ${pos} tem um tempo inválido.`);
      return;
    }
    if (ate <= de) {
      erros.push(`Descarte ${pos} termina antes de começar. Confira a ordem dos dois tempos.`);
      return;
    }
    if (de >= duracao) {
      erros.push(`Descarte ${pos} começa depois do fim do vídeo.`);
      return;
    }

    de = Math.max(0, de);
    ate = Math.min(duracao, ate);
    validos.push({ de, ate });
  });

  // Ordena e funde os que se encostam ou se sobrepõem.
  validos.sort((a, b) => a.de - b.de);
  const fundidos = [];
  for (const d of validos) {
    const ultimo = fundidos[fundidos.length - 1];
    if (ultimo && d.de <= ultimo.ate + SOBRA_MINIMA) {
      if (d.de < ultimo.ate) {
        avisos.push('Dois descartes se sobrepunham e foram unidos num só.');
      } else if (d.de > ultimo.ate) {
        avisos.push(
          'Sobrava um pedacinho de menos de meio segundo entre dois descartes. ' +
          'Descartei junto, para não virar um soluço no áudio.'
        );
      }
      ultimo.ate = Math.max(ultimo.ate, d.ate);
    } else {
      fundidos.push({ ...d });
    }
  }

  // Sobra minúscula no começo ou no fim do vídeo também some.
  if (fundidos.length && fundidos[0].de < SOBRA_MINIMA && fundidos[0].de > 0) {
    fundidos[0].de = 0;
  }
  const ultimoDescarte = fundidos[fundidos.length - 1];
  if (ultimoDescarte && duracao - ultimoDescarte.ate < SOBRA_MINIMA && ultimoDescarte.ate < duracao) {
    ultimoDescarte.ate = duracao;
  }

  // O que fica é o avesso dos descartes.
  const mantidos = [];
  let cursor = 0;
  for (const d of fundidos) {
    if (d.de - cursor >= 0.05) mantidos.push({ de: cursor, ate: d.de });
    cursor = d.ate;
  }
  if (duracao - cursor >= 0.05) mantidos.push({ de: cursor, ate: duracao });

  if (!erros.length && !fundidos.length) {
    erros.push('Nenhum descarte marcado.');
  }
  if (!erros.length && !mantidos.length) {
    erros.push('Os descartes cobrem o vídeo inteiro. Não sobraria nada.');
  }

  const duracaoFinal = mantidos.reduce((a, m) => a + (m.ate - m.de), 0);

  return { erros, avisos, mantidos, descartes: fundidos, duracaoFinal };
}

/**
 * Fades de áudio de um trecho mantido. Nas pontas que viraram emenda entra o
 * micro-fade anti-estalo; com `fadesJuncao` (opção "suavizar as emendas" no
 * Editar vídeo), cada emenda ganha um fade de saída no trecho de antes e um de
 * entrada no trecho de depois, do tamanho calculado por calcularFadesDeJuncao.
 * Sem sobrepor os trechos: a duração não muda, e imagem e som seguem juntos.
 * O começo e o fim reais do vídeo ficam intocados.
 */
function fadesDoTrecho(i, n, m, dur, duracao, fadesJuncao) {
  const comFade = Array.isArray(fadesJuncao) && fadesJuncao.length === n - 1 && n > 1;
  const fades = [];
  if (m.de > 0.001) {
    const d = comFade && i > 0 ? fadesJuncao[i - 1] : MICRO_FADE;
    fades.push(`afade=t=in:st=0:d=${Number(d.toFixed(3))}`);
  }
  if (m.ate < duracao - 0.001) {
    const d = comFade && i < n - 1 ? fadesJuncao[i] : MICRO_FADE;
    fades.push(`afade=t=out:st=${Math.max(0, dur - d).toFixed(3)}:d=${Number(d.toFixed(3))}`);
  }
  return fades;
}

/**
 * Comando que monta o vídeo cortado numa passada só.
 *
 * O arquivo é lido uma vez e dividido em ramos, um por trecho mantido. Cada
 * ramo é aparado no tempo certo, e todos são emendados no fim. Vídeo e áudio
 * seguem juntos em cada ramo, então não há como dessincronizar.
 */
function argsCortar({ entrada, mantidos, temAudio, saida, duracao, legenda, altura, ajuste = null, fadesJuncao = null, sobreposicoes = null, fps = 30, leve = false }) {
  const n = mantidos.length;
  // 1.5: crossfade de verdade (Silêncios e crossfade, depois da gravação): em cada emenda o fim de
  // um trecho some enquanto o próximo já entra POR CIMA dele (xfade na imagem, acrossfade no som,
  // com o mesmo tamanho), então imagem e som encurtam juntos e continuam sincronizados.
  const sobrepor = Array.isArray(sobreposicoes) && sobreposicoes.length === n - 1 && n > 1;
  if (sobrepor) fadesJuncao = null;
  const partes = [];
  const temLegenda = !!(legenda && String(legenda).trim());

  // 1.8.6: leve (áudio da gravação): a imagem vira 16x16 já na entrada, com os mesmos quadros e tempos;
  // só o som importa aqui, e o vídeo de verdade é cortado uma vez só, no Finalizar.
  partes.push(`[0:v]${leve ? 'scale=16:16:flags=neighbor,' : ''}split=${n}${mantidos.map((_, i) => `[vs${i}]`).join('')}`);
  if (temAudio) {
    partes.push(`[0:a]asplit=${n}${mantidos.map((_, i) => `[as${i}]`).join('')}`);
  }

  mantidos.forEach((m, i) => {
    const de = m.de.toFixed(3);
    const ate = m.ate.toFixed(3);
    const dur = m.ate - m.de;

    partes.push(`[vs${i}]trim=start=${de}:end=${ate},setpts=PTS-STARTPTS${sobrepor ? `,fps=${Number(fps.toFixed(5))},settb=AVTB` : ''}[v${i}]`);

    if (temAudio) {
      // Micro-fade só nas pontas que viraram emenda. O começo real do vídeo e o
      // fim real ficam intocados.
      const fades = sobrepor
        ? fadesDoTrecho(i, n, m, dur, duracao, null).filter((f) => (i === 0 && f.includes('t=in')) || (i === n - 1 && f.includes('t=out')))
        : fadesDoTrecho(i, n, m, dur, duracao, fadesJuncao);
      partes.push(
        `[as${i}]atrim=start=${de}:end=${ate},asetpts=PTS-STARTPTS` +
        (fades.length ? ',' + fades.join(',') : '') +
        `[a${i}]`
      );
    }
  });

  if (sobrepor) {
    let v = '[v0]', a = '[a0]';
    let comprimento = mantidos[0].ate - mantidos[0].de;
    for (let i = 0; i < n - 1; i++) {
      const d = sobreposicoes[i];
      const ov = i === n - 2 ? '[vout]' : `[vx${i}]`;
      partes.push(`${v}[v${i + 1}]xfade=transition=fade:duration=${d.toFixed(4)}:offset=${(comprimento - d).toFixed(4)}${ov}`);
      v = ov;
      if (temAudio) {
        const oa = i === n - 2 ? '[aout]' : `[ax${i}]`;
        partes.push(`${a}[a${i + 1}]acrossfade=d=${d.toFixed(4)}:c1=tri:c2=tri${oa}`);
        a = oa;
      }
      comprimento += (mantidos[i + 1].ate - mantidos[i + 1].de) - d;
    }
  } else {
  const entradasConcat = mantidos
    .map((_, i) => (temAudio ? `[v${i}][a${i}]` : `[v${i}]`))
    .join('');
  partes.push(
    `${entradasConcat}concat=n=${n}:v=1:a=${temAudio ? 1 : 0}` +
    (temAudio ? '[vout][aout]' : '[vout]')
  );
  }

  // Ajuste do áudio (Olho da Cena): equalização, velocidade e volume no som
  // já emendado; a imagem acompanha a velocidade (setpts), então os dois
  // continuam juntos.
  let rotuloV = '[vout]';
  let rotuloA = '[aout]';
  const vel = AJ.filtroVelocidadeVideo(ajuste);
  if (vel) {
    partes.push(`[vout]${vel}[vvel]`);
    rotuloV = '[vvel]';
  }
  if (temAudio && ajuste && !AJ.ajusteNeutro(ajuste)) {
    partes.push(`[aout]${AJ.filtroAudio(ajuste)}[aaj]`);
    rotuloA = '[aaj]';
  }

  // Legenda entra por último, depois da emenda: queima o texto no vídeo já
  // remontado, em vez de em cada ramo separado.
  if (temLegenda) {
    partes.push(`${rotuloV}${filtroLegenda(legenda, altura)}[voutleg]`);
    rotuloV = '[voutleg]';
  }

  const args = [
    '-y',
    '-i', entrada,
    '-filter_complex', partes.join(';'),
    '-map', rotuloV
  ];
  if (temAudio) args.push('-map', rotuloA);

  if (leve) args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p');
  else args.push(
    '-c:v', 'libx264',
    // Qualidade alta de propósito: é uma recodificação de algo que já foi
    // comprimido, e cada geração perde um pouco. Aqui a pessoa pediu para
    // demorar mais e sair certo.
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p'
  );
  if (temAudio) args.push('-c:a', 'aac', '-b:a', '192k');
  args.push('-movflags', '+faststart', saida);

  return args;
}

/**
 * Calcula, para cada junção entre dois trechos mantidos consecutivos, quanto
 * tempo de fade cabe ali — sem nunca passar da metade da duração de nenhum
 * dos dois lados, pra nunca comer mais da metade de um trecho curto. Devolve
 * um valor por junção (mantidos.length - 1 valores, ou lista vazia se só há
 * um trecho).
 *
 * Essa é a mesma conta que decide o quanto o áudio final encolhe: cada
 * acrossfade sobrepõe os dois lados em vez de só emendar, então o resultado
 * fica mais curto que a soma dos trechos por essa quantidade, em cada junção.
 */
function calcularFadesDeJuncao(mantidos) {
  const fades = [];
  for (let i = 0; i < mantidos.length - 1; i++) {
    const durAtual = mantidos[i].ate - mantidos[i].de;
    const durProxima = mantidos[i + 1].ate - mantidos[i + 1].de;
    const base = Math.min(FADE_PADRAO, durAtual / 2, durProxima / 2);
    fades.push(Math.max(MICRO_FADE, base));
  }
  return fades;
}

/**
 * Mesma ideia de argsCortar, só que pra um áudio puro, sem vídeo — usado
 * quando se corta o silêncio do áudio de narração em Gerar vídeo, antes de
 * montar qualquer imagem. Um ramo por trecho mantido, aparado numa passada só.
 *
 * Sem `fades` (ou com só um trecho mantido): emenda seca de sempre, com o
 * mesmo micro-fade nas emendas pra não estalar — comportamento inalterado.
 *
 * Com `fades` (uma pessoa marcou a opção de suavizar): cada junção interna
 * usa o filtro acrossfade do ffmpeg, encadeado trecho a trecho, pra misturar
 * a ponta de um pedaço de fala com o começo do próximo em vez de só colar um
 * atrás do outro. As pontas realmente cortadas (começo do áudio, se o
 * primeiro trecho não começa em zero; fim do áudio, se o último não vai até
 * o fim) continuam só com o micro-fade de sempre, não com o fade grande —
 * não há um segundo pedaço do outro lado pra misturar.
 */
function argsCortarAudio({ entrada, mantidos, duracao, saida, fades, fadesSeparados = null, ajuste = null }) {
  const n = mantidos.length;
  const partes = [];
  const comFade = Array.isArray(fades) && fades.length === n - 1 && n > 1;

  partes.push(`[0:a]asplit=${n}${mantidos.map((_, i) => `[as${i}]`).join('')}`);

  mantidos.forEach((m, i) => {
    const de = m.de.toFixed(3);
    const ate = m.ate.toFixed(3);
    const dur = m.ate - m.de;

    let microFades = [];
    if (!comFade && fadesSeparados) {
      microFades = fadesDoTrecho(i, n, m, dur, duracao, fadesSeparados);
    } else {
      if (!comFade || i === 0) {
        if (m.de > 0.001) microFades.push(`afade=t=in:st=0:d=${MICRO_FADE}`);
      }
      if (!comFade || i === n - 1) {
        if (m.ate < duracao - 0.001) {
          microFades.push(`afade=t=out:st=${Math.max(0, dur - MICRO_FADE).toFixed(3)}:d=${MICRO_FADE}`);
        }
      }
    }
    partes.push(
      `[as${i}]atrim=start=${de}:end=${ate},asetpts=PTS-STARTPTS` +
      (microFades.length ? ',' + microFades.join(',') : '') +
      `[a${i}]`
    );
  });

  if (!comFade) {
    partes.push(`${mantidos.map((_, i) => `[a${i}]`).join('')}concat=n=${n}:v=0:a=1[aout]`);
  } else {
    // Encadeia um acrossfade por junção: o resultado do primeiro par entra
    // como entrada do próximo, junto com o trecho seguinte, e assim por
    // diante até sobrar um único rótulo de saída.
    let entradaAnterior = '[a0]';
    for (let i = 0; i < fades.length; i++) {
      const rotuloSaida = i === fades.length - 1 ? '[aout]' : `[x${i}]`;
      partes.push(
        `${entradaAnterior}[a${i + 1}]acrossfade=d=${fades[i].toFixed(3)}:c1=tri:c2=tri${rotuloSaida}`
      );
      entradaAnterior = rotuloSaida;
    }
  }

  let rotulo = '[aout]';
  if (ajuste && !AJ.ajusteNeutro(ajuste)) {
    partes.push(`[aout]${AJ.filtroAudio(ajuste)}[aaj]`);
    rotulo = '[aaj]';
  }

  return [
    '-y',
    '-i', entrada,
    '-filter_complex', partes.join(';'),
    '-map', rotulo,
    '-c:a', 'pcm_s16le',
    saida
  ];
}

/** 1.5: tamanho da sobreposição do crossfade em cada emenda: 0,2 s (6 quadros a 30 por segundo),
 *  nunca mais que a metade do trecho mais curto, sempre em quadros inteiros. */
const SOBREPOSICAO = 0.2;
function calcularSobreposicoes(mantidos, fps = 30) {
  const out = [];
  for (let i = 0; i < mantidos.length - 1; i++) {
    const lim = Math.min(SOBREPOSICAO, (mantidos[i].ate - mantidos[i].de) / 2, (mantidos[i + 1].ate - mantidos[i + 1].de) / 2);
    out.push(Math.max(1, Math.floor(lim * fps + 1e-6)) / fps);
  }
  return out;
}
/** Alinha os trechos aos quadros do vídeo, para a conta das sobreposições ser exata na imagem e no som. */
function alinharAosQuadros(mantidos, fps = 30) {
  return mantidos.map((m) => ({ ...m, de: Math.round(m.de * fps) / fps, ate: Math.round(m.ate * fps) / fps })).filter((m) => m.ate - m.de >= 2 / fps);
}
/** Tempo no vídeo cortado com sobreposições: o remapTempo de sempre menos o que já sobrepôs antes. */
function remapSobreposto(t, mantidos, sobreposicoes) {
  let acc = 0, menos = 0;
  for (let i = 0; i < mantidos.length; i++) {
    const m = mantidos[i];
    if (t < m.de) return Math.max(0, acc - menos);
    if (t <= m.ate) return Math.max(0, acc + (t - m.de) - menos);
    acc += m.ate - m.de;
    if (i < sobreposicoes.length) menos += sobreposicoes[i];
  }
  return Math.max(0, acc - menos);
}

module.exports = { SOBREPOSICAO, calcularSobreposicoes, alinharAosQuadros, remapSobreposto, planejarCortes, argsCortar, argsCortarAudio, calcularFadesDeJuncao, fadesDoTrecho, SOBRA_MINIMA, FADE_PADRAO, MICRO_FADE };
