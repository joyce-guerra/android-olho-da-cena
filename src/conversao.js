'use strict';
/** Qualidades e conversão da gravação do Chromium (WebM) em MP4 H.264/AAC, 30 quadros por segundo constantes. */

const QUALIDADES = {
  // Alta: quase sem perda (CRF 20), com teto de 12 Mbit/s para cenas de muito movimento.
  alta: { video: ['-crf', '20', '-maxrate', '12M', '-bufsize', '24M'], audio: '192k', gravador: 12000000, gbPorHora: [3, 5] },
  // Padrão: 1080p com média de 3,6 Mbit/s (cerca de 1,7 GB por hora com o som).
  padrao: { video: ['-b:v', '3600k', '-maxrate', '4500k', '-bufsize', '9000k'], audio: '160k', gravador: 8000000, gbPorHora: [1.5, 2] },
  // Leve: 720p com média de 1,8 Mbit/s (cerca de 0,9 GB por hora com o som).
  leve: { video: ['-b:v', '1800k', '-maxrate', '2300k', '-bufsize', '4600k'], audio: '128k', gravador: 5000000, gbPorHora: [0.8, 1] }
};
const qualidadeValida = (q) => (Object.prototype.hasOwnProperty.call(QUALIDADES, q) ? q : null);

/** Parâmetros de vídeo e som do FFmpeg para a qualidade escolhida. */
function codificacao(qualidade) {
  const q = QUALIDADES[qualidadeValida(qualidade) || 'alta'];
  return {
    video: ['-c:v', 'libx264', '-preset', 'veryfast', ...q.video, '-pix_fmt', 'yuv420p', '-fps_mode', 'cfr', '-r', '30'],
    audio: ['-c:a', 'aac', '-b:a', q.audio, '-ar', '48000']
  };
}

function argumentosMp4(entrada, saida, qualidade) {
  const c = codificacao(qualidade);
  return ['-y', '-hide_banner', '-nostdin', '-i', entrada,
    '-map', '0:v:0', '-map', '0:a:0?',
    ...c.video,
    '-af', 'aresample=async=1:first_pts=0',
    ...c.audio,
    '-movflags', '+faststart', saida];
}

/** Lê "time=00:00:12.34" da saída do FFmpeg; devolve segundos ou null. */
function tempoDoProgresso(linha) {
  const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(linha);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

module.exports = { QUALIDADES, qualidadeValida, codificacao, argumentosMp4, tempoDoProgresso };
