'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { descreverEnquadramento, faixaDoCorpo } = require('../../src/enquadramento');

// Pose sintética: 33 pontos fora do quadro, e liga os pedidos.
function pose(pontos) {
  const p = Array.from({ length: 33 }, () => ({ x: 0.5, y: 1.4, v: 0.1 }));
  for (const [i, x, y, v = 0.95] of pontos) p[i] = { x, y, v };
  return p;
}
const OMBROS = [[11, 0.62, 0.8], [12, 0.38, 0.8]];
const QUADRIL = [[23, 0.56, 0.9], [24, 0.44, 0.9]];
const rosto = (cx, cy, w = 0.14, h = 0.25) => ({ x: cx - w / 2, y: cy - h / 2, w, h, score: 0.9 });

test('nenhum rosto', () => {
  const r = descreverEnquadramento({ rostos: [], pose: null, brilho: 120 });
  assert.strictEqual(r.texto, 'Nenhum rosto.');
  assert.strictEqual(r.dados.rostos, 0);
});

test('rosto centralizado, até os ombros', () => {
  const r = descreverEnquadramento({ rostos: [rosto(0.5, 0.42)], pose: pose(OMBROS), brilho: 120 });
  assert.match(r.texto, /^Um rosto, centralizado\./);
  assert.match(r.texto, /Mostrando até os ombros\./);
  assert.doesNotMatch(r.texto, /escuro|cortado|perto|longe/);
});

test('rosto à esquerda da imagem = à direita da pessoa; manda ir para a esquerda dela', () => {
  const r = descreverEnquadramento({ rostos: [rosto(0.35, 0.42)], pose: null, brilho: 120 });
  assert.match(r.texto, /um pouco deslocado para a sua direita\. Vá um pouco para a sua esquerda\./);
  const r2 = descreverEnquadramento({ rostos: [rosto(0.9, 0.42)], pose: null, brilho: 120 });
  assert.match(r2.texto, /bem deslocado para a sua esquerda\. Vá para a sua direita\./);
  assert.strictEqual(r2.dados.horizontal, 'esquerda');
});

test('cortes, distância e rosto baixo', () => {
  const alto = descreverEnquadramento({ rostos: [rosto(0.5, 0.12)], pose: null, brilho: 120 });
  assert.match(alto.texto, /Rosto cortado em cima\. Incline a câmera um pouco para cima/);
  const perto = descreverEnquadramento({ rostos: [rosto(0.5, 0.5, 0.45, 0.7)], pose: null, brilho: 120 });
  assert.match(perto.texto, /Muito perto da câmera/);
  const longe = descreverEnquadramento({ rostos: [rosto(0.5, 0.42, 0.04, 0.06)], pose: pose(OMBROS), brilho: 120 });
  assert.match(longe.texto, /longe da câmera/);
  const baixo = descreverEnquadramento({ rostos: [rosto(0.5, 0.75)], pose: null, brilho: 120 });
  assert.match(baixo.texto, /Rosto baixo na imagem/);
  const lado = descreverEnquadramento({ rostos: [{ x: -0.05, y: 0.4, w: 0.14, h: 0.25 }], pose: null, brilho: 120 });
  assert.match(lado.texto, /cortado à sua direita/);
});

test('faixas do corpo', () => {
  assert.strictEqual(faixaDoCorpo(pose([]), 1920, 1080), 'rosto');
  assert.strictEqual(faixaDoCorpo(pose([[11, 0.62, 0.95], [12, 0.38, 0.95]]), 1920, 1080), 'ombros');
  assert.strictEqual(faixaDoCorpo(pose([[11, 0.6, 0.6], [12, 0.4, 0.6]]), 1920, 1080), 'peito');
  assert.strictEqual(faixaDoCorpo(pose([...OMBROS, ...QUADRIL]), 1920, 1080), 'cintura');
  assert.strictEqual(faixaDoCorpo(pose([...OMBROS, ...QUADRIL, [25, 0.5, 0.95]]), 1920, 1080), 'joelhos');
  assert.strictEqual(faixaDoCorpo(pose([...OMBROS, ...QUADRIL, [27, 0.5, 0.97]]), 1920, 1080), 'inteiro');
  // Ponto pouco visível não conta.
  assert.strictEqual(faixaDoCorpo(pose([...OMBROS, [23, 0.5, 0.9, 0.2]]), 1920, 1080), 'ombros');
  const r = descreverEnquadramento({ rostos: [rosto(0.5, 0.1, 0.03, 0.05)], pose: pose([...OMBROS, ...QUADRIL, [27, 0.5, 0.97]]), brilho: 120 });
  assert.match(r.texto, /Mostrando o corpo inteiro\./);
  assert.doesNotMatch(r.texto, /longe/, 'corpo inteiro não reclama de distância');
});

test('vários rostos, escuro, e rosto achado só pela pose', () => {
  const r = descreverEnquadramento({ rostos: [rosto(0.3, 0.4, 0.1, 0.18), rosto(0.52, 0.4)], pose: null, brilho: 40 });
  assert.match(r.texto, /^Dois rostos\. O mais perto está centralizado\./);
  assert.match(r.texto, /Ambiente escuro\.$/);
  const muito = descreverEnquadramento({ rostos: [], pose: null, brilho: 10 });
  assert.strictEqual(muito.texto, 'Nenhum rosto. Ambiente muito escuro: quase nada aparece.');
  const pelaPose = descreverEnquadramento({ rostos: [], pose: pose([[0, 0.5, 0.2], [2, 0.51, 0.18], [5, 0.49, 0.18], [7, 0.52, 0.19], [8, 0.48, 0.19], ...QUADRIL, [27, 0.5, 0.97]]), brilho: 120 });
  assert.match(pelaPose.texto, /^Um rosto, centralizado\..*corpo inteiro/);
  const deCostas = descreverEnquadramento({ rostos: [], pose: pose([...OMBROS, ...QUADRIL]), brilho: 120 });
  assert.match(deCostas.texto, /^Nenhum rosto\. Aparece uma pessoa/);
});
