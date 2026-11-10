'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const P = require('../../src/pastas-saida');

const B = path.join('X', 'Olho da Cena');
const rel = (modo, o, t) => path.relative(B, P.pastaDe(B, modo, o, t)).split(path.sep).join('/');

test('universal: só Áudios, Vídeos, Imagens e Extras, em qualquer função', () => {
  for (const o of ['gravar', 'montar', 'editar', 'audio', 'fotos', 'extras']) {
    assert.equal(rel('unica', o, 'audio'), 'Áudios');
    assert.equal(rel('unica', o, 'video'), 'Vídeos');
    assert.equal(rel('unica', o, 'imagem'), 'Imagens');
    assert.equal(rel('unica', o, 'extras'), 'Extras');
  }
});
test('avançado: uma pasta por função com Áudios, Vídeos e Extras dentro', () => {
  assert.equal(rel('dedicadas', 'gravar', 'video'), 'Gravar vídeo/Vídeos');
  assert.equal(rel('dedicadas', 'gravar', 'audio'), 'Gravar vídeo/Áudios');
  assert.equal(rel('dedicadas', 'gravar', 'extras'), 'Gravar vídeo/Extras');
  assert.equal(rel('dedicadas', 'montar', 'video'), 'Montar vídeo/Vídeos');
  assert.equal(rel('dedicadas', 'montar', 'audio'), 'Montar vídeo/Áudios');
  assert.equal(rel('dedicadas', 'editar', 'audio'), 'Editar/Áudios');
  assert.equal(rel('dedicadas', 'editar', 'video'), 'Editar/Vídeos');
  assert.equal(rel('dedicadas', 'editar', 'extras'), 'Editar/Extras');
});
test('avançado: Gravar áudio, fotos e Extras soltos', () => {
  assert.equal(rel('dedicadas', 'audio', 'audio'), 'Áudios');
  assert.equal(rel('dedicadas', 'audio', 'extras'), 'Áudios/Extras');
  assert.equal(rel('dedicadas', 'fotos', 'imagem'), 'Fotos');
  assert.equal(rel('dedicadas', 'gravar', 'imagem'), 'Gravar vídeo/Fotos');
  assert.equal(rel('dedicadas', 'extras', 'extras'), 'Extras');
});
test('valores estranhos caem no universal e em Vídeos', () => {
  assert.equal(rel(undefined, 'qualquer', 'x'), 'Vídeos');
  assert.equal(P.modoValido('lixo'), 'unica');
});
test('o tipo vem da extensão do arquivo', () => {
  assert.equal(P.tipoDoArquivo('a.mp3'), 'audio');
  assert.equal(P.tipoDoArquivo('a.JPG'), 'imagem');
  assert.equal(P.tipoDoArquivo('a - legenda.srt'), 'extras');
  assert.equal(P.tipoDoArquivo('a.txt'), 'extras');
  assert.equal(P.tipoDoArquivo('a.mp4'), 'video');
});
test('vídeos prontos são procurados na raiz, em Vídeos e nos Vídeos de cada função', () => {
  const l = P.pastasDeVideos(B).map((p) => path.relative(B, p).split(path.sep).join('/'));
  assert.deepEqual(l, ['', 'Vídeos', 'Gravar vídeo/Vídeos', 'Montar vídeo/Vídeos', 'Editar/Vídeos']);
});

test('3.0.3: a contagem do post não conta os sinais de formatação', () => {
  const FT = require('../../src/fotos');
  assert.equal(FT.semMarcasPost('# Título').length, 'Título'.length);
  assert.equal(FT.semMarcasPost('Um **forte** e *outro*').length, 'Um forte e outro'.length);
  assert.equal(FT.semMarcasPost('- item um\n- item dois').length, 'item um\nitem dois'.length);
});

test('3.0.4: a estrutura de cada tipo de salvamento', () => {
  const rel = (m) => P.estruturaDe(m).map((r) => r.join('/'));
  assert.deepEqual(rel('unica'), ['Áudios', 'Vídeos', 'Imagens', 'Extras']);
  const av = rel('dedicadas');
  for (const p of ['Gravar vídeo/Áudios', 'Gravar vídeo/Vídeos', 'Gravar vídeo/Extras', 'Montar vídeo/Vídeos', 'Editar/Áudios', 'Editar/Extras', 'Áudios', 'Áudios/Extras', 'Fotos', 'Extras']) assert.ok(av.includes(p), p);
  assert.ok(!av.includes('Imagens'));
});
