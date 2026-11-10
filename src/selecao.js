'use strict';
/**
 * Seleção de itens de lista (silêncios detectados e descartes do Editar vídeo).
 * Um item está selecionado a menos que tenha `selecionado === false`, então
 * itens antigos ou recém-criados entram selecionados por padrão.
 * Funciona no Node (testes) e no navegador (window.Selecao).
 */
(function (raiz) {
  const estaSelecionado = (item) => item.selecionado !== false;

  function selecionados(lista) {
    return lista.filter(estaSelecionado);
  }

  /** 'vazio', 'todos', 'nenhum' ou 'alguns'. */
  function estadoTodos(lista) {
    if (!lista.length) return 'vazio';
    const n = selecionados(lista).length;
    if (n === lista.length) return 'todos';
    if (n === 0) return 'nenhum';
    return 'alguns';
  }

  /**
   * Selecionar todos: se já estão todos marcados, desmarca todos; senão,
   * marca todos. Devolve true quando terminou com todos marcados.
   */
  function alternarTodos(lista) {
    const marcar = estadoTodos(lista) !== 'todos';
    lista.forEach((item) => { item.selecionado = marcar; });
    return marcar;
  }

  const api = { estaSelecionado, selecionados, estadoTodos, alternarTodos };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Selecao = api;
})(typeof window !== 'undefined' ? window : globalThis);
