'use strict';

const numero = (n) => String(n).replace('.', ',');

/** "5 segundos", "1 minuto", "1 minuto e 30 segundos". */
function duracaoFalada(seg) {
  const t = Math.max(0, Math.round(seg || 0));
  if (t >= 3600) {
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    return `${h} hora${h > 1 ? 's' : ''}${m ? ` e ${m} minuto${m > 1 ? 's' : ''}` : ''}`;
  }
  if (t >= 60) {
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    const mTxt = `${m} minuto${m > 1 ? 's' : ''}`;
    return s ? `${mTxt} e ${s} segundo${s > 1 ? 's' : ''}` : mTxt;
  }
  return `${t} segundo${t === 1 ? '' : 's'}`;
}

const dois = (n) => String(n).padStart(2, '0');

/** Nome do arquivo: "Vídeo 2026-10-27 12h30m05s (vertical).mp4". */
function nomeDoVideo(data, formato) {
  const d = data || new Date();
  const dia = `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
  const hora = `${dois(d.getHours())}h${dois(d.getMinutes())}m${dois(d.getSeconds())}s`;
  const f = formato === 'vertical' || formato === 'quadrado' ? formato : 'horizontal';
  return `Vídeo ${dia} ${hora} (${f}).mp4`;
}

/** "Vídeo ... (vertical) - fundo borrado.mp4" ou "... - fundo praia (amostra de 5 segundos).mp4". */
function nomeMelhorado(nomeOriginal, sufixo, amostra) {
  const base = String(nomeOriginal).replace(/\.mp4$/i, '');
  return `${base} - ${sufixo}${amostra ? ' (amostra de 5 segundos)' : ''}.mp4`;
}

/**
 * Nome do vídeo melhorado (0.3): "27-10 vertical 30 quadros fundo praia.mp4",
 * "27-10 horizontal 30 quadros fundo borrado e áudio melhorado.mp4",
 * "27-10 quadrado 30 quadros áudio melhorado amostra.mp4".
 * data = dia da gravação original; sufixo = "fundo ..." ou null (imagem sem efeito).
 */
function nomeMelhorado3({ data, formato, quadros = 30, sufixo = null, audio = false, amostra = false }) {
  const d = data instanceof Date && !isNaN(data) ? data : new Date();
  const f = formato === 'vertical' || formato === 'quadrado' ? formato : 'horizontal';
  const partes = [`${dois(d.getDate())}-${dois(d.getMonth() + 1)}`, f, `${Math.round(quadros) || 30} quadros`];
  if (sufixo) partes.push(sufixo);
  if (audio) partes.push(sufixo ? 'e áudio melhorado' : 'áudio melhorado');
  if (amostra) partes.push('amostra');
  return partes.join(' ') + '.mp4';
}

/**
 * 2.0.6: nome do vídeo pronto, sem data: "<título> - <fundo, se houver> - <orientação>.mp4".
 * Sem título, vale "Vídeo". Amostra ganha " (amostra)" no fim.
 */
function nomeDoResultado({ titulo, sufixo = null, formato, amostra = false }) {
  const limpo = String(titulo || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const f = formato === 'vertical' || formato === 'quadrado' ? formato : 'horizontal';
  const partes = [limpo || 'Vídeo'];
  if (sufixo) partes.push(sufixo);
  partes.push(f);
  return partes.join(' - ') + (amostra ? ' (amostra)' : '') + '.mp4';
}

/** Nome que ainda não existe na pasta: "nome.mp4", depois "nome 2.mp4", "nome 3.mp4"... */
function nomeSemRepetir(nome, existe) {
  // 1.9: o número entra antes da extensão, qualquer que seja ela (.mp4, .mp3, .srt, .txt).
  // Antes só .mp4 ganhava número, e um .srt repetido fazia o laço girar para sempre.
  const m = /^(.*?)(\.[^.\\/]+)?$/.exec(String(nome));
  const base = m[1], ext = m[2] || '';
  let n = nome;
  for (let i = 2; existe(n); i++) n = `${base} ${i}${ext}`;
  return n;
}

/**
 * Quanto tempo o leitor de tela leva, mais ou menos, para falar o texto
 * (velocidade padrão do NVDA, cerca de 13 letras por segundo, com folga).
 */
function duracaoEstimadaDaFala(texto) {
  return 0.8 + String(texto || '').length / 13;
}

module.exports = { numero, duracaoFalada, nomeDoVideo, nomeMelhorado, nomeMelhorado3, nomeDoResultado, nomeSemRepetir, duracaoEstimadaDaFala };
