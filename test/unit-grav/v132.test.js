'use strict';
const test = require('node:test');
const assert = require('node:assert');
const AA = require('../../src/atalhos-audio.js');
const EQ = require('../../src/enquadramento.js');

const k = (key, extra = {}) => ({ key, code: extra.code || '', altKey: false, ctrlKey: false, shiftKey: false, metaKey: false, ...extra });

test('1.4: Espaço toca e pausa, como na 1.3.1; Control Espaço não faz nada', () => {
  assert.strictEqual(AA.acaoDaTecla(k(' ', { code: 'Space' }), { tagName: 'BUTTON' }), 'tocar');
  assert.strictEqual(AA.acaoDaTecla(k(' ', { ctrlKey: true, code: 'Space' }), { tagName: 'BUTTON' }), null);
  assert.strictEqual(AA.acaoDaTecla(k(' ', { code: 'Space' }), { tagName: 'INPUT', type: 'text' }), null);
});

// Grade 48 x 27 com cabelo onde f(x, y) (em 0..1) for verdadeiro.
function grade(f) {
  const gw = 48, gh = 27, g = [];
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) g.push(f((x + 0.5) / gw, (y + 0.5) / gh) ? 1 : 0);
  return { grade: g, gw, gh };
}
const rosto = { x: 0.42, y: 0.3, w: 0.16, h: 0.3, score: 0.95 };
const base = { rostos: [rosto], brilho: 128, largura: 1920, altura: 1080 };
const cabeca = (x, y) => y > 0.15 && y < 0.38 && x > 0.4 && x < 0.6;

test('1.3.2: cabelo curto', () => {
  const r = EQ.descreverEnquadramento({ ...base, cabelo: grade(cabeca) });
  assert.ok(/Cabelo curto\./.test(r.texto), r.texto);
  assert.ok(!/frente do rosto|cortado em cima|longo/.test(r.texto), r.texto);
});
test('1.3.2: cabelo longo e solto', () => {
  const r = EQ.descreverEnquadramento({ ...base, cabelo: grade((x, y) => cabeca(x, y) || (y > 0.15 && y < 0.95 && ((x > 0.36 && x < 0.43) || (x > 0.57 && x < 0.64)))) });
  assert.ok(/Cabelo longo e solto\./.test(r.texto), r.texto);
});
test('1.3.2: cabelo na frente do rosto', () => {
  const r = EQ.descreverEnquadramento({ ...base, cabelo: grade((x, y) => cabeca(x, y) || (y > 0.3 && y < 0.6 && x > 0.42 && x < 0.52)) });
  assert.ok(/Cabelo na frente do rosto\./.test(r.texto), r.texto);
});
test('1.3.2: cabelo cortado em cima (e não repete se o rosto já está cortado em cima)', () => {
  const r = EQ.descreverEnquadramento({ ...base, cabelo: grade((x, y) => y < 0.38 && x > 0.42 && x < 0.58) });
  assert.ok(/Cabelo cortado em cima: incline a câmera um pouco para cima ou se afaste um pouco\./.test(r.texto), r.texto);
  const alto = { x: 0.42, y: 0.05, w: 0.16, h: 0.3 };
  const r2 = EQ.descreverEnquadramento({ ...base, rostos: [alto], cabelo: grade((x, y) => y < 0.2 && x > 0.42 && x < 0.58) });
  assert.ok(/Rosto cortado em cima/.test(r2.texto) && !/Cabelo cortado em cima/.test(r2.texto), r2.texto);
});
test('1.3.2: sem cabelo perto da cabeça, ou sem a grade, não fala de cabelo', () => {
  assert.ok(!/Cabelo/.test(EQ.descreverEnquadramento({ ...base, cabelo: grade((x, y) => y > 0.85 && x < 0.2) }).texto));
  assert.ok(!/Cabelo/.test(EQ.descreverEnquadramento({ ...base }).texto));
});
