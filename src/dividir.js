'use strict';

/**
 * Dividir vídeo.
 *
 * Pega um vídeo grande e o separa em partes menores. Por padrão, cada parte
 * sai no formato vertical (1080 por 1920) que o YouTube Shorts, o Reels e o
 * TikTok pedem. Também dá para dividir mantendo o quadro original (horizontal).
 *
 * A conversão pra vertical sempre usa fundo desfocado: o vídeo inteiro fica no
 * meio da tela e o espaço de cima e de baixo é preenchido com uma versão
 * borrada do próprio vídeo. Nada é cortado, e por isso o texto escrito na
 * tela (títulos, por exemplo) continua inteiro. Recortar o centro perderia as
 * laterais, onde esse texto costuma estar.
 */

const LARGURA = 1080;
const ALTURA = 1920;

// Teto de duração do Shorts e do Reels (3 minutos, em 2026). O TikTok aceita
// mais que isso, então uma parte dentro desse limite serve nas três. Os
// limites mudam de vez em quando; é só mudar este número.
const LIMITE_CURTOS = 180;

// Uma última parte menor que isso quase não vira vídeo, e a pessoa deve saber
// antes de gerar.
const ULTIMA_MUITO_CURTA = 10;

// Pra um tamanho de parte absurdo não gerar milhares de arquivos sem querer.
const MAXIMO_PARTES = 300;

/**
 * Lê o tamanho de cada parte.
 *
 * Um número sozinho é em minutos ("3" são 3 minutos, "1,5" são um minuto e
 * meio), que é como a pessoa fala. Com dois-pontos é minuto e segundo
 * ("1:30"), ou hora, minuto e segundo ("0:02:30"). Devolve segundos, ou null
 * se não entendeu.
 */
function lerTamanho(texto) {
  if (typeof texto !== 'string') return null;
  const limpo = texto.trim().replace(/\s+/g, '');
  if (!limpo) return null;

  const numero = (s) => (/^\d+([.,]\d+)?$/.test(s) ? parseFloat(s.replace(',', '.')) : NaN);

  if (!limpo.includes(':')) {
    const minutos = numero(limpo);
    return isFinite(minutos) && minutos > 0 ? minutos * 60 : null;
  }

  const partes = limpo.split(':');
  if (partes.length > 3) return null;
  const valores = partes.map(numero);
  if (valores.some((v) => !isFinite(v))) return null;

  let h = 0;
  let m = 0;
  let s = 0;
  if (valores.length === 3) [h, m, s] = valores;
  else [m, s] = valores;

  if (m >= 60 && valores.length === 3) return null;
  if (s >= 60) return null;
  const total = h * 3600 + m * 60 + s;
  return total > 0 ? total : null;
}

/** "3 minutos", "1 minuto e 30 segundos", "45 segundos". */
function descrever(segundos) {
  const t = Math.max(0, Math.round(segundos));
  const m = Math.floor(t / 60);
  const s = t % 60;
  const min = `${m} minuto${m === 1 ? '' : 's'}`;
  const seg = `${s} segundo${s === 1 ? '' : 's'}`;
  if (m && s) return `${min} e ${seg}`;
  if (m) return min;
  return seg;
}

/**
 * Calcula as partes. Todas têm o tamanho pedido, menos a última, que fica com
 * o que sobrar. Devolve também o que precisa ser dito à pessoa.
 */
function planejarPartes(duracao, tamanho) {
  const erros = [];
  const avisos = [];

  if (!(duracao > 0)) {
    return { erros: ['Não sei a duração do vídeo.'], avisos, partes: [] };
  }
  if (!(tamanho > 0)) {
    return {
      erros: ['Não entendi o tamanho das partes. Use minutos, como 2 ou 1,5, ou minuto e segundo, como 1:30.'],
      avisos,
      partes: []
    };
  }
  if (tamanho < 1) {
    return { erros: ['O tamanho de cada parte precisa ser de pelo menos 1 segundo.'], avisos, partes: [] };
  }

  const partes = [];
  for (let i = 0; ; i++) {
    const inicio = i * tamanho;
    if (inicio >= duracao - 0.05) break;
    partes.push({ inicio, duracao: Math.min(tamanho, duracao - inicio) });
    if (partes.length > MAXIMO_PARTES) break;
  }

  if (partes.length > MAXIMO_PARTES) {
    return {
      erros: [`Com partes de ${descrever(tamanho)} sairiam mais de ${MAXIMO_PARTES} arquivos. Aumente o tamanho das partes.`],
      avisos,
      partes: []
    };
  }

  if (tamanho > LIMITE_CURTOS) {
    avisos.push(
      `Atenção: partes de ${descrever(tamanho)} passam de ${descrever(LIMITE_CURTOS)}, ` +
      `que é o limite do YouTube Shorts e do Reels. O TikTok aceita.`
    );
  }

  const ultima = partes[partes.length - 1];
  if (partes.length > 1 && ultima.duracao < ULTIMA_MUITO_CURTA) {
    avisos.push(
      `A última parte ficaria com só ${descrever(ultima.duracao)}. ` +
      `Se preferir, ajuste o tamanho das partes pra sobrar mais.`
    );
  }

  return { erros, avisos, partes };
}

/** Frase falada com o resultado da conta. */
function resumirPlano(duracao, partes, tamanho) {
  const total = descrever(duracao);
  if (partes.length === 1) {
    return `O vídeo tem ${total}. Sai uma parte só, com o vídeo inteiro.`;
  }

  const ultima = partes[partes.length - 1];
  const cheias = partes.length - 1;
  const ultimaIgual = Math.abs(ultima.duracao - tamanho) < 0.5;

  if (ultimaIgual) {
    return `O vídeo tem ${total}. Saem ${partes.length} partes de ${descrever(tamanho)} cada.`;
  }
  return (
    `O vídeo tem ${total}. Saem ${partes.length} partes: ` +
    `${cheias} de ${descrever(tamanho)} e a última, menor, de ${descrever(ultima.duracao)}.`
  );
}

/** "meu video - parte 02 de 05.mp4". */
function nomeDaParte(base, numero, total) {
  const largura = Math.max(2, String(total).length);
  const pad = (n) => String(n).padStart(largura, '0');
  return `${base} - parte ${pad(numero)} de ${pad(total)}.mp4`;
}

/**
 * Argumentos do FFmpeg pra uma parte.
 *
 * O -ss vem antes do -i de propósito: como o vídeo é recodificado, o ponto
 * de corte fica exato (não preso aos quadros-chave) e a busca é rápida mesmo
 * no fim de um arquivo longo.
 *
 * O fundo é feito em tamanho pequeno e só depois ampliado: um borrão não
 * precisa de resolução, e desfocar em 1080 por 1920 deixaria cada parte
 * várias vezes mais lenta.
 */
/**
 * Filtro que põe um vídeo qualquer em pé (1080 por 1920) com fundo desfocado.
 * Entra [0:v], sai [v]. `extra` é encaixado no fim da cadeia, antes do rótulo
 * de saída — usado para o fade discreto de um trecho salvo à parte.
 */
function filtroVertical(extra) {
  return [
    '[0:v]split=2[a][b]',
    `[a]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,` +
      `boxblur=8:2,scale=${LARGURA}:${ALTURA},setsar=1[fundo]`,
    `[b]scale=${LARGURA}:${ALTURA}:force_original_aspect_ratio=decrease:` +
      `force_divisible_by=2,setsar=1[frente]`,
    `[fundo][frente]overlay=(W-w)/2:(H-h)/2,format=yuv420p${extra ? ',' + extra : ''}[v]`
  ].join(';');
}

/**
 * Argumentos do FFmpeg pra uma parte.
 *
 * O -ss vem antes do -i de propósito: como o vídeo é recodificado, o ponto
 * de corte fica exato (não preso aos quadros-chave) e a busca é rápida mesmo
 * no fim de um arquivo longo.
 *
 * O fundo é feito em tamanho pequeno e só depois ampliado: um borrão não
 * precisa de resolução, e desfocar em 1080 por 1920 deixaria cada parte
 * várias vezes mais lenta.
 *
 * orientacao: 'vertical' (padrão, 1080 por 1920 com fundo desfocado) ou
 * 'horizontal' (o quadro original, sem mexer, só dividido no tempo).
 */
function argsDividirParte({ entrada, inicio, duracao, temAudio, saida, orientacao }) {
  const args = [
    '-y',
    '-ss', inicio.toFixed(3),
    '-t', duracao.toFixed(3),
    '-i', entrada
  ];

  if (orientacao === 'horizontal') {
    args.push('-map', '0:v:0');
  } else {
    args.push('-filter_complex', filtroVertical(), '-map', '[v]');
  }
  if (temAudio) args.push('-map', '0:a:0');

  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p');
  if (temAudio) args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000');
  args.push('-movflags', '+faststart', saida);
  return args;
}

module.exports = {
  LARGURA,
  ALTURA,
  LIMITE_CURTOS,
  lerTamanho,
  descrever,
  planejarPartes,
  resumirPlano,
  nomeDaParte,
  filtroVertical,
  argsDividirParte
};
