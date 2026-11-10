'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const AA = require('../../src/atalhos-audio');
const AU = require('../../src/audios');
const raiz = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(raiz, 'ui', 'index.html'), 'utf8');
test('1.8: Alt Z vira desfazer nas telas de áudio, fora de campo editável', () => {
  assert.strictEqual(AA.acaoDaTecla({ key: 'z', code: 'KeyZ', altKey: true }, null), 'desfazer');
  assert.strictEqual(AA.acaoDaTecla({ key: 'z', code: 'KeyZ', altKey: true }, { tagName: 'INPUT', type: 'text' }), null);
});
test('1.8: Configurações com os rótulos do plano e o Alt S da Joyce', () => {
  for (const t of ['data-nome="Configurações"', '<h1>Configurações</h1>', 'Pasta de arquivos do Olho da Cena', 'Som e beep', 'Só som', 'Só beep',
    'O Alt S salva em', 'Áudio e vídeo', 'Só vídeo', 'Só áudio', 'Vão para a Lixeira', 'São apagados em definitivo', 'Tipo de salvamento', 'Universal', 'Avançado']) assert.ok(html.includes(t), t);
});
test('1.8: telas de áudio numeradas no formato do Montar', () => {
  assert.ok(html.includes('Etapa 1 de 8: Áudio')); // 1.9: o Montar vídeo tem 8 etapas
  for (const [i, n] of [[1, 'Cortes'], [2, 'Silêncios e crossfade'], [3, 'Efeitos e trilhas'], [4, 'Equalização e ajustes']]) {
    assert.ok(html.includes(`>Etapa ${i}: ${n}</button>`)); assert.ok(html.includes(`>Etapa ${i} de 4: ${n}</h2>`));
  }
});
test('1.8: áudio importado em mono vira a mesma voz nos dois lados', () => {
  const a = AU.argsMontarAudio({ itens: [{ caminho: 'a.mp3' }], saida: 's.wav', mono: true });
  assert.ok(a.join(' ').includes('pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1'));
  assert.ok(!AU.argsMontarAudio({ itens: [{ caminho: 'a.mp3' }], saida: 's.wav' }).join(' ').includes('pan='));
});
test('1.8: falar, falarDepois e alertar continuam iguais', () => {
  const g = fs.readFileSync(path.join(raiz, 'ui', 'gravar.js'), 'utf8');
  for (const f of ['function falar(', 'function falarDepois(', 'function alertar(']) assert.ok(g.includes(f), f);
});
