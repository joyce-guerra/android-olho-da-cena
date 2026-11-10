'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const TX = require('../../src/textos.js');
const RAIZ = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(RAIZ, 'ui', 'index.html'), 'utf8');
const grav = fs.readFileSync(path.join(RAIZ, 'ui', 'gravar.js'), 'utf8');
const main = fs.readFileSync(path.join(RAIZ, 'main.js'), 'utf8');

test('1.3.1: depois de gravar, sem Editar vídeo; Salvar e continuar vai para o áudio', () => {
  const sec = html.slice(html.indexOf('id="grav-decidir"'), html.indexOf('id="grav-pronto"'));
  assert.doesNotMatch(sec, /decidir-editar|Editar vídeo/);
  assert.match(grav, /\$\('melhorar'\)\.addEventListener\('click', salvarEContinuar\)/);
  assert.match(grav, /abrirAudioCortes\(st\.original\)/); // 1.8.5: imagem (fundo) antes, depois o áudio
  assert.doesNotMatch(html, /melhorar-pular|Continuar sem mudar a imagem|id="melhorar-audio"/);
});
test('1.3.1: a imagem vem por último, sobre o vídeo cortado (título depois dos cortes)', () => {
  // 1.9: entre o áudio e o título vem a tela de legenda; depois dela, abrirMelhorar.
  // 1.9.2: no Editar vídeo, depois do áudio vêm título e logo (editarDepoisDoAudio).
  assert.match(grav, /continuar: \(salvo\) => \{ st\.fonteMelhoria = salvo; if \(st\.editar\) editarDepoisDoAudio\(\); else abrirLegendaGravacao\(\); \}/);
  assert.match(grav, /aoTerminar: \(r\) => \{ st\.legenda = r; abrirMelhorar\(\); \}/);
  assert.match(grav, /arquivo: st\.fonteMelhoria\.arquivo/);
  assert.ok(TX.EFEITOS.find((e) => e.valor === 'nenhum' && e.nome === 'Fundo original'));
});
test('1.3.1: gravação fica temporária até salvar', () => {
  assert.match(main, /provisorio-\$\{Date\.now\(\)\}\.mp4/);
  assert.match(main, /lidar\('gravacao:guardar'/);
  assert.match(grav, /Vídeo gravado, ainda não salvo\./);
  assert.match(grav, /O vídeo ainda não foi salvo\. Aperte Voltar de novo para descartar e voltar/);
});
test('1.3.1: Céu estrelado no campo depois da Praia, com textos novos', () => {
  const v = TX.FUNDOS.map((f) => f.valor);
  assert.strictEqual(v.indexOf('ceu-estrelado'), v.indexOf('praia') + 1);
  const c = TX.FUNDOS.find((f) => f.valor === 'ceu-estrelado');
  assert.strictEqual(c.categoria, 'externos');
  assert.strictEqual(c.nome, 'Céu estrelado no campo');
  assert.strictEqual(c.indicacao, 'Bom para leitura de contos, histórias para dormir, reflexões e conversas tranquilas.');
  assert.match(c.cena, /Minas Gerais/); assert.match(c.cena, /cerca/);
  assert.strictEqual(TX.FUNDOS.find((f) => f.valor === 'biblioteca').indicacao, 'Bom para análises, debates, resenhas de livros e assuntos acadêmicos.');
  assert.strictEqual(TX.FUNDOS.find((f) => f.valor === 'sala-de-aula').indicacao, 'Bom para explicações, tutoriais e conteúdos escolares, do ensino fundamental ao médio.');
});
test('1.3.1: miniaturas decorativas, sem "fundo novo", explicação no topo', () => {
  assert.match(grav, /img\.alt = ''; img\.setAttribute\('aria-hidden', 'true'\)/);
  for (const f of TX.FUNDOS) assert.ok(fs.existsSync(path.join(RAIZ, 'vendor', 'fundos', 'mini', f.valor + '.jpg')), f.valor);
  assert.doesNotMatch(html + grav, /[Ff]undo novo/);
  assert.match(html, /<p id="mel-explica-fundo">O fundo substitui tudo o que aparece atrás de você por uma imagem, como um cenário\./);
  assert.match(html, /parede lisa atrás\.<\/p>/);
});
