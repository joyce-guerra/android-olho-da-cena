// Role: port
'use strict';

const METODOS_OBRIGATORIOS_PORTA = [
  'obterInfoDispositivo',
  'lerConfigNativa',
  'salvarConfigNativa',
  'indexarMidiaGaleria',
  'compartilharArquivos',
  'lerAreaTransferencia',
  'escreverAreaTransferencia',
  'moverParaLixeira',
  'aoEventoInterrupcao'
];

/**
 * Valida se um objeto implementa o contrato abstrato da porta nativa Android.
 */
function validarPortaAndroidNativa(candidato) {
  if (!candidato || typeof candidato !== 'object') {
    throw new Error('Adaptador Android inválido: esperado um objeto.');
  }
  const ausentes = METODOS_OBRIGATORIOS_PORTA.filter(
    (nome) => typeof candidato[nome] !== 'function'
  );
  if (ausentes.length > 0) {
    throw new Error(
      `Adaptador Android incompleto; métodos ausentes: ${ausentes.join(', ')}`
    );
  }
  return candidato;
}

module.exports = {
  METODOS_OBRIGATORIOS_PORTA,
  validarPortaAndroidNativa
};
