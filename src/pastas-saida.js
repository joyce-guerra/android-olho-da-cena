'use strict';
// 3.0.3: onde cada arquivo é salvo. Duas maneiras, escolhidas em Configurações, "Tipo de salvamento".
//   Universal ('unica'): tudo na pasta escolhida, só com Áudios, Vídeos, Imagens e Extras.
//   Avançado ('dedicadas'): uma pasta para cada função, e dentro dela Áudios, Vídeos e Extras.
// Os posts não mudam: cada post tem a sua pasta em Posts, dentro de Imagens ou de Vídeos.
// Nada que já estava salvo é movido: o programa não tem como saber de qual função veio cada arquivo antigo.
const path = require('path');

const AUDIOS = 'Áudios', VIDEOS = 'Vídeos', IMAGENS = 'Imagens', EXTRAS = 'Extras', FOTOS = 'Fotos';
const MODOS = ['unica', 'dedicadas'];

/** Pasta de cada função, no salvamento avançado. */
const PASTA_DA_ORIGEM = { gravar: 'Gravar vídeo', montar: 'Montar vídeo', editar: 'Editar' };
const ORIGENS = ['gravar', 'montar', 'editar', 'audio', 'fotos', 'extras', 'posts'];

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i;
const IMAGEM_EXT = /\.(jpe?g|png|webp|gif|bmp)$/i;
const EXTRAS_EXT = /\.(txt|srt|md)$/i;

/** O tipo de um arquivo pelo nome: audio, imagem, extras ou video. */
function tipoDoArquivo(nome) {
  const n = String(nome || '');
  if (AUDIO_EXT.test(n)) return 'audio';
  if (IMAGEM_EXT.test(n)) return 'imagem';
  if (EXTRAS_EXT.test(n)) return 'extras';
  return 'video';
}

const modoValido = (m) => (m === 'dedicadas' ? 'dedicadas' : 'unica');
const origemValida = (o) => (ORIGENS.includes(o) ? o : 'gravar');

/**
 * Os nomes das pastas, de dentro para fora, abaixo da pasta base.
 * tipo: audio, video, imagem ou extras. origem: gravar, montar, editar, audio, fotos, extras ou posts.
 */
function caminhoRelativo(modo, origem, tipo) {
  const t = tipo === 'audio' || tipo === 'imagem' || tipo === 'extras' ? tipo : 'video';
  const nomeDoTipo = { audio: AUDIOS, video: VIDEOS, imagem: IMAGENS, extras: EXTRAS }[t];
  if (modoValido(modo) === 'unica') return [nomeDoTipo];
  const o = origemValida(origem);
  if (PASTA_DA_ORIGEM[o]) return [PASTA_DA_ORIGEM[o], nomeDoTipo === IMAGENS ? FOTOS : nomeDoTipo];
  if (o === 'audio') return t === 'extras' ? [AUDIOS, EXTRAS] : [AUDIOS];
  if (o === 'fotos') return t === 'extras' ? [FOTOS, EXTRAS] : [FOTOS];
  if (o === 'extras') return [EXTRAS];
  return [nomeDoTipo]; // posts: não passa por aqui; o que sobrar fica como no universal
}

/** O caminho completo da pasta. Não cria nada. */
function pastaDe(base, modo, origem, tipo) {
  return path.join(base, ...caminhoRelativo(modo, origem, tipo));
}

/** As pastas que o tipo de salvamento escolhido tem, para serem criadas logo que a pessoa o escolhe. */
function estruturaDe(modo) {
  if (modoValido(modo) === 'unica') return [[AUDIOS], [VIDEOS], [IMAGENS], [EXTRAS]];
  const l = [];
  for (const o of Object.values(PASTA_DA_ORIGEM)) l.push([o, AUDIOS], [o, VIDEOS], [o, EXTRAS]);
  l.push([AUDIOS], [AUDIOS, EXTRAS], [FOTOS], [EXTRAS]);
  return l;
}

/** Todas as pastas onde pode haver vídeos prontos, para procurar vídeos que servem a um post. */
function pastasDeVideos(base) {
  const l = [base, path.join(base, VIDEOS)];
  for (const o of Object.values(PASTA_DA_ORIGEM)) l.push(path.join(base, o, VIDEOS));
  return l;
}

module.exports = { AUDIOS, VIDEOS, IMAGENS, EXTRAS, FOTOS, MODOS, ORIGENS, PASTA_DA_ORIGEM, tipoDoArquivo, caminhoRelativo, pastaDe, estruturaDe, pastasDeVideos, modoValido, origemValida };
