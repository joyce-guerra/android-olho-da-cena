'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const html = fs.readFileSync(path.join(__dirname, '../../ui/index.html'), 'utf8');
const AJ = require('../../src/ajuste.js');
const MONO = require('../../src/mono.js');
const secao = (id) => { const i = html.indexOf(`<section id="${id}"`); return html.slice(i, html.indexOf('</section>', i)); };
const textos = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('1.6: tela Equalização e ajustes: só predefinições do Editar (sem Personalizada), mono/estéreo, limitador, Alt P, três bandas e o fim universal', () => {
  const e = secao('au-eq');
  const t = textos(e);
  for (const x of ['Equalizações pré-definidas', 'Estéreo', 'Mono', 'Limitador de pico, para evitar estouros', 'Ouvir prévia, Alt P', 'Graves', 'Médios', 'Agudos', 'Tocar ou pausar, Espaço']) assert.ok(t.includes(x), x);
  assert.ok(!/Personalizada|Control Espaço/.test(t));
  assert.match(t, /Salvar e continuar Voltar Fechar\s*$/);
  assert.deepStrictEqual(AJ.PREDEFINICOES_EQ.map((p) => p.nome), ['Neutro', 'Voz mais clara', 'Menos abafada', 'Voz mais encorpada', 'Menos chiado']);
});
test('1.6: Efeitos e trilhas continua para a Equalização; o vídeo é salvo uma vez só, na Equalização', () => {
  const a = fs.readFileSync(path.join(__dirname, '../../ui/audio-cortes.js'), 'utf8');
  assert.match(a, /\$\('aut-continuar'\)\.addEventListener\('click', trilhasContinuar\)/);
  assert.match(a, /\$\('aue-continuar'\)\.addEventListener\('click', salvarEContinuar\)/);
  assert.strictEqual((a.match(/F\.chamar\('audiocortesSalvar'/g) || []).length, 1);
});
