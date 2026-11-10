'use strict';
/**
 * 2.0.5: converter áudios em lote em vídeo simples. Puro: sem acesso a disco, para testar.
 * A pasta traz tudo: os áudios, e, se a pessoa quiser, uma imagem chamada logo e outra imagem de
 * qualquer nome, que vira o fundo. O título de cada vídeo é o nome do arquivo de áudio.
 */
const { quebrarLinhas } = require('./titulos');

const AUDIO = /\.(mp3|wav|m4a|aac|ogg|flac|opus|wma)$/i;
const IMAGEM = /\.(png|jpe?g|webp|bmp)$/i;
const TAMANHOS = { horizontal: [1280, 720], vertical: [720, 1280], quadrado: [720, 720] };
const FPS = 5;
const CREME = '0xF5E9D0';
const PLACA_CLARA = '0xF2EEE6';
const PLACA_ESCURA = '0x101010';

const semExtensao = (n) => String(n).replace(/\.[^.]+$/, '');
const par = (n) => Math.max(2, Math.round(n / 2) * 2);
const caminhoFiltro = (p) => String(p).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

/** O que a pasta tem: áudios em ordem natural (2 antes de 10), a logo e a imagem de fundo. */
function separarPasta(nomes) {
  const todos = (nomes || []).filter((n) => !/^[.~]/.test(n));
  const audios = todos.filter((n) => AUDIO.test(n)).sort((a, b) => a.localeCompare(b, 'pt', { numeric: true, sensitivity: 'base' }));
  const imagens = todos.filter((n) => IMAGEM.test(n)).sort((a, b) => a.localeCompare(b, 'pt', { numeric: true, sensitivity: 'base' }));
  const logo = imagens.find((n) => semExtensao(n).trim().toLowerCase() === 'logo') || imagens.find((n) => /^logo\b/i.test(semExtensao(n))) || null;
  const outras = imagens.filter((n) => n !== logo);
  const avisos = [];
  if (outras.length > 1) avisos.push(`Há ${outras.length} imagens além da logo. Usei só a primeira, ${outras[0]}.`);
  return { audios, logo, imagem: outras[0] || null, avisos };
}

/** O título de cada vídeo é o nome do arquivo de áudio, sem a extensão. */
const tituloDe = (nome) => semExtensao(nome).trim();

/** Quanto mais clara a logo, menos ela precisa de uma placa clara. 0 a 1. */
function luminanciaDe(rgba) {
  let soma = 0, n = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    soma += (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) / 255; n++;
  }
  return n ? soma / n : 0.5;
}
/** A placa atrás da logo é escura para logo clara e clara para logo escura: nenhuma logo some. */
const corDaPlaca = (luminancia) => (luminancia < 0.5 ? PLACA_CLARA : PLACA_ESCURA);

/** Linhas do título e o tamanho da letra que cabem na largura e na altura disponíveis. */
function titularLinhas(texto, largura, base, maxAltura = Infinity) {
  let tam = base, linhas = [];
  for (let k = 0; k < 12; k++) {
    const porLinha = Math.max(8, Math.floor((largura * 0.88) / (tam * 0.56)));
    linhas = quebrarLinhas(texto, porLinha);
    if (linhas.length * tam * 1.4 <= maxAltura && linhas.length <= 6) return { tam: Math.round(tam), linhas };
    tam *= 0.9;
  }
  const maxLinhas = Math.max(1, Math.floor(maxAltura / (tam * 1.4)));
  linhas = linhas.slice(0, maxLinhas);
  linhas[linhas.length - 1] = linhas[linhas.length - 1].replace(/\s*\S{0,3}$/, '') + '…';
  return { tam: Math.round(tam), linhas };
}

/** Onde fica cada coisa. comImagem: logo em faixa no topo e título em faixa embaixo; senão, logo acima do título. */
function layout(formato, { comLogo, comImagem, logoLargura = 1, logoAltura = 1 }) {
  const [W, H] = TAMANHOS[formato] || TAMANHOS.horizontal;
  const base = Math.min(W, H) * (comImagem ? 0.052 : 0.06);
  const maxW = (comImagem ? 0.5 : 0.5) * W, maxH = (comImagem ? 0.09 : 0.2) * H;
  const f = Math.min(maxW / logoLargura, maxH / logoAltura, 2);
  const lw = par(logoLargura * f), lh = par(logoAltura * f);
  const r = { W, H, base };
  if (comLogo) {
    if (comImagem) {
      const faixa = par(H * 0.13);
      r.logo = { w: lw, h: lh, x: Math.round((W - lw) / 2), y: Math.round((faixa - lh) / 2), placa: { x: 0, y: 0, w: W, h: faixa } };
    } else {
      const y = Math.round(H * 0.27 - lh / 2), pad = Math.round(Math.min(W, H) * 0.025);
      r.logo = { w: lw, h: lh, x: Math.round((W - lw) / 2), y, placa: { x: Math.round((W - lw) / 2) - pad, y: y - pad, w: lw + 2 * pad, h: lh + 2 * pad } };
    }
  }
  if (comImagem) {
    const alt = par(H * 0.28);
    r.faixaTitulo = { y: H - alt, h: alt };
    r.tituloY = H - alt / 2;
    r.maxAltura = alt * 0.86;
  } else {
    r.tituloY = comLogo ? H * 0.64 : H * 0.5;
    r.maxAltura = comLogo ? H * 0.42 : H * 0.7;
  }
  return r;
}

/** O fundo comum a todos os vídeos: preto ou a imagem, mais a logo com a placa e a faixa do título. */
function argsFundo({ L, imagem, logo, luminancia, saida }) {
  const entradas = [];
  const filtros = [];
  let atual;
  if (imagem) {
    entradas.push('-i', imagem);
    filtros.push(`[0:v]split=2[a][b];[a]scale=${L.W}:${L.H}:force_original_aspect_ratio=increase,crop=${L.W}:${L.H},boxblur=20:2,eq=brightness=-0.15[f];` +
      `[b]scale=${L.W}:${L.H}:force_original_aspect_ratio=decrease[m];[f][m]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[bg]`);
  } else {
    entradas.push('-f', 'lavfi', '-i', `color=c=black:s=${L.W}x${L.H}`);
    filtros.push('[0:v]setsar=1,format=yuv420p[bg]');
  }
  atual = 'bg';
  if (L.faixaTitulo) {
    filtros.push(`[${atual}]drawbox=x=0:y=${L.faixaTitulo.y}:w=${L.W}:h=${L.faixaTitulo.h}:color=black@0.72:t=fill[b1]`);
    atual = 'b1';
  }
  if (logo && L.logo) {
    entradas.push('-i', logo);
    const placa = corDaPlaca(luminancia);
    const p = L.logo.placa;
    filtros.push(`[${atual}]drawbox=x=${p.x}:y=${p.y}:w=${p.w}:h=${p.h}:color=${placa}:t=fill[b2]`);
    filtros.push(`[1:v]scale=${L.logo.w}:${L.logo.h},format=rgba[lg]`);
    filtros.push(`[b2][lg]overlay=${L.logo.x}:${L.logo.y}[fim]`);
    atual = 'fim';
  }
  return ['-y', '-v', 'error', ...entradas, '-filter_complex', filtros.join(';'), '-map', `[${atual}]`, '-frames:v', '1', saida];
}

/** Escreve o título (uma linha por arquivo de texto) sobre o fundo. */
function argsQuadro({ L, fundo, fonte, arquivosLinhas, tam, comImagem, saida }) {
  const passo = Math.round(tam * 1.4);
  const n = arquivosLinhas.length;
  const cor = comImagem ? '0xFFFFFF' : CREME;
  const textos = arquivosLinhas.map((arq, i) =>
    `drawtext=fontfile='${caminhoFiltro(fonte)}':textfile='${caminhoFiltro(arq)}':expansion=none:fontcolor=${cor}:fontsize=${tam}` +
    `:x=(w-tw)/2:y=${Math.round(L.tituloY + (i - (n - 1) / 2) * passo)}-th/2`);
  return ['-y', '-v', 'error', '-i', fundo, '-vf', textos.join(','), '-frames:v', '1', saida];
}

/** O vídeo: um quadro parado e o áudio. Som copiado quando já é MP3 ou AAC. */
function argsVideo({ quadro, audio, codec, saida }) {
  const copiar = ['mp3', 'aac'].includes(String(codec || '').toLowerCase());
  return ['-y', '-v', 'error', '-loop', '1', '-framerate', String(FPS), '-i', quadro, '-i', audio, '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'libx264', '-tune', 'stillimage', '-preset', 'veryfast', '-crf', '32', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', String(FPS * 10),
    ...(copiar ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '160k']), '-shortest', '-movflags', '+faststart', saida];
}

const NOMES_FORMATO = { horizontal: 'horizontal', vertical: 'vertical', quadrado: 'quadrado' };
const formaDe = (w, h) => (w > h * 1.1 ? 'horizontal' : h > w * 1.1 ? 'vertical' : 'quadrado');
/**
 * Avisos de quando a imagem escolhida combina mal com o formato. A imagem entra sempre inteira, sem
 * esticar, com o resto da tela preenchido por um fundo desfocado dela mesma; os avisos só aparecem
 * quando isso fica ruim: a imagem ocupa pouca tela, ou precisa ser ampliada demais.
 */
function avisosDaImagem(largura, altura, formato) {
  const [W, H] = TAMANHOS[formato] || TAMANHOS.horizontal;
  const avisos = [];
  if (!largura || !altura) return avisos;
  const f = Math.min(W / largura, H / altura);
  const cobertura = (largura * f * altura * f) / (W * H);
  const dela = formaDe(largura, altura);
  if (cobertura < 0.45) {
    avisos.push(`A imagem é ${dela} e o vídeo é ${NOMES_FORMATO[formato]}: ela ocupa só uns ${Math.round(cobertura * 100)} por cento da tela, e o resto é fundo desfocado.`);
  }
  if (f > 1.5) {
    avisos.push(`A imagem tem ${largura} por ${altura} e é pequena para este formato, de ${W} por ${H}: ao ser ampliada, ela pode ficar sem nitidez.`);
  }
  return avisos;
}

/** Frequência do bipe de andamento: sobe de 300 a 1800 Hz conforme a porcentagem. */
const frequenciaDoAndamento = (pct) => Math.round(300 + Math.max(0, Math.min(100, pct)) * 15);

module.exports = { AUDIO, IMAGEM, TAMANHOS, FPS, separarPasta, tituloDe, luminanciaDe, corDaPlaca, titularLinhas, layout, argsFundo, argsQuadro, argsVideo, avisosDaImagem, frequenciaDoAndamento, semExtensao };
