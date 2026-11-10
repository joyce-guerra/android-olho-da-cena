'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const FR = require('./src/frases');
const RC = require('./src/recorte');
const LG = require('./src/legenda');
const EQ = require('./src/enquadramento');
const TP = require('./src/tempo');
const TX = require('./src/textos');
const PG = require('./src/progresso');
const CV = require('./src/conversao');
const AJ = require('./src/ajuste');
const OB = require('./src/objetos');

const chamar = (canal) => (dados) => ipcRenderer.invoke(canal, dados);
const canais = ['config:ler', 'config:salvar', 'app:versao', 'texto:abrir', 'gravacao:iniciar', 'gravacao:pedaco',
  'gravacao:descartar', 'gravacao:finalizar', 'pasta:abrir',
  'melhorar:iniciar', 'melhorar:quadro', 'melhorar:mascara', 'melhorar:concluir', 'melhorar:cancelar', 'melhorar:ouvir'];
const api = {};
for (const c of canais) api[c.replace(/:(\w)/g, (_, l) => l.toUpperCase())] = chamar(c);
api.aoProgresso = (fn) => {
  const h = (_e, d) => fn(d);
  ipcRenderer.on('conversao:progresso', h);
  return () => ipcRenderer.removeListener('conversao:progresso', h);
};
api.aoProgressoMelhoria = (fn) => {
  const h = (_e, d) => fn(d);
  ipcRenderer.on('melhorar:progresso', h);
  return () => ipcRenderer.removeListener('melhorar:progresso', h);
};
api.puro = {
  tamanhoSaida: RC.tamanhoSaida,
  formatoValido: RC.formatoValido,
  PROPORCOES: TX.PROPORCOES, QUALIDADES: TX.QUALIDADES, USOS_DO_TEXTO: TX.USOS_DO_TEXTO, EFEITOS: TX.EFEITOS, FUNDOS: TX.FUNDOS,
  criarAvisoDeProgresso: PG.criarAvisoDeProgresso,
  duracaoEstimadaDaFala: TP.duracaoEstimadaDaFala,
  bitsDoGravador: (q) => (CV.QUALIDADES[q] || CV.QUALIDADES.alta).gravador,
  frasesDoTexto: FR.frasesDoTexto,
  recorte: RC.recorte,
  FORMATOS: RC.FORMATOS,
  montarLegenda: LG.montarLegenda,
  medidasLegenda: LG.medidasLegenda,
  descreverEnquadramento: EQ.descreverEnquadramento,
  juntarRostos: EQ.juntarRostos,
  duracaoFalada: TP.duracaoFalada,
  testarEspelho: EQ.testarEspelho,
  descreverObjetos: OB.descreverObjetos,
  ESPELHO: TX.ESPELHO,
  ajuste: {
    VOLUME: AJ.VOLUME, VELOCIDADE: AJ.VELOCIDADE, EQ: AJ.EQ, PREDEFINICOES_EQ: AJ.PREDEFINICOES_EQ,
    normalizarEq: AJ.normalizarEq, nomeDoEq: AJ.nomeDoEq, decibeisFalados: AJ.decibeisFalados,
    mudarVolume: AJ.mudarVolume, mudarVelocidade: AJ.mudarVelocidade, porcento: AJ.porcento,
    normalizarAjuste: AJ.normalizarAjuste, ajusteNeutro: AJ.ajusteNeutro, resumoDoAjuste: AJ.resumoDoAjuste
  }
};
contextBridge.exposeInMainWorld('api', api);
