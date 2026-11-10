'use strict';
/**
 * Melhorar áudio: volume, velocidade e equalizador, os mesmos do Voz da Cena 1.2.1
 * (mesmos limites, passos, predefinições e frases). Funções puras.
 * A velocidade muda o vídeo junto (imagem e som continuam sincronizados).
 */
const VOLUME = { min: 0.1, max: 3, passo: 0.1 };
const VELOCIDADE = { min: 0.5, max: 2.5, passo: 0.05 };

/** Equalizador simples: graves, médios e agudos, em decibéis. */
const EQ = { min: -12, max: 12, passo: 1 };
const EQ_NEUTRO = { graves: 0, medios: 0, agudos: 0 };
const PREDEFINICOES_EQ = [
  { id: 'neutro', nome: 'Neutro', eq: { graves: 0, medios: 0, agudos: 0 } },
  { id: 'clara', nome: 'Voz mais clara', eq: { graves: -2, medios: 2, agudos: 3 } },
  { id: 'menos-abafada', nome: 'Menos abafada', eq: { graves: -4, medios: 0, agudos: 5 } },
  { id: 'encorpada', nome: 'Voz mais encorpada', eq: { graves: 3, medios: 0, agudos: -1 } },
  { id: 'menos-chiado', nome: 'Menos chiado', eq: { graves: 0, medios: 0, agudos: -5 } }
];

const arred2 = (n) => Math.round(n * 100) / 100;

function normalizarEq(eq) {
  const c = (v) => Math.round(Math.min(EQ.max, Math.max(EQ.min, Number(v) || 0)));
  return { graves: c(eq && eq.graves), medios: c(eq && eq.medios), agudos: c(eq && eq.agudos) };
}
const eqNeutro = (eq) => { const n = normalizarEq(eq); return !n.graves && !n.medios && !n.agudos; };

/** Filtros do ffmpeg: prateleira de graves em 120 Hz, médios em 1,5 kHz, prateleira de agudos em 5 kHz. */
function filtroEq(eq) {
  const n = normalizarEq(eq);
  const f = [];
  if (n.graves) f.push(`bass=g=${n.graves}:f=120:t=s:w=0.6`);
  if (n.medios) f.push(`equalizer=f=1500:t=q:w=1:g=${n.medios}`);
  if (n.agudos) f.push(`treble=g=${n.agudos}:f=5000:t=s:w=0.6`);
  return f;
}

function nomeDoEq(eq) {
  const n = normalizarEq(eq);
  const p = PREDEFINICOES_EQ.find((x) => x.eq.graves === n.graves && x.eq.medios === n.medios && x.eq.agudos === n.agudos);
  return p ? p.nome : 'Personalizada';
}

function decibeisFalados(v) {
  const n = Math.round(Number(v) || 0);
  if (!n) return 'zero';
  return `${n > 0 ? 'mais' : 'menos'} ${Math.abs(n)} ${Math.abs(n) === 1 ? 'decibel' : 'decibéis'}`;
}

function mudarVolume(atual, direcao) {
  return arred2(Math.min(VOLUME.max, Math.max(VOLUME.min, (atual || 1) + direcao * VOLUME.passo)));
}
function mudarVelocidade(atual, direcao) {
  return arred2(Math.min(VELOCIDADE.max, Math.max(VELOCIDADE.min, (atual || 1) + direcao * VELOCIDADE.passo)));
}
const porcento = (n) => `${Math.round((n || 1) * 100)}%`;

/** atempo aceita de 0,5 a 2 por filtro; acima disso, encadeia. */
function cadeiaAtempo(v) {
  let r = Number(v) || 1;
  if (Math.abs(r - 1) < 1e-3) return [];
  const filtros = [];
  while (r > 2) { filtros.push('atempo=2'); r /= 2; }
  while (r < 0.5) { filtros.push('atempo=0.5'); r /= 0.5; }
  filtros.push(`atempo=${r.toFixed(4)}`);
  return filtros;
}

/** Ajuste completo e válido. */
function normalizarAjuste(a) {
  const v = Number(a && a.volume) || 1, s = Number(a && a.velocidade) || 1;
  return {
    volume: arred2(Math.min(VOLUME.max, Math.max(VOLUME.min, v))),
    velocidade: arred2(Math.min(VELOCIDADE.max, Math.max(VELOCIDADE.min, s))),
    eq: normalizarEq(a && a.eq)
  };
}
/** Ajuste que não muda nada (volume 100%, velocidade 100%, equalização neutra). */
function ajusteNeutro(a) {
  const n = normalizarAjuste(a);
  return Math.abs(n.volume - 1) < 1e-3 && Math.abs(n.velocidade - 1) < 1e-3 && eqNeutro(n.eq);
}

/** Filtro de som do ffmpeg (equalização, velocidade e volume, nessa ordem, como no Voz da Cena). */
function filtroAudio(a) {
  const n = normalizarAjuste(a);
  const f = [...filtroEq(n.eq), ...cadeiaAtempo(n.velocidade)];
  if (Math.abs(n.volume - 1) > 1e-3) f.push(`volume=${n.volume.toFixed(3)}`);
  return f.length ? f.join(',') : 'anull';
}
/** Filtro de imagem para a velocidade (vazio se 100%). */
function filtroVelocidadeVideo(a) {
  const v = normalizarAjuste(a).velocidade;
  return Math.abs(v - 1) < 1e-3 ? '' : `setpts=PTS/${v.toFixed(4)}`;
}

/** Frase do resumo: "Volume 120%, equalização Voz mais clara, velocidade 100%." */
function resumoDoAjuste(a) {
  const n = normalizarAjuste(a);
  return `Volume ${porcento(n.volume)}, equalização ${nomeDoEq(n.eq)}, velocidade ${porcento(n.velocidade)}.`;
}

module.exports = {
  VOLUME, VELOCIDADE, EQ, EQ_NEUTRO, PREDEFINICOES_EQ, normalizarEq, eqNeutro, filtroEq, nomeDoEq, decibeisFalados,
  mudarVolume, mudarVelocidade, porcento, cadeiaAtempo, normalizarAjuste, ajusteNeutro, filtroAudio, filtroVelocidadeVideo, resumoDoAjuste
};
