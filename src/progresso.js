'use strict';
/**
 * Avisos de progresso para o leitor de tela: a cada 10% (ou `passo`), mas nunca
 * mais de um a cada `intervaloMin` milissegundos (em tarefas curtas pula marcos).
 */
function criarAvisoDeProgresso({ rotulo = 'Progresso', passo = 10, intervaloMin = 2000, agora = () => Date.now() } = {}) {
  let ultimoMarco = 0;
  let ultimoTempo = agora();
  return function aviso(pct) {
    const marco = Math.floor(Math.max(0, Math.min(100, pct)) / passo) * passo;
    if (marco <= ultimoMarco || marco >= 100) return null;
    const t = agora();
    if (t - ultimoTempo < intervaloMin) return null;
    ultimoMarco = marco;
    ultimoTempo = t;
    return `${rotulo}: ${marco} por cento.`;
  };
}

module.exports = { criarAvisoDeProgresso };
