'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const V = require('../src/video-post');
const P = require('../src/pastas-posts');

test('tamanhos por formato', () => {
  assert.deepStrictEqual(V.tamanhoDoPost('reel', 'story'), [1080, 1920]);
  assert.deepStrictEqual(V.tamanhoDoPost('video-feed', 'quadrada'), [1080, 1080]);
  assert.deepStrictEqual(V.tamanhoDoPost('video-feed', 'retrato-45'), [1080, 1350]);
  assert.strictEqual(V.tamanhoDoPost('nada', 'story'), null);
});
test('stories dividem em partes de 60 s, reel não', () => {
  assert.strictEqual(V.partesDoVideo(150, 'story-video').length, 3);
  assert.strictEqual(V.partesDoVideo(40, 'story-video').length, 1);
  assert.strictEqual(V.partesDoVideo(150, 'reel').length, 1);
});
test('ajuste: proporção certa não pede nada, horizontal pede fundo borrado', () => {
  assert.strictEqual(V.ajusteSugerido(1080, 1920, 1080, 1920), 'nenhum');
  assert.strictEqual(V.ajusteSugerido(1920, 1080, 1080, 1920), 'borrado');
  assert.match(V.filtroDoPost(1920, 1080, 1080, 1920, 'cortar'), /crop=1080:1920/);
  assert.match(V.filtroDoPost(1920, 1080, 1080, 1920, 'borrado'), /boxblur/);
});
test('argumentos: cartões entram na concatenação, legenda e loudnorm presentes', () => {
  const a = V.argumentosDoPost({ entrada: 'a.mp4', ini: 0, fim: 10, temAudio: true, w: 640, h: 360, W: 1080, H: 1920, ajuste: 'borrado', ass: 'x.ass', abertura: 'ab.png', fecho: 'fe.png', saida: 's.mp4' });
  const f = a[a.indexOf('-filter_complex') + 1];
  assert.match(f, /concat=n=3/); assert.match(f, /subtitles=/); assert.match(f, /loudnorm/);
  const b = V.argumentosDoPost({ entrada: 'a.mp4', ini: 0, fim: 10, temAudio: false, w: 1080, h: 1920, W: 1080, H: 1920, ajuste: 'nenhum', saida: 's.mp4' });
  assert.match(b.join(' '), /anullsrc/); assert.doesNotMatch(b[b.indexOf('-filter_complex') + 1], /concat=n=/);
});
test('avisos: sem som, longo demais, story dividido', () => {
  assert.ok(V.avisosDoVideo({ formato: 'reel', duracao: 30, largura: 1080, altura: 1920, temAudio: false, proporcao: 'story' }).some((x) => /não tem som/.test(x)));
  assert.ok(V.avisosDoVideo({ formato: 'reel', duracao: 2000, largura: 1080, altura: 1920, temAudio: true, proporcao: 'story' }).some((x) => /Corte o vídeo/.test(x)));
  assert.ok(V.avisosDoVideo({ formato: 'story-video', duracao: 150, largura: 1080, altura: 1920, temAudio: true, proporcao: 'story' }).some((x) => /3 stories/.test(x)));
});
test('pastas: posts soltos vão para Imagens, sem sobrescrever', () => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-'));
  for (const n of ['A', 'B', 'Imagens', 'Vídeos']) fs.mkdirSync(path.join(r, n));
  fs.mkdirSync(path.join(r, 'Imagens', 'B'));
  const m = P.migrarPostsParaImagens(r, fs);
  assert.deepStrictEqual(m.movidas, ['A']); assert.deepStrictEqual(m.deixadas, ['B']);
  assert.ok(fs.existsSync(path.join(r, 'Imagens', 'A')));
  assert.strictEqual(P.nomeDaSubpasta('video'), 'Vídeos'); assert.strictEqual(P.nomeDaSubpasta('imagem'), 'Imagens');
});

test('que vídeo serve: explicação por formato e avaliação de cada arquivo', () => {
  assert.match(V.explicacaoDoFormato('reel', 'story'), /vertical.*90 segundos.*Não é dividido/);
  assert.match(V.explicacaoDoFormato('story-video', 'story'), /dividido em partes de até 60 segundos/);
  assert.match(V.explicacaoDoFormato('video-feed', 'quadrada'), /quadrado.*10 minutos/);
  const base = { formato: 'reel', proporcao: 'story', temAudio: true };
  assert.strictEqual(V.avaliarVideo({ ...base, duracao: 40, largura: 1080, altura: 1920 }).nivel, 'bem');
  assert.strictEqual(V.avaliarVideo({ ...base, duracao: 40, largura: 1920, altura: 1080 }).nivel, 'ajuste');
  assert.strictEqual(V.avaliarVideo({ ...base, duracao: 2000, largura: 1080, altura: 1920 }).nivel, 'nao');
  assert.strictEqual(V.avaliarVideo({ ...base, duracao: 40, largura: 320, altura: 180 }).nivel, 'nao');
  assert.match(V.avaliarVideo({ formato: 'story-video', proporcao: 'story', duracao: 150, largura: 1080, altura: 1920, temAudio: false }).motivo, /sem som.*Vira 3 stories/);
});

test('o que acontece se passar: explicação, orientação de gravação e análise do tempo', () => {
  assert.match(V.explicacaoDoFormato('reel', 'story'), /Se passar de 3 minutos.*acima de 20 minutos ele não prepara/);
  assert.match(V.explicacaoDoFormato('video-feed', 'retrato-45'), /Se passar de 10 minutos.*acima de 60 minutos/);
  assert.match(V.explicacaoDoFormato('story-video', 'story'), /sem limite: quanto mais longo, mais stories/);
  assert.match(V.orientacaoDeGravacao('reel', 'story'), /Para o Reel, grave com o celular em pé.*90 segundos/);
  assert.doesNotMatch(V.orientacaoDeGravacao('reel', 'story'), /stories|feed/i);
  assert.match(V.orientacaoDeGravacao('story-video', 'story'), /a cada 60 segundos vira um story/);
  assert.match(V.orientacaoDeGravacao('video-feed', 'quadrada'), /quadrado/);
  const vert = { proporcao: 'story', largura: 1080, altura: 1920, temAudio: true };
  assert.strictEqual(V.analisarTempo({ formato: 'reel', duracao: 60, ...vert }).nivel, 'ok');
  assert.strictEqual(V.analisarTempo({ formato: 'reel', duracao: 120, ...vert }).nivel, 'limite');
  assert.strictEqual(V.analisarTempo({ formato: 'reel', duracao: 300, ...vert }).nivel, 'passou');
  const ex = V.analisarTempo({ formato: 'reel', duracao: 1500, ...vert });
  assert.strictEqual(ex.nivel, 'excede');
  assert.deepStrictEqual(ex.alternativas.map((x) => x.formato).sort(), ['story-video', 'video-feed']);
  const st = V.analisarTempo({ formato: 'story-video', duracao: 150, ...vert });
  assert.strictEqual(st.nivel, 'dividir'); assert.match(st.texto, /dividido em 3 stories/);
});
