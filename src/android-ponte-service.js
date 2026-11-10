// Role: service
'use strict';

const armazenamentoPolicy = require('./android-armazenamento-policy');
const interrupcaoPolicy = require('./android-interrupcao-policy');
const { validarPortaAndroidNativa } = require('./android-nativo-port');
const { criarAdaptadorAndroidNativo } = require('./android-nativo-adapter');

/**
 * Orquestra o contrato `window.api` no Android, conectando as políticas puras de
 * armazenamento (`Universal` vs `Avançado`), indexação na Galeria (`MediaStore`),
 * lixeira, área de transferência e proteção contra chamadas telefônicas/perda de foco.
 */
function criarPonteAndroid({
  adaptador = null,
  nativo = null,
  plataforma = 'android'
} = {}) {
  const porta = validarPortaAndroidNativa(
    adaptador || criarAdaptadorAndroidNativo({ ponteKotlin: nativo })
  );

  const ouvintesInterrupcao = new Set();
  const ouvintesProgresso = new Set();

  porta.aoEventoInterrupcao((motivo) => {
    ouvintesInterrupcao.forEach((fn) => fn({ motivo, plataforma }));
  });

  const registrarInterrupcaoAudio = (callback) => {
    if (typeof callback === 'function') {
      ouvintesInterrupcao.add(callback);
    }
    return () => ouvintesInterrupcao.delete(callback);
  };

  const api = {
    async lerConfig() {
      return porta.lerConfigNativa();
    },

    async salvarConfig(parcial) {
      return porta.salvarConfigNativa(parcial);
    },

    async resolverPastaSaida({ funcao = 'gravar-video', nomeArquivo = '' } = {}) {
      try {
        const [info, cfg] = await Promise.all([
          porta.obterInfoDispositivo(),
          porta.lerConfigNativa()
        ]);
        const destino = armazenamentoPolicy.resolverDestinoMidia({
          pastaBase: info.pastaBase,
          modoOrganizacao: cfg.organizacaoPastas || 'universal',
          funcao,
          nomeArquivo
        });
        if (destino.indexarGaleria && nomeArquivo) {
          await porta.indexarMidiaGaleria({
            caminhoCompleto: destino.caminhoCompleto,
            tipoMime: destino.tipoMime
          });
        }
        return {
          ...destino,
          ok: true,
          valor: destino
        };
      } catch (e) {
        return { ok: false, erro: e.message || String(e) };
      }
    },

    async compartilharMidia({ arquivos = [], titulo = 'Compartilhar', texto = '' } = {}) {
      try {
        const lista = Array.isArray(arquivos) ? arquivos.filter(Boolean) : [];
        if (lista.length === 0) {
          return { ok: false, erro: 'Nenhum arquivo selecionado para compartilhar.' };
        }
        const res = await porta.compartilharArquivos({
          arquivos: lista,
          titulo,
          texto
        });
        return { ok: true, valor: res };
      } catch (e) {
        return { ok: false, erro: e.message || String(e) };
      }
    },

    async colarTexto() {
      try {
        const texto = await porta.lerAreaTransferencia();
        return { ok: true, valor: { texto } };
      } catch (e) {
        return { ok: false, erro: e.message || String(e) };
      }
    },

    async copiarTexto(texto) {
      try {
        const res = await porta.escreverAreaTransferencia(texto);
        return { ok: true, valor: res };
      } catch (e) {
        return { ok: false, erro: e.message || String(e) };
      }
    },

    async descartarVideo({ arquivo } = {}) {
      try {
        const [info, cfg] = await Promise.all([
          porta.obterInfoDispositivo(),
          porta.lerConfigNativa()
        ]);
        const plano = armazenamentoPolicy.planejarDescarteVideo({
          arquivo,
          pastaBase: info.pastaBase,
          destinoConfig: cfg.videosDescartados || 'lixeira',
          sdkInt: info.sdkInt
        });
        const res = await porta.moverParaLixeira(plano);
        return { ok: true, valor: res };
      } catch (e) {
        return { ok: false, erro: e.message || String(e) };
      }
    },

    avaliarInterrupcaoGravacao(estadoGravacao) {
      return interrupcaoPolicy.avaliarEventoInterrupcao(estadoGravacao);
    },

    registrarInterrupcaoAudio,
    aoInterromperGravacao: registrarInterrupcaoAudio,

    aoProgresso(callback) {
      if (typeof callback === 'function') {
        ouvintesProgresso.add(callback);
      }
      return () => ouvintesProgresso.delete(callback);
    },

    async midiaUrl({ arquivo } = {}) {
      const limpo = armazenamentoPolicy.normalizarBarras(arquivo);
      return {
        ok: true,
        valor: {
          url: `app://olho/arquivo?p=${encodeURIComponent(limpo)}`
        }
      };
    },

    async appSair() {
      return { ok: true };
    }
  };

  return api;
}

if (typeof window !== 'undefined') {
  window.OlhoPonteAndroid = { criarPonteAndroid };
  if (!window.api) {
    window.api = criarPonteAndroid();
  }
}

module.exports = {
  criarPonteAndroid
};
