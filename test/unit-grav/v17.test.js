'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { listPresets, PRESETS } = require('../../src/presets');
const { FUNDOS } = require('../../src/textos');

test('1.7: todo preset tem nome, aplicação e descrição, nessa ordem', () => {
  for (const ctx of [undefined, 'titulo']) {
    for (const p of listPresets(ctx)) {
      assert.ok(p.nome && p.aplicacao, p.id);
      // 2.0: nome, indicação, contraindicação e descrição, nessa ordem.
      assert.match(p.descricao, /^Indicação: .+ Contraindicação: .+ Descrição: .+/, p.id);
    }
  }
  assert.strictEqual(listPresets().length, Object.keys(PRESETS).length);
});

test('1.7: Sala dos gatos com a torre à direita', () => {
  const f = FUNDOS.find((x) => x.valor === 'sala-dos-gatos');
  assert.match(f.cena, /À direita, contra a parede do fundo/);
  assert.doesNotMatch(f.cena, /No centro/);
});
