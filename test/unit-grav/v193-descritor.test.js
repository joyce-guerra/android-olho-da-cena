'use strict';
const test = require('node:test');
const assert = require('node:assert');
const D = require('../../src/descritor');

test('1.9.3: o pedido existe em português, espanhol e inglês, sem introdução', () => {
  for (const i of ['pt', 'es', 'en']) assert.ok(D.pedidoDe(i).length > 100, i);
  assert.match(D.pedidoDe('pt'), /português do Brasil/);
  assert.match(D.pedidoDe('es'), /español/);
  assert.match(D.pedidoDe('en'), /English/);
  assert.strictEqual(D.pedidoDe('xx'), D.pedidoDe('pt'));
});
test('1.9.3: limpa a abertura, a despedida e a marcação da resposta', () => {
  const bruto = '\nCom certeza! Aqui está uma descrição da imagem em português do Brasil:\n\n"A imagem mostra uma **mulher** de camisa azul."\n\n1.  Ao fundo, uma bandeira.\n\nEspero que esta descrição seja útil!\n';
  assert.strictEqual(D.limparResposta(bruto), 'A imagem mostra uma mulher de camisa azul. Ao fundo, uma bandeira.');
});
test('1.9.3: espanhol e inglês também perdem a abertura', () => {
  assert.strictEqual(D.limparResposta('Aquí tienes una descripción de la imagen:\nUna mujer con una camisa azul.'), 'Una mujer con una camisa azul.');
  assert.strictEqual(D.limparResposta("Here is a description:\nA woman in a blue shirt."), 'A woman in a blue shirt.');
});
test('1.9.3: resposta sem abertura fica como veio, numa linha só', () => {
  assert.strictEqual(D.limparResposta('Uma estante cheia de livros.\nUma luminária verde.'), 'Uma estante cheia de livros. Uma luminária verde.');
  assert.strictEqual(D.limparResposta(''), '');
});
