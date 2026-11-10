'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const R = require('../../src/respiracoes');
const AA = require('../../src/atalhos-audio');

function sinal(segs, taxa = 16000) {
  // segs: [{ d, tipo: 'voz' | 'sopro' | 'nada' }]
  const out = []; let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (const s of segs) for (let i = 0; i < s.d * taxa; i++) {
    const t = i / taxa;
    out.push(s.tipo === 'voz' ? 0.2 * Math.sin(2 * Math.PI * 160 * t) + 0.1 * Math.sin(2 * Math.PI * 320 * t) + 0.001 * rnd()
      : s.tipo === 'sopro' ? 0.006 * rnd() : 0.00005 * rnd());
  }
  return Float32Array.from(out);
}

test('1.6: respiração (sopro sem tom de voz) entre falas é achada; pausa muda não', () => {
  const a = sinal([{ d: 1, tipo: 'voz' }, { d: 0.15, tipo: 'nada' }, { d: 0.4, tipo: 'sopro' }, { d: 0.1, tipo: 'nada' }, { d: 1, tipo: 'voz' },
    { d: 0.3, tipo: 'nada' }, { d: 1, tipo: 'voz' }]);
  const r = R.detectar(a, 16000);
  assert.strictEqual(r.length, 1, JSON.stringify(r));
  assert.ok(r[0].inicio > 1 && r[0].fim < 1.7, JSON.stringify(r));
});

test('1.6: juntar une silêncios e respirações que se cruzam', () => {
  assert.deepStrictEqual(R.juntar([{ inicio: 1, fim: 2 }], [{ inicio: 1.9, fim: 2.3 }, { inicio: 5, fim: 5.4 }]),
    [{ inicio: 1, fim: 2.3 }, { inicio: 5, fim: 5.4 }]);
});

test('1.6: cortar à mão só na Cortes; Início e Fim em qualquer ordem', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../ui/index.html'), 'utf8');
  for (const p of ['aus', 'aut', 'aue']) for (const b of ['inicio', 'fim', 'descartar', 'salvar-sel']) assert.ok(!html.includes(`id="${p}-${b}"`), `${p}-${b}`);
  const js = fs.readFileSync(path.join(__dirname, '../../ui/audio-cortes.js'), 'utf8');
  assert.ok(js.includes("parte() !== 'au-cortes'"));
  assert.ok(js.includes('inicio: Math.min(pd.t, t), fim: Math.max(pd.t, t)'));
});

test('1.6: fundos renomeados, ids iguais, sem masculino/feminino no que se vê ou ouve', () => {
  const TX = require('../../src/textos');
  const nome = (v) => TX.FUNDOS.find((f) => f.valor === v).nome;
  assert.strictEqual(nome('quarto-masculino'), 'Quarto sóbrio');
  assert.strictEqual(nome('quarto-feminino'), 'Quarto rosa');
  assert.strictEqual(nome('carro-masculino'), 'Carro executivo');
  assert.strictEqual(nome('carro'), 'Dentro de um carro popular com crochê');
  for (const f of TX.FUNDOS) assert.ok(!/masculin|feminin/i.test(f.nome + f.sufixo + f.descricao), f.valor);
});
