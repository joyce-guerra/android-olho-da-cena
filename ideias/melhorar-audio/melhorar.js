'use strict';
/**
 * "Melhorar": borrar ou substituir o fundo, depois da gravação e sem internet.
 * O FFmpeg decodifica quadros pequenos para a segmentação (MediaPipe, no programa),
 * recebe de volta uma máscara por quadro (pessoa = branco) e monta o vídeo final.
 */
const { codificacao } = require('./conversao');
const AJ = require('./ajuste');

/** Tamanho dos quadros enviados à segmentação (pequenos, para ser rápido). */
function tamanhoMascara(largura, altura) {
  if (largura > altura) return { mw: 384, mh: Math.round((384 * altura) / largura / 2) * 2 };
  if (altura > largura) return { mw: Math.round((384 * largura) / altura / 2) * 2, mh: 384 };
  return { mw: 288, mh: 288 };
}

/** Trecho a processar: o vídeo todo, ou 5 segundos do meio dele (a amostra). */
function trecho(duracao, amostra) {
  const d = Math.max(0, Number(duracao) || 0);
  if (!amostra || d <= 5) return { inicio: 0, duracao: amostra ? Math.min(5, d) : d };
  const inicio = Math.max(0, Math.round((d / 2 - 2.5) * 1000) / 1000);
  return { inicio, duracao: 5 };
}

const quadrosDo = (duracao) => Math.max(1, Math.round(duracao * 30));

/** FFmpeg que lê o original e solta quadros RGBA pequenos na saída padrão. */
function argumentosDecodificar({ original, inicio, duracao, mw, mh }) {
  return ['-v', 'error', '-nostdin', '-ss', String(inicio), '-t', String(duracao), '-i', original,
    '-an', '-vf', `fps=30,scale=${mw}:${mh}:flags=area,format=rgba`, '-f', 'rawvideo', 'pipe:1'];
}

/** FFmpeg que junta original, máscara (entrada padrão) e fundo, e grava o MP4 final. */
function argumentosCompor({ original, saida, efeito, fundoArq, largura: W, altura: H, mw, mh, inicio, duracao, qualidade, ajuste = null }) {
  const c = codificacao(qualidade);
  const ent = ['-ss', String(inicio), '-t', String(duracao), '-i', original,
    '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${mw}x${mh}`, '-r', '30', '-i', 'pipe:0'];
  // Bordas: a máscara pequena é ampliada com suavidade e levemente esfumada.
  const borda = Math.max(1, Math.round(Math.min(W, H) / 540));
  const mascara = `[1:v]scale=${W}:${H}:flags=bicubic,gblur=sigma=${borda},format=gbrp[m]`;
  let fundo;
  if (efeito === 'substituir') {
    ent.push('-loop', '1', '-framerate', '30', '-t', String(duracao), '-i', fundoArq);
    fundo = `[2:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=gbrp[f]`;
  } else {
    // Desfoque forte e barato: reduz, borra e amplia de novo.
    fundo = `[pb]scale=${Math.round(W / 6 / 2) * 2}:-2,gblur=sigma=6,scale=${W}:${H}:flags=bicubic,format=gbrp[f]`;
  }
  const pessoa = efeito === 'substituir'
    ? `[0:v]fps=30,format=gbrp[p]`
    : `[0:v]fps=30,format=gbrp,split=2[p][pb]`;
  const vel = AJ.filtroVelocidadeVideo(ajuste);
  const partes = [pessoa, fundo, mascara, `[f][p][m]maskedmerge${vel ? ',' + vel : ''},format=yuv420p[v]`];
  const comAudio = ajuste && !AJ.ajusteNeutro(ajuste);
  if (comAudio) partes.push(`[0:a:0]${AJ.filtroAudio(ajuste)}[a]`);
  return ['-y', '-hide_banner', '-nostdin', ...ent,
    '-filter_complex', partes.join(';'), '-map', '[v]', '-map', comAudio ? '[a]' : '0:a:0?',
    ...c.video, ...c.audio, '-t', String(duracaoFinal(duracao, ajuste)), '-movflags', '+faststart', saida];
}

/** Duração do resultado: a velocidade encurta ou alonga o trecho. */
function duracaoFinal(duracao, ajuste) {
  const v = ajuste ? AJ.normalizarAjuste(ajuste).velocidade : 1;
  return Math.round((duracao / v) * 1000) / 1000;
}

/** Só o áudio (a imagem fica como está; com outra velocidade, a imagem acompanha). Um FFmpeg só. */
function argumentosSoAudio({ original, saida, inicio, duracao, qualidade, ajuste }) {
  const c = codificacao(qualidade);
  const vel = AJ.filtroVelocidadeVideo(ajuste);
  const filtro = `[0:v]fps=30${vel ? ',' + vel : ''}[v];[0:a:0]${AJ.filtroAudio(ajuste)}[a]`;
  return ['-y', '-hide_banner', '-nostdin', '-ss', String(inicio), '-t', String(duracao), '-i', original,
    '-filter_complex', filtro, '-map', '[v]', '-map', '[a]', ...c.video, ...c.audio,
    '-t', String(duracaoFinal(duracao, ajuste)), '-movflags', '+faststart', saida];
}

/** Para "Ouvir": 5 segundos do meio, só o som, em WAV, com o ajuste. */
function argumentosOuvir({ original, inicio, duracao, ajuste }) {
  return ['-v', 'error', '-nostdin', '-ss', String(inicio), '-t', String(duracao), '-i', original,
    '-vn', '-af', AJ.filtroAudio(ajuste), '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', '-f', 'wav', 'pipe:1'];
}

module.exports = { tamanhoMascara, trecho, quadrosDo, argumentosDecodificar, argumentosCompor, argumentosSoAudio, argumentosOuvir, duracaoFinal };
