'use strict';
// Teste de sanidade dos comandos novos, com mídia gerada na hora pelo FFmpeg.
// Roda com: npm test (precisa de ffmpeg e ffprobe no PATH).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const render = require('../src/render');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-teste-'));
const video = path.join(dir, 'entrada.mp4');
const trilha = path.join(dir, 'trilha.mp3');

function sonda(arq) {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', arq]).toString());
  const v = j.streams.find((s) => s.codec_type === 'video');
  const a = j.streams.find((s) => s.codec_type === 'audio');
  return { dur: Number(j.format.duration), v, a };
}

test.before(() => {
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30', '-f', 'lavfi',
    '-i', 'sine=frequency=440:sample_rate=48000', '-t', '20', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=44100', '-t', '6', trilha]);
});

test('Alt S: trecho horizontal com fade', async () => {
  const saida = path.join(dir, 'h.mp4');
  const r = await render.salvarTrecho({ entrada: video, inicio: 2, fim: 6.5, formato: 'horizontal', saida });
  assert.ok(r.ok);
  const s = sonda(saida);
  assert.ok(Math.abs(s.dur - 4.5) < 0.15, `duração ${s.dur}`);
  assert.equal(s.v.width, 640);
  assert.ok(s.a);
});

test('Alt S: trecho vertical 1080x1920', async () => {
  const saida = path.join(dir, 'v.mp4');
  const r = await render.salvarTrecho({ entrada: video, inicio: 0, fim: 3, formato: 'vertical', saida });
  assert.ok(r.ok);
  const s = sonda(saida);
  assert.equal(s.v.width, 1080);
  assert.equal(s.v.height, 1920);
  assert.ok(s.a);
});

test('Alt S: só áudio em mp3 e wav', async () => {
  for (const ext of ['mp3', 'wav']) {
    const saida = path.join(dir, 'a.' + ext);
    const r = await render.salvarTrecho({ entrada: video, inicio: 10, fim: 12, formato: 'audio', saida });
    assert.ok(r.ok);
    const s = sonda(saida);
    assert.ok(!s.v, 'não pode ter vídeo');
    assert.equal(s.a.codec_name, ext === 'mp3' ? 'mp3' : 'pcm_s16le');
    assert.ok(Math.abs(s.dur - 2) < 0.15, `duração ${s.dur}`);
  }
});

test('Salvar áudio (Editar): descartes + trilha', async () => {
  const saida = path.join(dir, 'editado.mp3');
  const r = await render.exportarAudio({
    entrada: video,
    descartes: [{ inicio: 0, fim: 3 }, { inicio: 10, fim: 12 }],
    camadas: [{ arquivo: trilha, tipo: 'loop', volume: 0.3, fadeEntrada: true, fadeSaida: true },
              { arquivo: trilha, tipo: 'estatico', tempo: 14, volume: 0.5 }],
    saida
  });
  assert.ok(r.ok, r.erro);
  const s = sonda(saida);
  assert.ok(Math.abs(s.dur - 15) < 0.3, `duração ${s.dur}`);
});

test('Salvar áudio (Montar): sem descartes, sem trilha, wav', async () => {
  const saida = path.join(dir, 'montado.wav');
  const r = await render.exportarAudio({ entrada: trilha, descartes: [], camadas: [], saida });
  assert.ok(r.ok, r.erro);
  assert.ok(Math.abs(sonda(saida).dur - 6) < 0.2);
});

test('Dividir na horizontal mantém o quadro', async () => {
  const pasta = fs.mkdtempSync(path.join(dir, 'div-'));
  const entrada = path.join(pasta, 'longo.mp4');
  fs.copyFileSync(video, entrada);
  const r = await render.dividirVideo({ entrada, tamanho: 10, orientacao: 'horizontal' }, () => {});
  assert.ok(r.ok, r.erro);
  assert.equal(r.partes, 2);
  const arqs = [];
  (function andar(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? andar(p) : arqs.push(p); } })(pasta);
  const parte = arqs.find((f) => /\.mp4$/.test(f) && f !== entrada);
  assert.equal(sonda(parte).v.width, 640);
});
