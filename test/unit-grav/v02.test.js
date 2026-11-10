'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { recorte, tamanhoSaida, formatoValido, FORMATOS } = require('../../src/recorte');
const { QUALIDADES, qualidadeValida, codificacao, argumentosMp4 } = require('../../src/conversao');
const { criarAvisoDeProgresso } = require('../../src/progresso');
const { tamanhoMascara, trecho, quadrosDo, argumentosDecodificar, argumentosCompor } = require('../../src/melhorar');
const { nomeMelhorado, nomeDoVideo, duracaoEstimadaDaFala } = require('../../src/tempo');
const { medidasLegenda } = require('../../src/legenda');
const TX = require('../../src/textos');
const { suavizarMascara } = require('../../ui/mascara');

test('quadrado: recorte central e tamanhos por qualidade', () => {
  assert.deepStrictEqual([FORMATOS.quadrado.largura, FORMATOS.quadrado.altura], [1080, 1080]);
  assert.deepStrictEqual(recorte(1920, 1080, 'quadrado'), { sx: 420, sy: 0, sw: 1080, sh: 1080 });
  assert.deepStrictEqual(recorte(1280, 960, 'quadrado'), { sx: 160, sy: 0, sw: 960, sh: 960 });
  assert.strictEqual(formatoValido('quadrado'), 'quadrado');
  assert.strictEqual(formatoValido('xyz'), null);
  const t = (f, q) => { const r = tamanhoSaida(f, q); return `${r.largura}x${r.altura}`; };
  assert.deepStrictEqual(['horizontal', 'vertical', 'quadrado'].map((f) => ['alta', 'padrao', 'leve'].map((q) => t(f, q))),
    [['1920x1080', '1920x1080', '1280x720'], ['1080x1920', '1080x1920', '720x1280'], ['1080x1080', '1080x1080', '720x720']]);
});

test('qualidades: parâmetros do FFmpeg, som AAC 48 kHz e tamanho por hora coerente', () => {
  assert.strictEqual(qualidadeValida('padrao'), 'padrao');
  assert.strictEqual(qualidadeValida('toString'), null);
  for (const q of ['alta', 'padrao', 'leve']) {
    const c = codificacao(q);
    assert.ok(c.audio.join(' ').includes('-c:a aac') && c.audio.join(' ').includes('-ar 48000'), q);
    assert.ok(c.video.join(' ').includes('-r 30') && c.video.includes('libx264'), q);
  }
  // Tamanho por hora calculado pela taxa média (vídeo + som).
  const gbh = (kv, ka) => ((kv + ka) * 1000 * 3600) / 8 / 1e9;
  const p = gbh(3600, 160), l = gbh(1800, 128);
  assert.ok(p >= 1.5 && p <= 2, `padrão ${p}`);
  assert.ok(l >= 0.8 && l <= 1, `leve ${l}`);
  const a = argumentosMp4('e.webm', 's.mp4', 'leve').join(' ');
  assert.ok(a.includes('-b:v 1800k') && a.includes('-b:a 128k') && a.endsWith('s.mp4'), a);
  // As descrições faladas dizem o tamanho por hora.
  for (const q of TX.QUALIDADES) assert.match(q.descricao, /GB por hora|gigabytes? por hora/i, q.valor);
  assert.deepStrictEqual(TX.QUALIDADES.map((q) => q.valor), Object.keys(QUALIDADES));
});

test('textos das escolhas: todas com nome e descrição; cinco fundos (Olho da Cena: escritório e grafite), cada um em três formatos', () => {
  for (const lista of [TX.PROPORCOES, TX.QUALIDADES, TX.USOS_DO_TEXTO, TX.EFEITOS, TX.FUNDOS]) {
    for (const o of lista) assert.ok(o.valor && o.nome && o.descricao && o.descricao.length > 40, JSON.stringify(o));
  }
  assert.deepStrictEqual(TX.PROPORCOES.map((o) => o.valor), ['horizontal', 'vertical', 'quadrado']);
  assert.deepStrictEqual(TX.EFEITOS.map((o) => o.valor), ['borrar', 'substituir', 'nenhum']); // 1.3.1: Fundo original
  assert.deepStrictEqual(TX.FUNDOS.map((o) => o.valor), ['escritorio', 'estudio', 'biblioteca', 'sala-de-aula', 'indiano', 'grafite', 'capela', 'carro', 'carro-masculino', 'estacao-espacial', 'anime', 'quarto-feminino', 'quarto-masculino', 'sala', 'sala-dos-gatos', 'jardim', 'praia', 'ceu-estrelado', 'cafe']);
  assert.match(TX.EFEITOS[1].descricao, /cabelo|mão/i);
  const dir = path.join(__dirname, '..', '..', 'vendor', 'fundos');
  for (const f of TX.FUNDOS) for (const [fmt, w, h] of [['horizontal', 1920, 1080], ['vertical', 1080, 1920], ['quadrado', 1080, 1080]]) {
    const arq = path.join(dir, `${f.valor}-${fmt}.jpg`);
    const s = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', arq]).toString().trim();
    assert.strictEqual(s, `${w},${h}`, arq);
  }
});

test('progresso: avisa a cada 10%, sem repetir e sem falar demais', () => {
  let t = 0;
  const av = criarAvisoDeProgresso({ rotulo: 'Processando', agora: () => t });
  const falas = [];
  for (let p = 0; p <= 100; p += 1) { t += 300; const m = av(p); if (m) falas.push(m); }
  assert.deepStrictEqual(falas, [10, 20, 30, 40, 50, 60, 70, 80, 90].map((n) => `Processando: ${n} por cento.`));
  t = 0;
  const rapido = criarAvisoDeProgresso({ agora: () => t });
  const r = [];
  for (let p = 0; p <= 100; p += 5) { t += 100; const m = rapido(p); if (m) r.push(m); }
  assert.ok(r.length <= 2, r.join('|'));
});

test('melhorar: trecho da amostra, tamanhos e nomes', () => {
  assert.deepStrictEqual(trecho(60, true), { inicio: 27.5, duracao: 5 });
  assert.deepStrictEqual(trecho(3, true), { inicio: 0, duracao: 3 });
  assert.deepStrictEqual(trecho(60, false), { inicio: 0, duracao: 60 });
  assert.deepStrictEqual(tamanhoMascara(1920, 1080), { mw: 384, mh: 216 });
  assert.deepStrictEqual(tamanhoMascara(720, 1280), { mw: 216, mh: 384 });
  assert.deepStrictEqual(tamanhoMascara(720, 720), { mw: 288, mh: 288 });
  assert.strictEqual(quadrosDo(5), 150);
  assert.strictEqual(nomeMelhorado('Vídeo 2026-10-27 10h00m00s (horizontal).mp4', 'fundo borrado', false), 'Vídeo 2026-10-27 10h00m00s (horizontal) - fundo borrado.mp4');
  assert.strictEqual(nomeMelhorado('A.mp4', 'fundo consultório', true), 'A - fundo consultório (amostra de 5 segundos).mp4');
  assert.match(nomeDoVideo(new Date(2026, 9, 27, 9, 5, 7), 'quadrado'), /^Vídeo 2026-10-27 09h05m07s \(quadrado\)\.mp4$/);
  const d = argumentosDecodificar({ original: 'o.mp4', inicio: 2, duracao: 5, mw: 288, mh: 288 }).join(' ');
  assert.ok(d.includes('-ss 2 -t 5 -i o.mp4') && d.includes('scale=288:288') && d.includes('rawvideo'), d);
  const c = argumentosCompor({ original: 'o.mp4', saida: 's.mp4', efeito: 'substituir', fundoArq: 'f.jpg', largura: 1080, altura: 1080, mw: 288, mh: 288, inicio: 0, duracao: 5, qualidade: 'padrao' }).join(' ');
  assert.ok(c.includes('maskedmerge') && c.includes('-loop 1') && c.includes('f.jpg') && c.includes('-b:v 3600k') && c.includes('0:a:0?'), c);
  const b = argumentosCompor({ original: 'o.mp4', saida: 's.mp4', efeito: 'borrar', largura: 1920, altura: 1080, mw: 384, mh: 216, inicio: 0, duracao: 5, qualidade: 'alta' }).join(' ');
  assert.ok(b.includes('gblur=sigma=6') && !b.includes('-loop'), b);
});

test('melhorar: a máscara cinza põe a pessoa por cima do fundo com as cores certas (FFmpeg de verdade)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mascara-'));
  const orig = path.join(tmp, 'o.mp4'), fundo = path.join(tmp, 'f.png'), saida = path.join(tmp, 's.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0xC83214:s=320x320:r=30:d=1', '-f', 'lavfi', '-i', 'sine=d=1:sample_rate=48000',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', orig]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x1450C8:s=320x320', '-frames:v', '1', fundo]);
  const mw = 32, mh = 32;
  const m = Buffer.alloc(mw * mh);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) m[y * mw + x] = x < 16 ? 255 : 0; // pessoa à esquerda
  const quadros = Buffer.concat(Array.from({ length: 30 }, () => m));
  const args = argumentosCompor({ original: orig, saida, efeito: 'substituir', fundoArq: fundo, largura: 320, altura: 320, mw, mh, inicio: 0, duracao: 1, qualidade: 'padrao' });
  const r = spawnSync('ffmpeg', args, { input: quadros });
  assert.strictEqual(r.status, 0, String(r.stderr));
  const px = execFileSync('ffmpeg', ['-v', 'error', '-ss', '0.5', '-i', saida, '-frames:v', '1', '-vf', 'format=rgb24', '-f', 'rawvideo', '-']);
  const cor = (x, y) => [...px.subarray((y * 320 + x) * 3, (y * 320 + x) * 3 + 3)];
  const perto = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 14);
  assert.ok(perto(cor(40, 160), [0xC8, 0x32, 0x14]), 'pessoa ' + cor(40, 160));
  assert.ok(perto(cor(280, 160), [0x14, 0x50, 0xC8]), 'fundo ' + cor(280, 160));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('máscara: suaviza o ruído, acompanha o movimento e fica entre 0 e 255', () => {
  const n = 4;
  const anterior = new Float32Array([0, 1, 0.5, 0]);
  const saida = new Uint8Array(n);
  suavizarMascara(anterior, new Float32Array([0.1, 0.9, 0.55, 1]), saida);
  assert.ok(anterior[0] > 0 && anterior[0] < 0.1, 'ruído pequeno segue devagar ' + anterior[0]);
  assert.ok(anterior[3] > 0.95, 'movimento grande segue rápido ' + anterior[3]);
  assert.strictEqual(saida[0], 0);
  assert.strictEqual(saida[1], 255);
  assert.ok(saida[2] > 100 && saida[2] < 200, String(saida[2]));
});

test('fala do Alt E: duração estimada cresce com o texto; legenda proporcional ao tamanho', () => {
  const curta = duracaoEstimadaDaFala('Nenhum rosto.');
  const longa = duracaoEstimadaDaFala('Um rosto, um pouco deslocado para a sua direita. Vá um pouco para a sua esquerda. Mostrando até o peito.');
  assert.ok(curta > 1 && curta < 2.5 && longa > 7 && longa < 10, `${curta} ${longa}`);
  const a = medidasLegenda(1920, 1080), b = medidasLegenda(1280, 720), q = medidasLegenda(720, 720);
  assert.ok(Math.abs(b.tamanhoMax / a.tamanhoMax - 2 / 3) < 0.05, JSON.stringify([a, b]));
  assert.ok(q.largura <= 720 * 0.9, JSON.stringify(q));
});
