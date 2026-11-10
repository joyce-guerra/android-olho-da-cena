'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../src/selecao');

test('itens novos entram selecionados', () => {
  const l = [{ inicio: 1, fim: 2 }, { inicio: 3, fim: 4 }];
  assert.equal(S.selecionados(l).length, 2);
  assert.equal(S.estadoTodos(l), 'todos');
});

test('estado: vazio, nenhum, alguns', () => {
  assert.equal(S.estadoTodos([]), 'vazio');
  assert.equal(S.estadoTodos([{ selecionado: false }]), 'nenhum');
  assert.equal(S.estadoTodos([{ selecionado: false }, {}]), 'alguns');
});

test('selecionar todos: marca tudo, e de novo desmarca tudo', () => {
  const l = [{ selecionado: false }, {}, { selecionado: false }];
  assert.equal(S.alternarTodos(l), true);
  assert.equal(S.estadoTodos(l), 'todos');
  assert.equal(S.alternarTodos(l), false);
  assert.equal(S.estadoTodos(l), 'nenhum');
  assert.equal(S.selecionados(l).length, 0);
});
