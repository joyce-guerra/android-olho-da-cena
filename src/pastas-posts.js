'use strict';
// 3.0.2: a pasta Posts tem duas subpastas: Imagens (posts de texto, carrossel, kit) e Vídeos (Reel, vídeo de feed, stories em vídeo).
// As pastas de post que já estavam soltas em Posts, de antes, vão para Imagens, uma vez só.
const path = require('path');

const PASTA_IMAGENS = 'Imagens';
const PASTA_VIDEOS = 'Vídeos';

/** O nome da subpasta de Posts para cada tipo de post. */
const nomeDaSubpasta = (tipo) => (tipo === 'video' ? PASTA_VIDEOS : PASTA_IMAGENS);

/**
 * Move as pastas de post soltas em Posts para Posts\Imagens. Não toca em Imagens nem em Vídeos, não sobrescreve nada
 * (se já existe uma pasta de mesmo nome em Imagens, a solta fica onde está) e devolve o que fez.
 * feito = false quer dizer que alguma pasta estava em uso: tenta de novo mais tarde.
 */
function migrarPostsParaImagens(raiz, fsx) {
  const r = { feito: true, movidas: [], deixadas: [] };
  let itens;
  try { itens = fsx.readdirSync(raiz, { withFileTypes: true }); } catch (_) { return r; }
  const soltas = itens.filter((e) => e.isDirectory() && e.name !== PASTA_IMAGENS && e.name !== PASTA_VIDEOS);
  if (!soltas.length) return r;
  const imagens = path.join(raiz, PASTA_IMAGENS);
  try { fsx.mkdirSync(imagens, { recursive: true }); } catch (_) { r.feito = false; return r; }
  for (const e of soltas) {
    const de = path.join(raiz, e.name), para = path.join(imagens, e.name);
    let existe = false;
    try { fsx.statSync(para); existe = true; } catch (_) { existe = false; }
    if (existe) { r.deixadas.push(e.name); continue; }
    try { fsx.renameSync(de, para); r.movidas.push(e.name); } catch (_) { r.feito = false; r.deixadas.push(e.name); }
  }
  return r;
}
module.exports = { PASTA_IMAGENS, PASTA_VIDEOS, nomeDaSubpasta, migrarPostsParaImagens };
