// Role: adapter
'use strict';

const { validarPortaAndroidNativa } = require('./android-nativo-port');

const CONFIG_PADRAO_ANDROID = {
  organizacaoPastas: 'universal',
  confirmacao: 'fala_e_bipe',
  videosDescartados: 'lixeira',
  qualidadeMontar: 'rapida',
  disparoVolume: true,
  chaveNuvemIa: ''
};

/**
 * Implementação concreta da porta nativa Android.
 * Conecta-se à ponte Kotlin `@JavascriptInterface` (`window.OlhoAndroidNativo`) quando
 * executando dentro do WebView do Android, ou opera em memória durante testes automatizados.
 */
function criarAdaptadorAndroidNativo({
  ponteKotlin = null,
  pastaBase = '/storage/emulated/0/Documents/Olho da Cena',
  sdkInt = 33,
  areaTransferenciaInicial = ''
} = {}) {
  let configAtual = { ...CONFIG_PADRAO_ANDROID };
  let textoAreaTransferencia = String(areaTransferenciaInicial || '');
  const midiasIndexadas = [];
  const lixeiraLocal = [];
  const ouvintesInterrupcao = new Set();

  const nativo =
    ponteKotlin ||
    (typeof globalThis !== 'undefined' && globalThis.OlhoAndroidNativo
      ? globalThis.OlhoAndroidNativo
      : null);

  const despacharInterrupcao = (motivo) => {
    const m = String(motivo || 'perda-foco-transiente');
    ouvintesInterrupcao.forEach((fn) => fn(m));
  };

  if (typeof globalThis !== 'undefined') {
    globalThis.OlhoAoInterromperSistema = despacharInterrupcao;
  }
  if (nativo && typeof nativo.registrarCallbackInterrupcao === 'function') {
    nativo.registrarCallbackInterrupcao(despacharInterrupcao);
  }

  const adaptador = {
    async obterInfoDispositivo() {
      if (nativo && typeof nativo.obterInfoDispositivoJson === 'function') {
        try {
          return JSON.parse(nativo.obterInfoDispositivoJson());
        } catch (_) {
          // Segue para os dados padrão do adaptador se o JSON nativo falhar.
        }
      }
      return {
        plataforma: 'android',
        pastaBase,
        sdkInt,
        suportaAudioInterno: sdkInt >= 29,
        suportaLixeiraMediaStore: sdkInt >= 30
      };
    },

    async lerConfigNativa() {
      if (nativo && typeof nativo.lerConfigJson === 'function') {
        try {
          const lido = JSON.parse(nativo.lerConfigJson());
          configAtual = { ...configAtual, ...(lido || {}) };
        } catch (_) {
          // Mantém a configuração em memória caso ainda não exista arquivo salvo.
        }
      }
      return { ...configAtual };
    },

    async salvarConfigNativa(parcial) {
      configAtual = { ...configAtual, ...(parcial || {}) };
      if (nativo && typeof nativo.salvarConfigJson === 'function') {
        nativo.salvarConfigJson(JSON.stringify(configAtual));
      }
      return { ...configAtual };
    },

    async indexarMidiaGaleria({ caminhoCompleto, tipoMime }) {
      if (nativo && typeof nativo.indexarNoMediaStore === 'function') {
        const uri = nativo.indexarNoMediaStore(caminhoCompleto, tipoMime);
        return { indexado: true, uri: String(uri || caminhoCompleto) };
      }
      midiasIndexadas.push({ caminhoCompleto, tipoMime });
      return { indexado: true, uri: `content://media/external/file/${midiasIndexadas.length}` };
    },

    async compartilharArquivos({ arquivos = [], titulo = 'Compartilhar', texto = '' } = {}) {
      const lista = Array.isArray(arquivos) ? arquivos.filter(Boolean) : [];
      if (nativo && typeof nativo.compartilharArquivosJson === 'function') {
        nativo.compartilharArquivosJson(JSON.stringify({ arquivos: lista, titulo, texto }));
      }
      return { compartilhados: lista.length, titulo };
    },

    async lerAreaTransferencia() {
      if (nativo && typeof nativo.lerAreaTransferencia === 'function') {
        return String(nativo.lerAreaTransferencia() || '');
      }
      return textoAreaTransferencia;
    },

    async escreverAreaTransferencia(texto) {
      textoAreaTransferencia = String(texto || '');
      if (nativo && typeof nativo.escreverAreaTransferencia === 'function') {
        nativo.escreverAreaTransferencia(textoAreaTransferencia);
      }
      return { copiado: true, tamanho: textoAreaTransferencia.length };
    },

    async moverParaLixeira({ acao, arquivo, pastaDestino }) {
      if (nativo && typeof nativo.descartarMidiaJson === 'function') {
        nativo.descartarMidiaJson(JSON.stringify({ acao, arquivo, pastaDestino }));
      }
      lixeiraLocal.push({ acao, arquivo, pastaDestino });
      return { descartado: true, acao, arquivo };
    },

    aoEventoInterrupcao(callback) {
      if (typeof callback === 'function') {
        ouvintesInterrupcao.add(callback);
      }
      return () => ouvintesInterrupcao.delete(callback);
    },

    simularInterrupcaoSistema(motivo = 'perda-foco-transiente') {
      despacharInterrupcao(motivo);
    }
  };

  return validarPortaAndroidNativa(adaptador);
}

module.exports = {
  CONFIG_PADRAO_ANDROID,
  criarAdaptadorAndroidNativo
};
