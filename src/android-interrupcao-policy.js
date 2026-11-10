// Role: policy
'use strict';

const EVENTOS_DE_PERDA = new Set([
  'chamada-telefonica',
  'alarme',
  'perda-foco-transiente',
  'perda-foco-permanente',
  'microfone-indisponivel'
]);

/**
 * Avalia de forma pura o que o aplicativo deve fazer quando o sistema Android
 * reporta uma interrupção de áudio/chamada ou o retorno do foco de áudio.
 */
function avaliarEventoInterrupcao({
  tipoEvento,
  gravando = false,
  pausado = false,
  pausadoPorInterrupcao = false
} = {}) {
  const tipo = String(tipoEvento || '').trim().toLowerCase();

  if (EVENTOS_DE_PERDA.has(tipo)) {
    if (gravando && !pausado) {
      return {
        devePausarImediatamente: true,
        deveSincronizarPedacos: true,
        marcarPausadoPorInterrupcao: true,
        falaImediata: 'Gravação pausada automaticamente por uma interrupção do celular.',
        falaRetorno: null
      };
    }
    return {
      devePausarImediatamente: false,
      deveSincronizarPedacos: Boolean(gravando),
      marcarPausadoPorInterrupcao: Boolean(pausadoPorInterrupcao),
      falaImediata: null,
      falaRetorno: null
    };
  }

  if (tipo === 'retorno-foco' || tipo === 'retorno-app') {
    if (gravando && pausado && pausadoPorInterrupcao) {
      return {
        devePausarImediatamente: false,
        deveSincronizarPedacos: false,
        marcarPausadoPorInterrupcao: false,
        falaImediata: null,
        falaRetorno:
          'A gravação foi pausada por uma interrupção; toque em Continuar ou em Parar e guardar.'
      };
    }
  }

  return {
    devePausarImediatamente: false,
    deveSincronizarPedacos: false,
    marcarPausadoPorInterrupcao: false,
    falaImediata: null,
    falaRetorno: null
  };
}

module.exports = {
  EVENTOS_DE_PERDA,
  avaliarEventoInterrupcao
};
