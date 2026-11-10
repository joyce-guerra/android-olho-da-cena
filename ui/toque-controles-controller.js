// Role: controller
'use strict';

/**
 * Controlador fino de gestos de toque TalkBack, botões móveis nas árvores de seleção,
 * navegação por toque no menu inicial, botão Voltar do Android e reação determinística
 * a interrupções de chamada/foco.
 */
function criarControladorToqueMobile({
  documento = typeof document !== 'undefined' ? document : null,
  falar = () => {}
} = {}) {
  let estadoGravacao = {
    gravando: false,
    pausado: false,
    pausadoPorInterrupcao: false,
    pausarCallback: null
  };

  function registrarGravacaoAtiva({ gravando, pausado, pausarCallback } = {}) {
    estadoGravacao = {
      ...estadoGravacao,
      gravando: Boolean(gravando),
      pausado: Boolean(pausado),
      pausarCallback: typeof pausarCallback === 'function' ? pausarCallback : null
    };
  }

  function tratarInterrupcaoAudio(avaliador, tipoEvento) {
    if (typeof avaliador !== 'function') return null;
    const decisao = avaliador({
      tipoEvento,
      gravando: estadoGravacao.gravando,
      pausado: estadoGravacao.pausado,
      pausadoPorInterrupcao: estadoGravacao.pausadoPorInterrupcao
    });
    if (decisao.devePausarImediatamente && estadoGravacao.pausarCallback) {
      estadoGravacao.pausado = true;
      estadoGravacao.pausadoPorInterrupcao = true;
      estadoGravacao.pausarCallback();
      if (decisao.falaImediata) falar(decisao.falaImediata);
    } else if (decisao.falaRetorno) {
      estadoGravacao.pausadoPorInterrupcao = false;
      falar(decisao.falaRetorno);
    }
    return decisao;
  }

  /**
   * Garante que um toque (click/duplo-toque no TalkBack) em qualquer grupo ou item
   * do menu inicial expanda/recolha o grupo e anuncie seu estado, ou acione o item folha.
   */
  function acionarToqueMenuInicial({ item, aoAbrirItemFolha } = {}) {
    if (!item) return { expandido: null, acionado: null };
    const ehGrupo = item.hasAttribute && item.hasAttribute('aria-expanded');
    if (ehGrupo) {
      const aberto = item.getAttribute('aria-expanded') === 'true';
      const novoEstado = !aberto;
      item.setAttribute('aria-expanded', novoEstado ? 'true' : 'false');
      const subgrupo = item.querySelector ? item.querySelector('[role="group"]') : null;
      if (subgrupo) subgrupo.hidden = !novoEstado;
      const nome = (item.dataset && item.dataset.nome) || item.id || 'Grupo';
      falar(`${nome}, ${novoEstado ? 'aberto' : 'fechado'}.`);
      return { expandido: novoEstado, acionado: null };
    }
    const id = item.id || (item.dataset && item.dataset.id) || '';
    if (typeof aoAbrirItemFolha === 'function') {
      aoAbrirItemFolha(id);
    }
    return { expandido: null, acionado: id };
  }

  /**
   * Anexa controles de toque explícitos ("Ouvir detalhes" e "Confirmar e fechar seleção")
   * a uma árvore de seleção (`ui/selecao.js`), suportando tanto `[role="treeitem"][data-id]`
   * quanto elementos `.radio` dentro de `fieldset.escolha`.
   */
  function enriquecerArvoreSelecaoParaToque({
    raiz,
    obterDetalhesOpcao,
    aoConfirmarFechamento
  } = {}) {
    if (!raiz || !documento) return { botoesDetalhes: 0, botaoConfirmar: false };
    const candidatos = [
      ...(raiz.querySelectorAll ? raiz.querySelectorAll('[role="treeitem"][data-id], .radio') : [])
    ];
    let botoesDetalhes = 0;

    candidatos.forEach((el) => {
      if (el.querySelector && el.querySelector('.btn-toque-detalhes')) return;
      const inputRadio = el.querySelector ? el.querySelector('input[type="radio"]') : null;
      const id = (el.dataset && el.dataset.id) || (inputRadio && inputRadio.value) || el.id || '';
      const btn = documento.createElement('button');
      btn.type = 'button';
      btn.className = 'secundario btn-toque-detalhes';
      btn.textContent = 'Ouvir detalhes';
      btn.addEventListener('click', (ev) => {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
        if (typeof obterDetalhesOpcao === 'function') {
          const texto = obterDetalhesOpcao(id, el);
          if (texto) falar(texto);
        } else if (Array.isArray(el._itens)) {
          falar(el._itens.map((x) => `${x.r}: ${x.t}`).join(' '));
        }
      });
      el.appendChild(btn);
      botoesDetalhes += 1;
    });

    let botaoConfirmar = false;
    const containerPai = raiz.parentElement || raiz;
    const jaTemConfirmar =
      containerPai.querySelector && containerPai.querySelector('.btn-toque-confirmar-arvore');
    if (!jaTemConfirmar) {
      const btnFechar = documento.createElement('button');
      btnFechar.type = 'button';
      btnFechar.className = 'secundario btn-toque-confirmar-arvore';
      btnFechar.textContent = 'Confirmar e fechar seleção';
      btnFechar.addEventListener('click', () => {
        if (typeof aoConfirmarFechamento === 'function') {
          aoConfirmarFechamento();
        }
      });
      containerPai.appendChild(btnFechar);
      botaoConfirmar = true;
    }

    return { botoesDetalhes, botaoConfirmar };
  }

  return {
    registrarGravacaoAtiva,
    tratarInterrupcaoAudio,
    acionarToqueMenuInicial,
    enriquecerArvoreSelecaoParaToque
  };
}

if (typeof window !== 'undefined') {
  window.ToqueControlesMobile = { criarControladorToqueMobile };
}

module.exports = {
  criarControladorToqueMobile
};
