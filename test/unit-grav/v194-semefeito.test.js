'use strict';
const test = require('node:test');
const assert = require('node:assert');
const AJ = require('../../src/ajuste');
const base = { nivelar: true, ganhoNivelar: 0, volume: 1, velocidade: 1, mono: false, limitador: true };
test('1.9.4: sem efeito no som quando nada muda e o pico já cabe abaixo do teto', () => {
  assert.strictEqual(AJ.semEfeitoNoSom(base, -3), true);
  assert.strictEqual(AJ.semEfeitoNoSom({ ...base, limitador: false }, undefined), true);
  assert.strictEqual(AJ.semEfeitoNoSom({ ...base, ganhoNivelar: undefined }, -3), false);
});
test('1.9.4: com ganho, pico alto, volume, velocidade ou mono, precisa regravar', () => {
  assert.strictEqual(AJ.semEfeitoNoSom({ ...base, ganhoNivelar: 2 }, -3), false);
  assert.strictEqual(AJ.semEfeitoNoSom(base, -0.2), false);
  assert.strictEqual(AJ.semEfeitoNoSom(base, undefined), false);
  assert.strictEqual(AJ.semEfeitoNoSom({ ...base, volume: 1.2 }, -3), false);
  assert.strictEqual(AJ.semEfeitoNoSom({ ...base, velocidade: 1.1 }, -3), false);
  assert.strictEqual(AJ.semEfeitoNoSom({ ...base, mono: 'pan=mono|c0=0.5*c0+0.5*c1' }, -3), false);
});
