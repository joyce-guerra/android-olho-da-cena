'use strict';

/**
 * Monta a lista de segmentos do vídeo.
 *
 * modo 'distribuir': cada imagem aparece uma única vez e o tempo do áudio é
 *   dividido igualmente entre elas. 10 imagens num áudio de 4 minutos = 24
 *   segundos cada. 10 imagens em 30 minutos = 3 minutos cada.
 *
 * modo 'looping': cada imagem fica na tela pelo tempo base do preset e o ciclo
 *   se repete até cobrir o áudio inteiro. 10 imagens num áudio de 30 minutos
 *   com preset dark (12s) = 150 segmentos, ou seja, o ciclo roda 15 vezes.
 *
 * Nos dois casos a soma das durações bate exatamente com a duração do áudio.
 */

const DURACAO_MINIMA = 1.5; // segundos — abaixo disso o segmento nem vale a pena

// Abertura e encerramento do vídeo inteiro, independentes do preset.
// A primeira imagem nasce do preto e a última morre nele, mesmo no preset de
// clipe musical, onde as trocas do meio são corte seco. É o que dá a sensação
// de vídeo que começa e termina, em vez de trecho recortado.
const ABERTURA = 1.2;      // discreto, mas visível
const ENCERRAMENTO = 2.5;  // mais longo: é o fim

function buildTimeline({ audioDuration, imageCount, modo, preset, marcas }) {
  if (!(audioDuration > 0)) throw new Error('Duração do áudio inválida.');
  if (!(imageCount > 0)) throw new Error('Nenhuma imagem foi adicionada.');

  const segmentos = [];

  if (modo === 'distribuir') {
    const base = audioDuration / imageCount;
    let acumulado = 0;
    for (let i = 0; i < imageCount; i++) {
      // O último absorve a sobra do arredondamento pra fechar certinho.
      const dur = i === imageCount - 1 ? audioDuration - acumulado : base;
      segmentos.push({ imagem: i, duracao: dur });
      acumulado += dur;
    }
  } else if (modo === 'manual') {
    // Cada imagem já vem com o instante em que aparece, marcado ouvindo o
    // áudio. O efeito do preset continua rodando até a marca seguinte — o
    // segmento é simplesmente o intervalo entre uma marca e a próxima.
    if (!marcas || marcas.length !== imageCount) {
      throw new Error('Faltam marcas de tempo para as imagens do modo manual.');
    }
    if (marcas[0] > 0.05) {
      throw new Error(
        'A primeira imagem marcada precisa estar em 00:00:00. Sem isso, o ' +
        'vídeo começaria sem nenhuma imagem na tela.'
      );
    }
    for (let i = 0; i < imageCount; i++) {
      const fimSeg = i < imageCount - 1 ? marcas[i + 1] : audioDuration;
      segmentos.push({ imagem: i, duracao: Math.max(0.05, fimSeg - marcas[i]) });
    }
  } else if (modo === 'looping') {
    const base = preset.baseDuration;
    let t = 0;
    let i = 0;
    while (t < audioDuration - 0.01) {
      const dur = Math.min(base, audioDuration - t);
      segmentos.push({ imagem: i % imageCount, duracao: dur });
      t += dur;
      i++;
    }
    // Se sobrou um caquinho no fim, junta com o segmento anterior em vez de
    // deixar uma imagem piscando por meio segundo.
    const ultimo = segmentos[segmentos.length - 1];
    if (segmentos.length > 1 && ultimo.duracao < DURACAO_MINIMA) {
      segmentos.pop();
      segmentos[segmentos.length - 1].duracao += ultimo.duracao;
    }
  } else {
    throw new Error('Modo desconhecido: ' + modo);
  }

  // Cada segmento nasce marcado com o preset que o rege. No caso comum é
  // sempre o mesmo; com troca de preset por título (ver aplicarTrocasDePreset)
  // ele pode vir diferente por trecho.
  segmentos.forEach((s) => { s.preset = preset; });

  return finalizarSegmentos(segmentos);
}

/**
 * Direção do zoom e do pan, fade de entrada e saída — calculados na ordem em
 * que os segmentos aparecem, usando o preset de CADA UM (preset.panPattern,
 * preset.fade), não um preset único pro vídeo inteiro. Isso é o que permite
 * tanto o caso comum (todo segmento com o mesmo preset) quanto a troca de
 * preset por título usarem a mesma conta.
 *
 * A abertura e o encerramento do vídeo inteiro são sempre o primeiro e o
 * último segmento da lista inteira, não de cada trecho de preset.
 */
function finalizarSegmentos(segmentos) {
  const ultimo = segmentos.length - 1;
  segmentos.forEach((s, idx) => {
    const preset = s.preset;
    s.ordem = idx;
    s.zoomIn = idx % 2 === 0; // alterna aproximar / afastar
    s.pan = preset.panPattern[idx % preset.panPattern.length];

    s.fadeIn = idx === 0 ? Math.max(preset.fade, ABERTURA) : preset.fade;
    s.fadeOut = idx === ultimo ? Math.max(preset.fade, ENCERRAMENTO) : preset.fade;

    // Os dois fades juntos nunca podem ocupar o segmento inteiro, senão a
    // imagem nunca chega a aparecer. Num segmento curto eles encolhem juntos.
    const espaco = Math.max(0, s.duracao - 0.1);
    const somados = s.fadeIn + s.fadeOut;
    if (somados > espaco && somados > 0) {
      const encolhe = espaco / somados;
      s.fadeIn *= encolhe;
      s.fadeOut *= encolhe;
    }
  });

  return segmentos;
}

/**
 * Divide os segmentos nos pontos onde um título pede pra trocar de preset a
 * partir dali. Cada ponto é {tempo, presetId}; o trecho entre dois pontos
 * (ou do começo até o primeiro, ou do último até o fim) fica com um preset
 * só, mesmo que isso signifique partir ao meio o segmento de uma imagem —
 * a imagem continua a mesma, só a atmosfera muda debaixo dela.
 *
 * Sem pontos, devolve os segmentos exatamente como vieram, todos com
 * `presetPrincipal`.
 */
function aplicarTrocasDePreset(segmentosBase, { presetPrincipal, resolvePreset, pontos }) {
  let relogio = 0;
  const original = segmentosBase.map((seg) => {
    const faixa = { inicio: relogio, fim: relogio + seg.duracao, imagem: seg.imagem };
    relogio += seg.duracao;
    return faixa;
  });
  const duracaoTotal = relogio;

  if (!pontos || !pontos.length) {
    return segmentosBase.map((s) => ({ imagem: s.imagem, duracao: s.duracao, preset: presetPrincipal }));
  }

  const pontosValidos = pontos
    .map((p) => ({ tempo: Math.min(Math.max(p.tempo, 0), duracaoTotal), presetId: p.presetId }))
    .sort((a, b) => a.tempo - b.tempo);

  // Todo instante em que algo muda: troca de imagem OU troca de preset.
  const limites = new Set([0, duracaoTotal]);
  original.forEach((f) => limites.add(f.inicio));
  pontosValidos.forEach((p) => limites.add(p.tempo));
  const cortes = Array.from(limites).sort((a, b) => a - b);

  const resultado = [];
  for (let i = 0; i < cortes.length - 1; i++) {
    const inicio = cortes[i];
    const fim = cortes[i + 1];
    const duracao = fim - inicio;
    if (duracao < 0.05) continue;

    const img = original.find((f) => inicio >= f.inicio - 0.001 && inicio < f.fim - 0.001)
      || original[original.length - 1];

    let presetId = null;
    for (const p of pontosValidos) {
      if (p.tempo <= inicio + 0.001) presetId = p.presetId;
    }
    const preset = presetId ? resolvePreset(presetId) : presetPrincipal;

    resultado.push({ imagem: img.imagem, duracao, preset });
  }

  // Funde pedaços vizinhos que ficaram com o mesmo preset e a mesma imagem —
  // uma troca marcada bem em cima de uma troca de imagem não precisa virar
  // dois arquivos pra renderizar a mesma coisa duas vezes.
  const fundido = [];
  resultado.forEach((r) => {
    const anterior = fundido[fundido.length - 1];
    if (anterior && anterior.preset === r.preset && anterior.imagem === r.imagem) {
      anterior.duracao += r.duracao;
    } else {
      fundido.push({ ...r });
    }
  });

  return fundido;
}

/**
 * Ajusta os segmentos pra um preset que junta as imagens com transição
 * (passagem de página), em vez de corte seco ou fade pelo preto.
 *
 * A passagem consome tempo de tela: enquanto ela acontece, as duas imagens
 * aparecem juntas por `preset.fade` segundos. Pra duração total continuar
 * batendo exatamente com o áudio, cada imagem que tem transição ao lado
 * perde metade desse tempo daquele lado — uma imagem no meio, com
 * transição dos dois lados, perde o tempo inteiro; nas pontas, só metade,
 * porque só tem transição de um lado.
 *
 * Isso também desliga o fade pelo preto do meio do vídeo: ali quem faz a
 * passagem de uma imagem pra outra é a transição, não mais o preto. A
 * abertura e o encerramento do vídeo inteiro continuam sendo fade pelo
 * preto, porque não têm vizinho do outro lado pra fazer passagem nenhuma.
 */
function aplicarTransicaoCruzada(segmentos, preset) {
  if (!preset.transicao) return segmentos;
  const T = preset.fade;
  const ultimo = segmentos.length - 1;

  segmentos.forEach((s, idx) => {
    const temEsquerda = idx > 0;
    const temDireita = idx < ultimo;
    s.transicaoEsquerda = temEsquerda;
    s.transicaoDireita = temDireita;

    const perda = (temEsquerda ? T / 2 : 0) + (temDireita ? T / 2 : 0);
    s.duracao = s.duracao - perda;

    s.fadeIn = idx === 0 ? ABERTURA : 0;
    s.fadeOut = idx === ultimo ? ENCERRAMENTO : 0;
  });

  const curto = segmentos.some((s) => s.duracao < 0.4);
  if (curto) {
    throw new Error(
      'Com esse preset e esse tanto de imagem, alguma imagem ficaria com ' +
      'menos de meio segundo na tela por causa da transição entre uma e ' +
      'outra. Use menos imagens, um áudio mais longo, ou troque de preset.'
    );
  }

  return segmentos;
}

/**
 * Imagem longa demais parece congelada. Em vez de deixá-la parada um tempão,
 * divide o segmento em pedaços do tamanho aproximado de `intervalo` e deixa
 * cada pedaço fazer o movimento do preset ao contrário do anterior: aproxima
 * num, afasta no outro. Como o zoom e o deslize de um terminam exatamente
 * onde o seguinte começa, a imagem "respira" sem corte e sem escurecer.
 *
 * É sempre a mesma imagem. Nada novo aparece na tela, então não adianta
 * spoiler: só o enquadramento se mexe.
 *
 * Chamada depois de tudo que decide preset e fade, porque mexe nos fades das
 * pontas de cada pedaço. Preset sem zoom não tem o que renovar e fica como é.
 */
function renovarMovimento(segmentos, intervalo) {
  if (!(intervalo > 0)) return segmentos;

  const saida = [];
  segmentos.forEach((s) => {
    const semMovimento = !(s.preset && s.preset.zoomAmount > 0);
    if (semMovimento || s.duracao <= intervalo * 1.5) {
      saida.push(s);
      return;
    }
    const n = Math.max(2, Math.round(s.duracao / intervalo));
    const parte = s.duracao / n;
    for (let k = 0; k < n; k++) {
      const p = { ...s, duracao: parte, continuaImagem: k > 0 };
      if (k > 0) p.fadeIn = 0;       // não nasce do preto no meio da imagem
      if (k < n - 1) p.fadeOut = 0;  // nem morre nele
      saida.push(p);
    }
  });

  saida.forEach((s, idx) => {
    if (s.continuaImagem) {
      const anterior = saida[idx - 1];
      s.zoomIn = !anterior.zoomIn;
      s.pan = anterior.pan === 0 ? 0 : -anterior.pan;
    }
    s.ordem = idx;
  });

  return saida;
}

function formatarTempo(segundos) {
  const s = Math.max(0, Math.round(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(seg)}` : `${m}:${pad(seg)}`;
}

/** Texto curto pra falar no NVDA antes de começar a renderizar. */
function resumirTimeline(segmentos, imageCount) {
  const total = segmentos.reduce((a, s) => a + s.duracao, 0);
  const porImagem = segmentos.length ? segmentos[0].duracao : 0;
  const ciclos = imageCount ? segmentos.length / imageCount : 0;
  let txt =
    `${segmentos.length} segmentos, ` +
    `duração total ${formatarTempo(total)}, ` +
    `cerca de ${porImagem.toFixed(1)} segundos por imagem`;
  if (ciclos > 1.05) txt += `, ciclo repetido ${ciclos.toFixed(1)} vezes`;
  return txt + '.';
}

module.exports = {
  buildTimeline,
  formatarTempo,
  resumirTimeline,
  aplicarTransicaoCruzada,
  aplicarTrocasDePreset,
  renovarMovimento,
  finalizarSegmentos
};
