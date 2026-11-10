// Role: controller
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const armazenamentoPolicy = require('../src/android-armazenamento-policy');
const interrupcaoPolicy = require('../src/android-interrupcao-policy');
const { criarAdaptadorAndroidNativo } = require('../src/android-nativo-adapter');
const { criarPonteAndroid } = require('../src/android-ponte-service');
const { criarControladorToqueMobile } = require('../ui/toque-controles-controller');

test('Exemplo Concreto (Spec): criarPonteAndroid({ nativo, plataforma }) resolve pasta Universal e indexa Galeria', async () => {
  let cfgJson = '{}';
  const indexados = [];
  const nativoMock = {
    obterInfoDispositivoJson: () =>
      JSON.stringify({
        plataforma: 'android',
        pastaBase: '/storage/emulated/0/Documents/Olho da Cena',
        sdkInt: 33
      }),
    lerConfigJson: () => cfgJson,
    salvarConfigJson: (novo) => {
      cfgJson = novo;
    },
    indexarNoMediaStore: (caminho, mime) => {
      indexados.push({ caminho, mime });
      return `content://media/external/video/1`;
    }
  };

  const bridge = criarPonteAndroid({
    nativo: nativoMock,
    plataforma: 'android'
  });

  await bridge.salvarConfig({
    organizacaoPastas: 'universal',
    confirmacao: 'fala_e_bipe',
    videosDescartados: 'lixeira'
  });
  const destino = await bridge.resolverPastaSaida({
    funcao: 'gravar-video',
    nomeArquivo: 'meu-video.mp4'
  });

  assert.equal(destino.pasta, '/storage/emulated/0/Documents/Olho da Cena/Vídeos');
  assert.equal(destino.indexarGaleria, true);
  assert.equal(destino.ok, true);
  assert.equal(indexados.length, 1);
  assert.equal(indexados[0].mime, 'video/mp4');
});

test('Cenário 1 (Spec): navegação por toque no menu inicial expande grupo e abre item folha', () => {
  const falas = [];
  const abertos = [];
  const ctrl = criarControladorToqueMobile({
    falar: (msg) => falas.push(msg)
  });

  const subgrupo = { hidden: true };
  let expandidoAttr = 'false';
  const grupoGravar = {
    id: 'mi-grupo-gravar',
    dataset: { nome: 'Gravar' },
    hasAttribute: (k) => k === 'aria-expanded',
    getAttribute: (k) => (k === 'aria-expanded' ? expandidoAttr : null),
    setAttribute: (k, v) => {
      if (k === 'aria-expanded') expandidoAttr = v;
    },
    querySelector: (sel) => (sel === '[role="group"]' ? subgrupo : null)
  };

  const rGrupo = ctrl.acionarToqueMenuInicial({ item: grupoGravar });
  assert.equal(rGrupo.expandido, true);
  assert.equal(expandidoAttr, 'true');
  assert.equal(subgrupo.hidden, false);
  assert.equal(falas[0], 'Gravar, aberto.');

  const itemVideo = {
    id: 'mi-video',
    dataset: { nome: 'Gravar vídeo' },
    hasAttribute: () => false
  };
  const rFolha = ctrl.acionarToqueMenuInicial({
    item: itemVideo,
    aoAbrirItemFolha: (id) => abertos.push(id)
  });
  assert.equal(rFolha.acionado, 'mi-video');
  assert.deepEqual(abertos, ['mi-video']);
});

test('Cenário 2 (Spec): android-armazenamento-policy resolve Universal, Avançado e Lixeira Android 11+', () => {
  const base = '/storage/emulated/0/Documents/Olho da Cena';

  const universalVideo = armazenamentoPolicy.resolverDestinoMidia({
    pastaBase: base,
    modoOrganizacao: 'universal',
    funcao: 'gravar-video',
    nomeArquivo: 'ensaio.mp4'
  });
  assert.equal(universalVideo.pasta, '/storage/emulated/0/Documents/Olho da Cena/Vídeos');
  assert.equal(universalVideo.indexarGaleria, true);

  const avancadoFotoVideo = armazenamentoPolicy.resolverDestinoMidia({
    pastaBase: base,
    modoOrganizacao: 'avancado',
    funcao: 'foto-de-video',
    nomeArquivo: 'Camisa azul 01.jpg'
  });
  assert.equal(avancadoFotoVideo.pasta, '/storage/emulated/0/Documents/Olho da Cena/Fotos/fotos de vídeo');

  const planoSdk33 = armazenamentoPolicy.planejarDescarteVideo({
    arquivo: '/storage/emulated/0/Documents/Olho da Cena/Vídeos/rascunho.mp4',
    pastaBase: base,
    destinoConfig: 'lixeira',
    sdkInt: 33
  });
  assert.equal(planoSdk33.acao, 'mediastore-trash');

  const planoSdk29 = armazenamentoPolicy.planejarDescarteVideo({
    arquivo: '/storage/emulated/0/Documents/Olho da Cena/Vídeos/rascunho.mp4',
    pastaBase: base,
    destinoConfig: 'lixeira',
    sdkInt: 29
  });
  assert.equal(planoSdk29.acao, 'pasta-lixeira-local');
  assert.equal(planoSdk29.pastaDestino, '/storage/emulated/0/Documents/Olho da Cena/.lixeira');
});

test('Cenário 3 (Spec): enriquecerArvoreSelecaoParaToque cria botões Ouvir detalhes e Confirmar e fechar seleção', () => {
  const falas = [];
  let confirmacoes = 0;

  function criarElementoFake(tag) {
    const filhos = [];
    const ouvintes = {};
    return {
      tagName: tag.toUpperCase(),
      type: '',
      className: '',
      textContent: '',
      dataset: {},
      _filhos: filhos,
      appendChild(el) {
        filhos.push(el);
      },
      addEventListener(tipo, fn) {
        ouvintes[tipo] = fn;
      },
      clicar() {
        if (ouvintes.click) ouvintes.click({ stopPropagation: () => {} });
      },
      querySelector(sel) {
        if (sel === '.btn-toque-detalhes') {
          return filhos.find((x) => x.className.includes('btn-toque-detalhes')) || null;
        }
        if (sel === '.btn-toque-confirmar-arvore') {
          return filhos.find((x) => x.className.includes('btn-toque-confirmar-arvore')) || null;
        }
        if (sel === 'input[type="radio"]') {
          return { value: 'escritorio' };
        }
        return null;
      }
    };
  }

  const opcaoRadio = criarElementoFake('div');
  opcaoRadio.className = 'radio';
  const containerPai = criarElementoFake('div');
  const raizArvore = {
    parentElement: containerPai,
    querySelectorAll: () => [opcaoRadio]
  };

  const ctrl = criarControladorToqueMobile({
    documento: { createElement: criarElementoFake },
    falar: (msg) => falas.push(msg)
  });

  const info = ctrl.enriquecerArvoreSelecaoParaToque({
    raiz: raizArvore,
    obterDetalhesOpcao: (id) => `Tom: Sóbrio para ${id}. Indicação: Aulas. Contraindicação: Roupa escura.`,
    aoConfirmarFechamento: () => {
      confirmacoes += 1;
      falas.push('Seleção fechada. Boa combinação com a sua roupa.');
    }
  });

  assert.equal(info.botoesDetalhes, 1);
  assert.equal(info.botaoConfirmar, true);

  const btnDetalhes = opcaoRadio.querySelector('.btn-toque-detalhes');
  btnDetalhes.clicar();
  assert.match(falas[0], /Tom: Sóbrio para escritorio/);

  const btnConfirmar = containerPai.querySelector('.btn-toque-confirmar-arvore');
  btnConfirmar.clicar();
  assert.equal(confirmacoes, 1);
  assert.match(falas[1], /Boa combinação com a sua roupa/);
});

test('Cenário 4 (Spec): interrupção por chamada telefônica pausa gravação e avisa ao retornar', async () => {
  const falas = [];
  let pausas = 0;
  const adaptador = criarAdaptadorAndroidNativo({
    pastaBase: '/storage/emulated/0/Documents/Olho da Cena'
  });
  const api = criarPonteAndroid({ adaptador });
  const ctrl = criarControladorToqueMobile({ falar: (m) => falas.push(m) });

  ctrl.registrarGravacaoAtiva({
    gravando: true,
    pausado: false,
    pausarCallback: () => {
      pausas += 1;
    }
  });

  api.registrarInterrupcaoAudio(({ motivo }) => {
    ctrl.tratarInterrupcaoAudio(interrupcaoPolicy.avaliarEventoInterrupcao, motivo);
  });

  globalThis.OlhoAoInterromperSistema('chamada-telefonica');
  assert.equal(pausas, 1);
  assert.match(falas[0], /pausada automaticamente/);

  globalThis.OlhoAoInterromperSistema('retorno-foco');
  assert.match(falas[1], /A gravação foi pausada por uma interrupção; toque em Continuar ou em Parar e guardar/);
});
