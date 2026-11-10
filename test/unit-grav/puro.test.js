'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { frasesDoTexto, dividirFrases } = require('../../src/frases');
const { recorte, FORMATOS } = require('../../src/recorte');
const { quebrarLinhas, montarLegenda, medidasLegenda } = require('../../src/legenda');
const { duracaoFalada, nomeDoVideo } = require('../../src/tempo');
const { argumentosMp4, tempoDoProgresso } = require('../../src/conversao');

test('frases: divide sem cortar abreviações e junta linhas', () => {
  assert.deepStrictEqual(dividirFrases('O Sr. Silva chegou. Era tarde! Será? Sim.'), ['O Sr. Silva chegou.', 'Era tarde!', 'Será?', 'Sim.']);
  assert.deepStrictEqual(frasesDoTexto('# Título\n\nPrimeira frase. Segunda frase.\r\n\r\n- item com **negrito**'),
    ['Título', 'Primeira frase.', 'Segunda frase.', 'item com negrito']);
  assert.deepStrictEqual(frasesDoTexto('   \n\n '), []);
  assert.deepStrictEqual(dividirFrases('Custou 3.5 reais. Depois — Disse ela.'), ['Custou 3.5 reais.', 'Depois — Disse ela.']);
});

test('recorte: horizontal e vertical de câmera 16:9 e 4:3', () => {
  assert.deepStrictEqual(recorte(1920, 1080, 'horizontal'), { sx: 0, sy: 0, sw: 1920, sh: 1080 });
  assert.deepStrictEqual(recorte(1280, 720, 'vertical'), { sx: 438, sy: 0, sw: 405, sh: 720 });
  assert.deepStrictEqual(recorte(640, 480, 'horizontal'), { sx: 0, sy: 60, sw: 640, sh: 360 });
  const v = recorte(640, 480, 'vertical');
  assert.ok(Math.abs(v.sw / v.sh - 9 / 16) < 0.01 && v.sh === 480);
  assert.strictEqual(FORMATOS.vertical.largura, 1080);
  assert.strictEqual(FORMATOS.vertical.altura, 1920);
});

test('legenda: quebra em linhas e reduz a letra para caber em 3 linhas', () => {
  const medir = (s) => s.length * 10;
  assert.deepStrictEqual(quebrarLinhas('um dois três quatro', 90, medir), ['um dois', 'três', 'quatro']);
  const medirCom = (t) => (s) => s.length * t * 0.5;
  const curto = montarLegenda('Frase curta.', { largura: 800, tamanhoMax: 56, tamanhoMin: 34, maxLinhas: 3 }, medirCom);
  assert.strictEqual(curto.tamanho, 56);
  assert.strictEqual(curto.linhas.length, 1);
  const longo = 'palavra '.repeat(60).trim();
  const r = montarLegenda(longo, { largura: 800, tamanhoMax: 56, tamanhoMin: 34, maxLinhas: 3 }, medirCom);
  assert.strictEqual(r.tamanho, 34);
  assert.strictEqual(r.linhas.length, 3);
  assert.ok(r.linhas[2].endsWith('…'));
  const mv = medidasLegenda(1080, 1920), mh = medidasLegenda(1920, 1080);
  assert.ok(mv.margemBaixo > mh.margemBaixo && mv.largura < mh.largura);
});

test('tempo e nome do arquivo', () => {
  assert.strictEqual(duracaoFalada(1), '1 segundo');
  assert.strictEqual(duracaoFalada(42.4), '42 segundos');
  assert.strictEqual(duracaoFalada(65), '1 minuto e 5 segundos');
  assert.strictEqual(duracaoFalada(120), '2 minutos');
  assert.strictEqual(duracaoFalada(3720), '1 hora e 2 minutos');
  const d = new Date(2026, 9, 27, 9, 5, 3);
  assert.strictEqual(nomeDoVideo(d, 'vertical'), 'Vídeo 2026-10-27 09h05m03s (vertical).mp4');
  assert.strictEqual(nomeDoVideo(d, 'horizontal'), 'Vídeo 2026-10-27 09h05m03s (horizontal).mp4');
  assert.ok(!/[\\/:*?"<>|]/.test(nomeDoVideo(d, 'x')), 'nome válido no Windows');
});

test('conversão: argumentos do FFmpeg e leitura do progresso', () => {
  const a = argumentosMp4('in.webm', 'out.mp4');
  for (const x of ['libx264', 'aac', 'yuv420p', '+faststart']) assert.ok(a.includes(x), x);
  assert.strictEqual(a[a.length - 1], 'out.mp4');
  assert.strictEqual(tempoDoProgresso('frame=1 fps=0 time=00:01:02.50 bitrate'), 62.5);
  assert.strictEqual(tempoDoProgresso('nada'), null);
});
