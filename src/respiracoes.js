'use strict';
/**
 * 1.6: respirações, só para o nível agressivo de silêncios.
 * Recebe o áudio mono (Float32Array) e procura trechos curtos que não são fala:
 * acima do limiar de silêncio, mas bem mais baixos que a voz e sem tom de voz
 * (sem periodicidade de 70 a 400 Hz na autocorrelação) — o ruído largo e soprado
 * da respiração. Funciona no Node (testes) e no processo principal.
 */
const PADRAO = {
  quadro: 0.03, passo: 0.01,      // janelas de 30 ms a cada 10 ms
  abaixoDaVoz: 12,                // dB abaixo da mediana dos quadros com voz
  vozMinima: 0.45,                // autocorrelação a partir da qual o quadro tem tom de voz
  acimaDoChao: 15,               // dB acima do chão de ruído para contar como sopro
  ateAbaixoDaVoz: 35,             // e no máximo isso abaixo da voz
  zcrMin: 0.1, zcrMax: 0.5,
  soproMin: 0.12,                 // segundos de sopro dentro do trecho
  duracaoMin: 0.2, duracaoMax: 1.2,
  margem: 0.03,
};

function analisar(amostras, taxa, opcoes = {}) {
  const o = { ...PADRAO, ...opcoes };
  const N = Math.round(o.quadro * taxa), H = Math.round(o.passo * taxa);
  const lagMin = Math.floor(taxa / 400), lagMax = Math.ceil(taxa / 70);
  const quadros = [];
  for (let i = 0; i + N + lagMax <= amostras.length; i += H) {
    let e = 0, zc = 0;
    for (let k = 0; k < N; k++) { const x = amostras[i + k]; e += x * x; if (k && (x >= 0) !== (amostras[i + k - 1] >= 0)) zc++; }
    const db = 10 * Math.log10(e / N + 1e-12);
    let melhor = 0;
    if (e > 0) {
      for (let lag = lagMin; lag <= lagMax; lag++) {
        let c = 0, e2 = 0;
        for (let k = 0; k < N; k++) { const y = amostras[i + k + lag]; c += amostras[i + k] * y; e2 += y * y; }
        const r = c / Math.sqrt(e * e2 + 1e-12);
        if (r > melhor) melhor = r;
      }
    }
    quadros.push({ t: i / taxa, db, voz: melhor, zcr: zc / N });
  }
  return quadros;
}

function mediana(v) { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : -99; }

/**
 * Trechos de respiração em segundos: [{ inicio, fim }].
 * Limiar mais alto que o do silêncio (relativo à voz da própria gravação) mais a checagem de espectro:
 * o trecho todo está bem abaixo da voz e sem tom de voz, e tem um sopro (pelo menos ~0,1 s
 * claramente acima do chão de ruído). Pausa muda entre palavras não tem sopro e fica.
 */
function detectar(amostras, taxa, opcoes = {}) {
  const o = { ...PADRAO, ...opcoes };
  const q = analisar(amostras, taxa, o);
  const chao = percentil(q.map((f) => f.db), 0.1);
  const vozDb = mediana(q.filter((f) => f.voz >= o.vozMinima && f.db > chao + 20).map((f) => f.db));
  const teto = vozDb - o.abaixoDaVoz;
  const candidato = (f) => f.db < teto && (f.voz < o.vozMinima || f.db < chao + 10); // no chão a autocorrelação é só ruído
  const piso = Math.max(chao + o.acimaDoChao, vozDb - o.ateAbaixoDaVoz);
  // Sopro: ruído largo e contínuo (cruzamentos por zero moderados); o chiado curto do "s" passa de 0,5.
  const sopro = (f) => f.db > piso && f.zcr >= o.zcrMin && f.zcr <= o.zcrMax;
  const out = [];
  let ini = -1;
  for (let i = 0; i <= q.length; i++) {
    const ok = i < q.length && candidato(q[i]);
    if (ok && ini < 0) ini = i;
    if (!ok && ini >= 0) {
      const trecho = q.slice(ini, i);
      const inicio = q[ini].t, fim = q[i - 1].t + o.quadro;
      const comSopro = trecho.filter(sopro).length * o.passo;
      if (fim - inicio >= o.duracaoMin && fim - inicio <= o.duracaoMax && comSopro >= o.soproMin) {
        out.push({ inicio: inicio + o.margem, fim: fim - o.margem });
      }
      ini = -1;
    }
  }
  return out;
}

function percentil(v, p) { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length * p)] : -99; }

/**
 * 1.7.2: o limiar do agressivo (-28 dB) é absoluto. Numa gravação baixa (microfone longe,
 * webcam) a fala inteira fica abaixo dele e tudo vira "silêncio". Mede a voz (95% dos
 * quadros de 30 ms ficam abaixo) e devolve quantos dB faltam para ela chegar a -20 dB.
 * Gravação em volume normal (voz por volta de -10 dB) dá 0: nada muda.
 */
const VOZ_ALVO_DB = -20, GANHO_MAX_DB = 40;
function ganhoParaVoz(amostras, taxa) {
  const N = Math.round(0.03 * taxa), H = Math.round(0.01 * taxa), d = [];
  for (let i = 0; i + N <= amostras.length; i += H) { let e = 0; for (let k = 0; k < N; k++) e += amostras[i + k] * amostras[i + k]; d.push(10 * Math.log10(e / N + 1e-12)); }
  if (!d.length) return 0;
  const voz = percentil(d, 0.95);
  return Math.max(0, Math.min(GANHO_MAX_DB, VOZ_ALVO_DB - voz));
}

/** Junta silêncios e respirações em ordem, unindo os que se encostam ou cruzam. */
function juntar(silencios, respiracoes) {
  const todos = [...silencios, ...respiracoes].map((t) => ({ inicio: t.inicio, fim: t.fim })).sort((a, b) => a.inicio - b.inicio);
  const out = [];
  for (const t of todos) {
    const u = out[out.length - 1];
    if (u && t.inicio <= u.fim + 0.05) u.fim = Math.max(u.fim, t.fim);
    else out.push(t);
  }
  return out;
}

/**
 * 1.8.1: silêncios pelo nível da própria voz. Voz = 95% dos quadros de 30 ms (a cada 10 ms)
 * ficam abaixo dela; silêncio = mais de 19 dB abaixo da voz. Por ser relativo à voz, gravação
 * baixa não vira "silêncio no vídeo inteiro". Cada pausa >= pausaMinima é cortada deixando
 * `deixar` segundos, metade antes e metade depois.
 */
function silenciosPelaVoz(amostras, taxa, { pausaMinima, deixar, abaixoDaVoz = 19 }) {
  const N = Math.round(0.03 * taxa), H = Math.round(0.01 * taxa), d = [];
  for (let i = 0; i + N <= amostras.length; i += H) { let e = 0; for (let k = 0; k < N; k++) e += amostras[i + k] * amostras[i + k]; d.push(10 * Math.log10(e / N + 1e-12)); }
  if (!d.length) return [];
  const limiar = percentil(d, 0.95) - abaixoDaVoz, out = [], meio = deixar / 2;
  for (let i = 0; i < d.length;) {
    if (d[i] >= limiar) { i++; continue; }
    let j = i; while (j < d.length && d[j] < limiar) j++;
    const ini = (i * H + N / 2) / taxa, fim = (j * H + N / 2) / taxa;
    if (fim - ini >= pausaMinima && fim - ini > deixar) out.push({ inicio: ini + meio, fim: fim - meio });
    i = j;
  }
  return out;
}

module.exports = { PADRAO, analisar, detectar, juntar, ganhoParaVoz, silenciosPelaVoz };
