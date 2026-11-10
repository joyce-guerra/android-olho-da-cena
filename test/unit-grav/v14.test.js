'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const AA = require('../../src/atalhos-audio.js');

test('1.4: Alt P é Ouvir prévia', () => {
  assert.strictEqual(AA.acaoDaTecla({ key: 'p', code: 'KeyP', altKey: true, ctrlKey: false, shiftKey: false, metaKey: false }, { tagName: 'BUTTON' }), 'ouvirPrevia');
});
test('1.4: silêncios dentro do que já foi cortado à mão não contam', () => {
  const s = [{ inicio: 1, fim: 2 }, { inicio: 5, fim: 6 }, { inicio: 9, fim: 9.5 }];
  assert.deepStrictEqual(AA.silenciosQueFicam(s, [{ inicio: 4.5, fim: 7 }]), [s[0], s[2]]);
});
