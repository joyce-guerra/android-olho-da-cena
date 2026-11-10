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

/** Filtros do ffmpeg: prateleira de graves em 200 Hz (3.0.3: era 120 Hz, e a voz quase não sentia), médios em 1,5 kHz, prateleira de agudos em 5 kHz. */
function filtroEq(eq) {
  const n = normalizarEq(eq);
  const f = [];
  if (n.graves) f.push(`bass=g=${n.graves}:f=200:t=s:w=0.6`);
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

/**
 * Nivelar a voz (o "ajuste para internet" da 1.0.2/1.0.5): leva a voz para mais ou menos -16 LUFS
 * (o volume de referência de vídeos na internet), medindo o vídeo todo uma vez (ebur128) e aplicando
 * um ganho fixo no começo da cadeia. 1.3: sempre ligado no áudio depois da gravação, sem botão.
 * Sem limitador (como a 1.0.5); para não estourar, o ganho para antes de o pico passar de -1 dB.
 */
const NIVELAR = { alvo: -16, ganhoMin: -20, ganhoMax: 30, tetoPico: -1 };
/** Ganho em decibéis para levar a sonoridade medida (LUFS) ao alvo; null se não deu para medir.
 * pico (dBTP, opcional): o ganho não deixa o pico passar de NIVELAR.tetoPico. */
function ganhoParaNivelar(lufs, pico) {
  const l = Number(lufs);
  if (!isFinite(l) || l < -70) return null;
  let g = Math.min(NIVELAR.ganhoMax, Math.max(NIVELAR.ganhoMin, NIVELAR.alvo - l));
  const pk = Number(pico);
  if (pico !== undefined && pico !== null && isFinite(pk)) g = Math.min(g, Math.max(NIVELAR.ganhoMin, NIVELAR.tetoPico - pk));
  return Math.round(g * 10) / 10;
}

/**
 * 1.6: limitador de pico (o mesmo do commit 8fa9512, 1.0.2 candidatos, sem mudança): segura os
 * picos em -1 dBFS sem mexer no resto (level=0: sem nivelar sozinho; latency=1: compensa o atraso,
 * a voz continua junto da imagem). Na tela Equalização e ajustes a pessoa escolhe se usa.
 */
const LIMITADOR = 'alimiter=limit=0.891:attack=5:release=50:level=0:latency=1';
/** 1.6: filtro de mono válido (o de src/mono.js, da 1.0.4, commit 6b666c4). */
const filtroMonoValido = (f) => typeof f === 'string' && /^pan=mono\|c0=[\d.c*+]+$/.test(f);

/** Ajuste completo e válido. */
function normalizarAjuste(a) {
  const v = Number(a && a.volume) || 1, s = Number(a && a.velocidade) || 1;
  const n = {
    volume: arred2(Math.min(VOLUME.max, Math.max(VOLUME.min, v))),
    velocidade: arred2(Math.min(VELOCIDADE.max, Math.max(VELOCIDADE.min, s))),
    eq: normalizarEq(a && a.eq)
  };
  if (a && filtroMonoValido(a.mono)) n.mono = a.mono;
  if (a && a.limitador) n.limitador = true;
  if (a && a.nivelar) {
    n.nivelar = true;
    const g = Number(a.ganhoNivelar);
    if (a.ganhoNivelar !== null && a.ganhoNivelar !== undefined && isFinite(g)) {
      n.ganhoNivelar = Math.round(Math.min(NIVELAR.ganhoMax, Math.max(NIVELAR.ganhoMin, g)) * 10) / 10;
    }
  }
  return n;
}
/** Ajuste que não muda nada (volume 100%, velocidade 100%, equalização neutra). */
function ajusteNeutro(a) {
  const n = normalizarAjuste(a);
  return Math.abs(n.volume - 1) < 1e-3 && Math.abs(n.velocidade - 1) < 1e-3 && eqNeutro(n.eq) && !n.nivelar && !n.mono && !n.limitador;
}

/**
 * 1.9.4: true quando salvar não mudaria o som: nada de equalização, volume, velocidade ou mono, o
 * nivelamento automático não mexe (menos de 0,1 dB) e o limitador, se ligado, não tem o que segurar
 * porque o pico já está abaixo do teto dele (-1 dBFS). Aí o arquivo só é copiado, sem regravar.
 */
function semEfeitoNoSom(a, picoDb) {
  const n = normalizarAjuste(a);
  if (Math.abs(n.volume - 1) >= 1e-3 || Math.abs(n.velocidade - 1) >= 1e-3 || !eqNeutro(n.eq) || n.mono) return false;
  if (n.nivelar && (n.ganhoNivelar === undefined || Math.abs(n.ganhoNivelar) >= 0.1)) return false;
  if (!n.limitador) return true;
  const pk = Number(picoDb);
  return picoDb !== undefined && picoDb !== null && isFinite(pk) && pk <= -1.05;
}

/** Filtro de som do ffmpeg (equalização, velocidade e volume, nessa ordem, como no Voz da Cena). */
function filtroAudio(a) {
  const n = normalizarAjuste(a);
  const f = [];
  if (n.mono) f.push(n.mono); // 1.6: mono primeiro, com a voz nos dois ouvidos
  if (n.nivelar && n.ganhoNivelar && Math.abs(n.ganhoNivelar) >= 0.1) f.push(`volume=${n.ganhoNivelar.toFixed(1)}dB`);
  f.push(...filtroEq(n.eq), ...cadeiaAtempo(n.velocidade));
  if (Math.abs(n.volume - 1) > 1e-3) f.push(`volume=${n.volume.toFixed(3)}`);
  if (n.limitador) f.push(LIMITADOR); // 1.6: por último, como no 8fa9512
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
  mudarVolume, mudarVelocidade, LIMITADOR, filtroMonoValido, NIVELAR, ganhoParaNivelar, porcento, cadeiaAtempo, normalizarAjuste, ajusteNeutro, semEfeitoNoSom, filtroAudio, filtroVelocidadeVideo, resumoDoAjuste
};
