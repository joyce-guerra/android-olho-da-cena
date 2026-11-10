'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const AA = require('../../src/atalhos-audio');
const raiz = path.join(__dirname, '..', '..');
test('1.7.1: setas para os lados andam meio segundo', () => { assert.strictEqual(AA.PASSO_SETA, 0.5); });
test('1.7.1: frase do texto lida uma vez (nome não muda com o foco nela) e sem "Começo do texto"', () => {
  const g = fs.readFileSync(path.join(raiz, 'ui', 'gravar.js'), 'utf8');
  const h = fs.readFileSync(path.join(raiz, 'ui', 'index.html'), 'utf8');
  assert.ok(!g.includes("'Começo do texto.'"));
  assert.ok(h.includes('aria-labelledby="frase-nome"'));
  assert.ok(h.includes('<p id="frase-texto" aria-hidden="true">'));
  const mover = g.slice(g.indexOf('function moverFrase'), g.indexOf('async function abrirTexto'));
  assert.ok(!mover.includes('frase-nome'));
  assert.strictEqual((mover.match(/falar\(/g) || []).length, 2);
});
test('1.7.1: o canal audiocortes:aplicar existe no preload', () => {
  assert.ok(fs.readFileSync(path.join(raiz, 'preload.js'), 'utf8').includes("'audiocortes:aplicar'"));
});
