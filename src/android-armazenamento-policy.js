// Role: policy
'use strict';

const pastasSaida = require('./pastas-saida');

const MAPA_MIME = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain',
  '.srt': 'application/x-subrip'
};

function normalizarBarras(caminho) {
  return String(caminho || '').replace(/\\/g, '/').replace(/\/+/g, '/');
}

function juntarCaminhoPosix(...partes) {
  return normalizarBarras(
    partes
      .filter((p) => p !== null && p !== undefined && String(p).trim() !== '')
      .join('/')
  );
}

function inferirTipoMime(nomeArquivo) {
  const nome = String(nomeArquivo || '').toLowerCase();
  const idx = nome.lastIndexOf('.');
  if (idx < 0) return 'application/octet-stream';
  return MAPA_MIME[nome.slice(idx)] || 'application/octet-stream';
}

function deveIndexarNaGaleria(tipoMime) {
  return (
    tipoMime.startsWith('video/') ||
    tipoMime.startsWith('image/') ||
    tipoMime.startsWith('audio/')
  );
}

function mapearModoOrganizacao(modo) {
  const m = String(modo || '').toLowerCase();
  if (m === 'avancado' || m === 'dedicadas') return 'dedicadas';
  return 'unica';
}

function mapearOrigemFuncao(funcao) {
  const f = String(funcao || '').toLowerCase();
  if (f.startsWith('montar')) return 'montar';
  if (f.startsWith('editar') || f.startsWith('dividir') || f.startsWith('juntar')) return 'editar';
  if (f.startsWith('audio')) return 'audio';
  if (f.startsWith('foto')) return 'fotos';
  if (f.startsWith('post')) return 'posts';
  if (f.startsWith('extra') || f.startsWith('legenda')) return 'extras';
  return 'gravar';
}

/**
 * Resolve o destino de saída no Android preservando 100% da regra Universal/Avançado
 * de `src/pastas-saida.js`, adicionando também a subpasta especial `Fotos/fotos de vídeo`
 * quando uma foto é tirada durante a gravação de vídeo.
 */
function resolverDestinoMidia({
  pastaBase = '/storage/emulated/0/Documents/Olho da Cena',
  modoOrganizacao = 'universal',
  funcao = 'gravar-video',
  nomeArquivo = ''
} = {}) {
  const baseLimpa = normalizarBarras(pastaBase);
  const modoInterno = mapearModoOrganizacao(modoOrganizacao);
  let pasta;

  if (funcao === 'foto-de-video') {
    pasta =
      modoInterno === 'dedicadas'
        ? juntarCaminhoPosix(baseLimpa, 'Fotos', 'fotos de vídeo')
        : juntarCaminhoPosix(baseLimpa, 'Imagens', 'fotos de vídeo');
  } else {
    const origem = mapearOrigemFuncao(funcao);
    const tipo = pastasSaida.tipoDoArquivo(nomeArquivo || 'video.mp4');
    const partes = pastasSaida.caminhoRelativo(modoInterno, origem, tipo);
    pasta = juntarCaminhoPosix(baseLimpa, ...partes);
  }

  const tipoMime = inferirTipoMime(nomeArquivo);
  const caminhoCompleto = nomeArquivo
    ? juntarCaminhoPosix(pasta, nomeArquivo)
    : pasta;

  return {
    pasta,
    caminhoCompleto,
    tipoMime,
    indexarGaleria: deveIndexarNaGaleria(tipoMime)
  };
}

/**
 * Decide como descartar um vídeo conforme a configuração do usuário e a versão do Android:
 * - Se `destinoConfig === 'apagar'`, remove permanentemente.
 * - Se `destinoConfig === 'lixeira'` e Android 11+ (`sdkInt >= 30`), usa `MediaStore.createTrashRequest`.
 * - Caso contrário, move para `.lixeira` dentro da pasta `Olho da Cena`.
 */
function planejarDescarteVideo({
  arquivo,
  pastaBase = '/storage/emulated/0/Documents/Olho da Cena',
  destinoConfig = 'lixeira',
  sdkInt = 33
} = {}) {
  const caminhoLimpo = normalizarBarras(arquivo);
  if (destinoConfig === 'apagar') {
    return {
      acao: 'apagar-permanente',
      arquivo: caminhoLimpo,
      pastaDestino: null
    };
  }
  if (Number(sdkInt) >= 30) {
    return {
      acao: 'mediastore-trash',
      arquivo: caminhoLimpo,
      pastaDestino: null
    };
  }
  return {
    acao: 'pasta-lixeira-local',
    arquivo: caminhoLimpo,
    pastaDestino: juntarCaminhoPosix(pastaBase, '.lixeira')
  };
}

module.exports = {
  normalizarBarras,
  juntarCaminhoPosix,
  inferirTipoMime,
  deveIndexarNaGaleria,
  resolverDestinoMidia,
  planejarDescarteVideo
};
