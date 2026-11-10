'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = require('../../src/padrao');
const TX = require('../../src/textos');
const F = require('../../src/formatos');
const D = require('../../src/divisao');
const PRE = require('../../src/presets');
const padrao = /^Indicação: .+ Contraindicação: .+ Descrição: .+/;

test('2.0: o texto padrão tira o "Bom para" e o "Menos indicado para" e marca cada parte', () => {
  assert.strictEqual(P.descricaoPadrao({ indicacao: 'Bom para música.', contraindicacao: 'Menos indicado para aula.', descricao: 'Mexe devagar' }),
    'Indicação: Música. Contraindicação: Aula. Descrição: Mexe devagar.');
});
test('2.0: toda escolha do programa diz indicação, contraindicação e descrição', () => {
  for (const lista of [TX.PROPORCOES, TX.QUALIDADES, TX.USOS_DO_TEXTO, TX.EFEITOS, TX.FUNDOS, F.listarFormatos(), F.listarQualidades(), D.ORIENTACOES, PRE.listPresets(), PRE.listPresets('titulo')]) {
    for (const x of lista) assert.match(x.descricao, padrao, x.nome);
  }
});
test('2.0: Montar tem o formato quadrado', () => {
  assert.ok(F.listarFormatos().some((f) => f.id === 'quadrado'));
});

test('2.0.2: o pedido do Alt Q manda não dizer gênero e a rede de segurança troca o substantivo', () => {
  const D = require('../../src/descritor');
  for (const i of ['pt', 'es', 'en']) assert.match(D.pedidoDe(i, 'quadro'), /maquiagem|maquillaje|makeup/i);
  assert.strictEqual(D.semGenero('Mostra uma mulher de óculos. O homem sorri.'), 'Mostra uma pessoa de óculos. A pessoa sorri.');
  assert.strictEqual(D.semGenero('Uma mulher. Diz: "Era uma vez uma menina".'), 'Uma pessoa. Diz: "Era uma vez uma menina".');
  assert.ok(D.pedidoDe('pt', 'quadro') !== D.pedidoDe('pt'));
});

test('2.0.5: converter áudios em lote: separar a pasta, título, bipes que sobem e avisos da imagem', () => {
  const L = require('../../src/lote');
  const r = L.separarPasta(['10 b.mp3', '2 a.mp3', 'logo.png', 'capa.jpg', 'z.jpg', '.x.mp3', 'notas.txt']);
  assert.deepStrictEqual(r.audios, ['2 a.mp3', '10 b.mp3']);
  assert.strictEqual(r.logo, 'logo.png'); assert.strictEqual(r.imagem, 'capa.jpg'); assert.strictEqual(r.avisos.length, 1);
  assert.strictEqual(L.tituloDe('Capítulo 3 - A casa.mp3'), 'Capítulo 3 - A casa');
  assert.strictEqual(L.frequenciaDoAndamento(0), 300); assert.strictEqual(L.frequenciaDoAndamento(100), 1800);
  assert.ok(L.frequenciaDoAndamento(30) < L.frequenciaDoAndamento(31));
  assert.strictEqual(L.avisosDaImagem(1920, 1080, 'horizontal').length, 0);
  assert.match(L.avisosDaImagem(1920, 1080, 'vertical')[0], /ocupa só uns \d+ por cento/);
  assert.match(L.avisosDaImagem(300, 200, 'horizontal')[0], /pequena/);
  assert.strictEqual(L.corDaPlaca(0.1), '0xF2EEE6'); assert.strictEqual(L.corDaPlaca(0.9), '0x101010');
  const lay = L.layout('quadrado', { comLogo: true, comImagem: true, logoLargura: 400, logoAltura: 200 });
  const t = L.titularLinhas('Um título bem longo '.repeat(6), lay.W, lay.base, lay.maxAltura);
  assert.ok(t.linhas.length * t.tam * 1.4 <= lay.maxAltura + 1);
});

test('2.0.6: nome do vídeo pronto: título, fundo se houver e orientação, sem data', () => {
  const T = require('../../src/tempo');
  assert.strictEqual(T.nomeDoResultado({ titulo: 'Meu conto: parte 1', sufixo: 'fundo escritório', formato: 'vertical' }), 'Meu conto parte 1 - fundo escritório - vertical.mp4');
  assert.strictEqual(T.nomeDoResultado({ titulo: 'Aula 3', formato: 'quadrado' }), 'Aula 3 - quadrado.mp4');
  assert.strictEqual(T.nomeDoResultado({ titulo: '', formato: 'horizontal', amostra: true }), 'Vídeo - horizontal (amostra).mp4');
  assert.ok(!/\d{2}-\d{2}/.test(T.nomeDoResultado({ titulo: 'x', sufixo: 'fundo praia', formato: 'vertical' })));
});

// 2.0.7: o recorte pode ser centrado em outro ponto da largura da câmera (para seguir o rosto).
test('recorte vertical segue o centro pedido e não passa das bordas', () => {
  const RC = require('../../src/recorte');
  const meio = RC.recorte(1280, 720, 'vertical');
  assert.strictEqual(meio.sx, Math.round((1280 - meio.sw) / 2));
  const esq = RC.recorte(1280, 720, 'vertical', 0.1);
  assert.strictEqual(esq.sx, 0);
  const dir = RC.recorte(1280, 720, 'vertical', 0.95);
  assert.strictEqual(dir.sx + dir.sw, 1280);
  const rosto = RC.recorte(1280, 720, 'vertical', 0.3);
  assert.ok(rosto.sx < 0.3 * 1280 && rosto.sx + rosto.sw > 0.3 * 1280);
  assert.deepStrictEqual(RC.recorte(1280, 720, 'horizontal', 0.2), { sx: 0, sy: 0, sw: 1280, sh: 720 });
});
