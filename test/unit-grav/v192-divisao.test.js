'use strict';
const test = require('node:test');
const assert = require('node:assert');
const D = require('../../src/divisao');

test('1.9.2: tempo em minutos e segundos, e 0 vale', () => {
  assert.strictEqual(D.lerTempo('1:30'), 90);
  assert.strictEqual(D.lerTempo('0'), 0);
  assert.strictEqual(D.lerTempo('1,5'), 90);
  assert.strictEqual(D.lerTempo('0:45'), 45);
  assert.strictEqual(D.lerTempo('abc'), null);
});
test('1.9.2: partes iguais; sobra pequena entra na última, sobra grande vira mais uma parte', () => {
  assert.deepStrictEqual(D.planejarPartes(620, 60).map((p) => p.fim - p.inicio), [60, 60, 60, 60, 60, 60, 60, 60, 60, 80]);
  assert.deepStrictEqual(D.planejarPartes(650, 60).map((p) => p.fim - p.inicio), [60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 50]);
  assert.deepStrictEqual(D.planejarPartes(100, 0), [{ inicio: 0, fim: 100 }]);
});
test('1.9.2: orientação: tamanhos e filtros', () => {
  assert.deepStrictEqual([D.filtroOrientacao('vertical', 1920, 1080).largura, D.filtroOrientacao('vertical', 1920, 1080).altura], [1080, 1920]);
  assert.match(D.filtroOrientacao('vertical-cheio', 1920, 1080).filtro, /crop=1080:1920/);
  assert.match(D.filtroOrientacao('vertical', 1920, 1080).filtro, /boxblur/);
  assert.deepStrictEqual([D.filtroOrientacao('manter', 1281, 721).largura, D.filtroOrientacao('manter', 1281, 721).altura], [1282, 722]);
});
test('1.9.2: avisos antes de mudar a orientação', () => {
  assert.ok(D.avisosOrientacao('vertical-cheio', 1920, 1080, true).some((a) => /pode ficar cortada no formato vertical/.test(a)));
  assert.ok(D.avisosOrientacao('horizontal', 1080, 1920, false).some((a) => /faixa estreita/.test(a)));
  assert.ok(D.avisosOrientacao('vertical', 1080, 1920, false).some((a) => /já é vertical/.test(a)));
  assert.deepStrictEqual(D.avisosOrientacao('manter', 1920, 1080, true), []);
});
test('1.9.2: legenda do trecho com os tempos a partir do começo do trecho', () => {
  const l = [{ inicio: 1, fim: 3, texto: 'a' }, { inicio: 9, fim: 12, texto: 'b' }, { inicio: 20, fim: 22, texto: 'c' }];
  assert.deepStrictEqual(D.legendasDoTrecho(l, 10, 20), [{ inicio: 0, fim: 2, texto: 'b' }]);
});
