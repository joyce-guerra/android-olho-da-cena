'use strict';

/**
 * Salvar um trecho à parte (Alt S na tela Editar vídeo).
 *
 * Pega só o pedaço marcado (do início ao fim do corte) e grava num arquivo
 * novo. O vídeo original não é tocado. Três formatos:
 *   - horizontal: o quadro do jeito que o vídeo já é;
 *   - vertical: 1080 por 1920 com fundo desfocado, o mesmo visual da tela
 *     Dividir, pronto para short;
 *   - audio: só o som, em MP3 ou WAV.
 *
 * Nas pontas entra um fade bem curto (0,2 segundo), só para o trecho não
 * começar nem terminar com estalo. Não é para ser percebido como efeito.
 */

const { filtroVertical } = require('./dividir');
const { codecAudioPorExtensao } = require('./juntar');

const FADE_TRECHO = 0.2;
const FORMATOS_TRECHO = ['horizontal', 'vertical', 'audio'];

/** Fade que cabe no trecho: nunca mais que um quarto da duração dele. */
function fadeDoTrecho(duracao) {
  return Math.max(0.01, Math.min(FADE_TRECHO, duracao / 4));
}

function argsSalvarTrecho({ entrada, inicio, fim, formato, temAudio, saida }) {
  if (!FORMATOS_TRECHO.includes(formato)) throw new Error(`Formato desconhecido: ${formato}.`);
  const de = Number(inicio);
  const ate = Number(fim);
  if (!isFinite(de) || !isFinite(ate) || ate <= de || de < 0) {
    throw new Error('O trecho marcado não é válido: o fim precisa vir depois do início.');
  }
  if (formato === 'audio' && !temAudio) throw new Error('Este vídeo não tem áudio para salvar.');

  const dur = ate - de;
  const f = fadeDoTrecho(dur);
  const saidaFade = Math.max(0, dur - f).toFixed(3);
  const fadesAudio = `afade=t=in:st=0:d=${f.toFixed(3)},afade=t=out:st=${saidaFade}:d=${f.toFixed(3)}`;
  const fadesVideo = `fade=t=in:st=0:d=${f.toFixed(3)},fade=t=out:st=${saidaFade}:d=${f.toFixed(3)}`;

  // -ss antes do -i: busca rápida, e como tudo é recodificado o ponto fica exato.
  const args = ['-y', '-ss', de.toFixed(3), '-t', dur.toFixed(3), '-i', entrada];

  if (formato === 'audio') {
    args.push('-map', '0:a:0', '-vn', '-af', fadesAudio, ...codecAudioPorExtensao(saida), saida);
    return args;
  }

  if (formato === 'vertical') {
    args.push('-filter_complex', filtroVertical(fadesVideo), '-map', '[v]');
  } else {
    args.push('-map', '0:v:0', '-vf', `${fadesVideo},format=yuv420p`);
  }
  if (temAudio) args.push('-map', '0:a:0', '-af', fadesAudio);

  args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p');
  if (temAudio) args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000');
  args.push('-movflags', '+faststart', saida);
  return args;
}

/** Áudio inteiro de um vídeo (ou de outro áudio), sem cortar nada, em WAV. */
function argsExtrairAudio({ entrada, saida }) {
  return ['-y', '-i', entrada, '-map', '0:a:0', '-vn', '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', saida];
}

/** Converte um WAV de trabalho para o arquivo final (MP3 ou WAV). */
function argsConverterAudio({ entrada, saida }) {
  return ['-y', '-i', entrada, '-map', '0:a:0', '-vn', ...codecAudioPorExtensao(saida), saida];
}

module.exports = {
  FADE_TRECHO,
  FORMATOS_TRECHO,
  fadeDoTrecho,
  argsSalvarTrecho,
  argsExtrairAudio,
  argsConverterAudio
};
