'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('../src/marcas');

test('quatro marcas viram dois trechos (exemplo da Joyce)', () => {
  const m = M.criar();
  M.marcarInicio(m, 0);
  assert.deepEqual(M.marcarFim(m, 3, 900), { ok: true, numero: 1, trecho: { inicio: 0, fim: 3 } });
  M.marcarInicio(m, 600);
  const r = M.marcarFim(m, 720, 900);
  assert.equal(r.numero, 2);
  assert.deepEqual(m.trechos, [{ inicio: 0, fim: 3 }, { inicio: 600, fim: 720 }]);
  assert.equal(m.inicioAberto, null);
});

test('Alt F sem Alt I não marca nada', () => {
  const m = M.criar();
  assert.equal(M.marcarFim(m, 5).erro, 'sem-inicio');
  assert.equal(m.trechos.length, 0);
});

test('fim antes do início é recusado e o início continua aberto', () => {
  const m = M.criar();
  M.marcarInicio(m, 10);
  assert.equal(M.marcarFim(m, 8).erro, 'antes-do-inicio');
  assert.equal(m.inicioAberto, 10);
});

test('início sem fim fica pendente e não entra no lote', () => {
  const m = M.criar();
  M.marcarInicio(m, 1); M.marcarFim(m, 2);
  M.marcarInicio(m, 50);
  assert.equal(m.trechos.length, 1);
  assert.equal(m.inicioAberto, 50);
  assert.equal(M.paraDescarte(m.trechos).length, 1);
});

test('Alt I de novo troca o início aberto', () => {
  const m = M.criar();
  M.marcarInicio(m, 1);
  const r = M.marcarInicio(m, 4);
  assert.equal(r.substituiu, true);
  assert.equal(m.inicioAberto, 4);
});

test('fim limitado à duração do vídeo', () => {
  const m = M.criar();
  M.marcarInicio(m, 95);
  assert.equal(M.marcarFim(m, 120, 100).trecho.fim, 100);
});

test('descarte em lote: ordena e une trechos que se cruzam', () => {
  const t = [{ inicio: 600, fim: 720 }, { inicio: 0, fim: 3 }, { inicio: 2, fim: 5 }];
  assert.deepEqual(M.paraDescarte(t), [{ inicio: 0, fim: 5 }, { inicio: 600, fim: 720 }]);
  assert.deepEqual(M.emOrdem(t).map((x) => x.inicio), [0, 2, 600]);
});

test('limpar apaga trechos e início aberto', () => {
  const m = M.criar();
  M.marcarInicio(m, 1); M.marcarFim(m, 2); M.marcarInicio(m, 3);
  M.limpar(m);
  assert.deepEqual(m, { trechos: [], inicioAberto: null });
});

test('nomes numerados do Alt S em lote', () => {
  assert.deepEqual(M.nomesNumerados('C:\\v\\conto-trecho.mp4', 1), ['C:\\v\\conto-trecho.mp4']);
  assert.deepEqual(M.nomesNumerados('C:\\v\\conto-trecho.mp4', 2), ['C:\\v\\conto-trecho-01.mp4', 'C:\\v\\conto-trecho-02.mp4']);
  assert.deepEqual(M.nomesNumerados('/a.b/x', 2), ['/a.b/x-01', '/a.b/x-02']);
});
