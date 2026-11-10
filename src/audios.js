'use strict';

/**
 * Vários áudios em sequência, cada um com a sua velocidade.
 *
 * O resto do programa continua trabalhando com UM áudio só. Esta parte
 * existe para juntar a lista num arquivo único antes disso: o que vem
 * depois (cortar silêncio, trilhas, imagens, títulos) não precisa saber que
 * o áudio nasceu de vários pedaços.
 */

// 1 é o normal. O atempo do FFmpeg aceita de 0,5 a 2 por filtro, então todas
// estas cabem em um só, e a voz não muda de tom.
const VELOCIDADES = [1, 1.25, 1.5, 2];

const SEGUNDOS_PREVIA = 6;

/** Duração que o áudio passa a ter na velocidade escolhida. */
function duracaoNaVelocidade(duracao, velocidade) {
  return duracao / (velocidade || 1);
}

/** "1x (normal)", "1,25x", "1,5x", "2x". */
function nomeDaVelocidade(v) {
  if (!v || v === 1) return '1x (normal)';
  return `${String(v).replace('.', ',')}x`;
}

/** Junta os áudios na ordem, aplicando a velocidade de cada um. */
function argsMontarAudio({ itens, saida, mono }) {
  if (!itens || !itens.length) throw new Error('Nenhum áudio para montar.');
  const args = ['-y'];
  itens.forEach((it) => args.push('-i', it.caminho));

  const partes = itens.map((it, k) => {
    const v = it.velocidade || 1;
    if (!(v >= 0.5 && v <= 2)) throw new Error(`Velocidade ${v} fora do que é possível (de 0,5 a 2).`);
    const tempo = v !== 1 ? `,atempo=${v}` : '';
    return `[${k}:a:0]aresample=48000,aformat=channel_layouts=stereo${tempo}[a${k}]`;
  });
  // 1.8: Configurações > Áudios importados em mono: a mesma voz nos dois lados (o arquivo continua com 2 canais).
  const fim = mono ? '[junto];[junto]pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1[saida]' : '[saida]';
  partes.push(`${itens.map((_, k) => `[a${k}]`).join('')}concat=n=${itens.length}:v=0:a=1${fim}`);

  args.push(
    '-filter_complex', partes.join(';'),
    '-map', '[saida]',
    '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2',
    saida
  );
  return args;
}

/**
 * De onde tirar a prévia: um pouco depois do começo (os primeiros segundos
 * costumam ser silêncio ou vinheta), sem passar do fim.
 */
function inicioDaPrevia(duracao, velocidade) {
  const necessario = SEGUNDOS_PREVIA * (velocidade || 1);
  if (!(duracao > necessario + 1)) return 0;
  return Math.max(0, Math.min(10, duracao - necessario - 0.5));
}

/** Seis segundos já na velocidade escolhida, para a pessoa ouvir como ficou. */
function argsPreviaVelocidade({ entrada, velocidade, duracao, saida }) {
  const v = velocidade || 1;
  const inicio = inicioDaPrevia(duracao, v);
  const args = ['-y', '-ss', inicio.toFixed(3), '-t', (SEGUNDOS_PREVIA * v).toFixed(3), '-i', entrada];
  if (v !== 1) args.push('-af', `atempo=${v}`);
  args.push('-t', String(SEGUNDOS_PREVIA), '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', saida);
  return args;
}

module.exports = {
  VELOCIDADES,
  SEGUNDOS_PREVIA,
  duracaoNaVelocidade,
  nomeDaVelocidade,
  argsMontarAudio,
  inicioDaPrevia,
  argsPreviaVelocidade
};
