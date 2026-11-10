'use strict';
/**
 * 1.0.4: som mono, com a voz nos dois ouvidos.
 *
 * As gravações da Joyce vêm com a voz só no canal da esquerda e o da direita
 * quase mudo. Fazer a média dos dois baixaria a voz pela metade e misturaria o
 * chiado do canal mudo; por isso o programa mede os canais (uma vez por
 * arquivo) e:
 *   - se um canal está quase mudo (20 dB ou mais abaixo do outro), usa só o bom;
 *   - se os dois têm som parecido, faz a média.
 * O filtro sai mono; o que vem depois (trilhas, MP3) pode voltar a ter dois
 * canais, mas com a voz igual nos dois.
 */
const fs = require('fs');
const { spawn } = require('child_process');

const DIFERENCA_MUDO = 20; // dB
const MUITO_BAIXO = -75;   // dB: abaixo disso o canal é tratado como mudo

/** Lê os níveis RMS por canal da saída do astats. */
function lerNiveis(texto) {
  const niveis = [];
  const re = /Channel:\s*(\d+)[\s\S]*?RMS level dB:\s*(-?inf|-?[\d.]+)/g;
  let m;
  while ((m = re.exec(String(texto || '')))) {
    const v = /inf/.test(m[2]) ? -Infinity : parseFloat(m[2]);
    niveis[Number(m[1]) - 1] = v;
  }
  return niveis.filter((v) => v !== undefined);
}

/** Filtro de mono para os níveis dos canais (null: já é mono ou não deu para medir). */
function filtroMono(niveis) {
  const n = (niveis || []).length;
  if (n < 2) return null;
  const vals = niveis.map((v) => (isFinite(v) ? v : -200));
  const maior = Math.max(...vals);
  const bom = vals.indexOf(maior);
  const bons = vals.map((v, i) => (v > MUITO_BAIXO && maior - v < DIFERENCA_MUDO ? i : -1)).filter((i) => i >= 0);
  if (bons.length <= 1) return `pan=mono|c0=c${bom}`;
  const peso = (1 / bons.length).toFixed(4);
  return `pan=mono|c0=${bons.map((i) => `${peso}*c${i}`).join('+')}`;
}

function argsMedirCanais(entrada) {
  return ['-hide_banner', '-nostats', '-i', entrada, '-map', '0:a:0', '-vn',
    '-af', 'astats=measure_overall=none:measure_perchannel=RMS_level', '-f', 'null', '-'];
}

const cache = new Map();
/** Filtro de mono do arquivo (guardado por nome, data e tamanho). */
async function filtroMonoDoArquivo(entrada, ffmpeg) {
  let st = null;
  try { st = fs.statSync(entrada); } catch (_) { /* */ }
  const chave = JSON.stringify({ entrada, t: st && st.mtimeMs, n: st && st.size });
  if (cache.has(chave)) return cache.get(chave);
  const texto = await new Promise((resolve) => {
    let erro = '';
    let p;
    try { p = spawn(ffmpeg, argsMedirCanais(entrada), { windowsHide: true }); } catch (_) { return resolve(''); }
    p.stderr.on('data', (d) => { erro += d.toString(); if (erro.length > 200000) erro = erro.slice(-100000); });
    p.on('error', () => resolve(''));
    p.on('close', () => resolve(erro));
  });
  const f = filtroMono(lerNiveis(texto));
  cache.set(chave, f);
  return f;
}

module.exports = { lerNiveis, filtroMono, argsMedirCanais, filtroMonoDoArquivo, DIFERENCA_MUDO };
