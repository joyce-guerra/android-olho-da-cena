'use strict';
/* Olho da Cena: a ponte entre a tela e o processo principal.
   Junta as funções do Gerador de Vídeo (Montar, Editar, Juntar, Dividir) e as do Gravador (Gravar, Melhorar). */
const { contextBridge, ipcRenderer } = require('electron');
const FR = require('./src/frases');
const RC = require('./src/recorte');
const LG = require('./src/legenda');
const EQ = require('./src/enquadramento');
const TP = require('./src/tempo');
const TX = require('./src/textos');
const PG = require('./src/progresso');
const CV = require('./src/conversao');
const OB = require('./src/objetos');
const AJ = require('./src/ajuste');
const DG = require('./src/diagnostico');
const { calcularFadesDeJuncao } = require('./src/cortar');

const api = {
  listarPresets: (contexto) => ipcRenderer.invoke('presets:listar', contexto),
  listarFormatos: () => ipcRenderer.invoke('formatos:listar'),
  listarQualidades: () => ipcRenderer.invoke('qualidades:listar'),
  verificarFFmpeg: () => ipcRenderer.invoke('ffmpeg:verificar'),

  limitesTitulo: () => ipcRenderer.invoke('titulos:limites'),
  lerTempo: (t) => ipcRenderer.invoke('titulos:lerTempo', t),
  escreverTempo: (s) => ipcRenderer.invoke('titulos:escreverTempo', s),
  conferirTitulos: (d) => ipcRenderer.invoke('titulos:conferir', d),

  escolherAudio: () => ipcRenderer.invoke('escolher:audio'),
  escolherSrt: () => ipcRenderer.invoke('escolher:srt'),
  escolherLogo: () => ipcRenderer.invoke('escolher:logo'),
  escolherImagens: () => ipcRenderer.invoke('escolher:imagens'),
  escolherImagemUnica: () => ipcRenderer.invoke('escolher:imagem-unica'),
  escolherVideos: () => ipcRenderer.invoke('escolher:videos'),
  analisarVideos: (d) => ipcRenderer.invoke('videos:analisar', d),
  juntarVideos: (c) => ipcRenderer.invoke('juntar:iniciar', c),
  escolherVideo: (titulo) => ipcRenderer.invoke('escolher:video', titulo),
  montarAudio: (d) => ipcRenderer.invoke('audio:montar', d),
  previaVelocidade: (d) => ipcRenderer.invoke('audio:previa-velocidade', d),
  planejarDivisao: (d) => ipcRenderer.invoke('dividir:planejar', d),
  dividirVideo: (c) => ipcRenderer.invoke('dividir:iniciar', c),
  planejarCortes: (d) => ipcRenderer.invoke('cortar:planejar', d),
  cortarVideo: (c) => ipcRenderer.invoke('cortar:iniciar', c),
  escolherSaida: (sugestao) => ipcRenderer.invoke('escolher:saida', sugestao),
  escolherSalvarComo: (opcoes) => ipcRenderer.invoke('escolher:salvar-como', opcoes),
  salvarTrecho: (c) => ipcRenderer.invoke('trecho:salvar', c),
  exportarAudio: (c) => ipcRenderer.invoke('audio:exportar', c),

  iniciarRender: (config) => ipcRenderer.invoke('render:iniciar', config),
  cancelarRender: () => ipcRenderer.invoke('render:cancelar'),
  previaMixagem: (config) => ipcRenderer.invoke('previa:mixagem', config),
  detectarSilencios: (config) => ipcRenderer.invoke('silencio:detectar', config),
  cortarAudio: (config) => ipcRenderer.invoke('audio:cortar', config),
  analisarImagens: (config) => ipcRenderer.invoke('imagens:analisar-compatibilidade', config),
  abrirPasta: (caminho) => ipcRenderer.invoke('abrir:pasta', caminho),
  ouvirAjuste: (d) => ipcRenderer.invoke('ajuste:ouvir', d),
  abrirVideoPorCaminho: (caminho) => ipcRenderer.invoke('video:abrir-caminho', caminho),

  aoProgresso: (cb) => {
    ipcRenderer.on('render:progresso', (_e, dados) => cb(dados));
  }
};

// Gravar e Melhorar: respostas no formato { ok, valor } ou { ok: false, erro }.
const chamar = (canal) => (dados) => ipcRenderer.invoke(canal, dados);
const canais = ['config:ler', 'config:salvar', 'app:versao', 'pastas:info', 'pastas:origem', 'editfoto:escolherpasta', 'editfoto:escolherfotos', 'area:copiar', 'fundo:salvarmoldura', 'texto:abrir', 'gravacao:iniciar', 'gravacao:pedaco',
  'gravacao:descartar', 'gravacao:finalizar', 'gravacao:apagar', 'app:sair', 'pasta:abrir',
  'melhorar:iniciar', 'analise:quadros', 'analise:registro', 'melhorar:quadro', 'melhorar:mascara', 'melhorar:concluir', 'melhorar:cancelar',
  'gravacao:guardar', 'melhorar:semFundo', 'audiocortes:abrir', 'audiocortes:previa', 'audiocortes:salvartrecho', 'audiocortes:salvar', 'audiocortes:aplicar', 'audiosilencios:detectar', 'audiosilencios:previa', 'audioeq:previa', 'config:pasta', 'audio:salvarestado', 'edicao:escolher', 'edicao:prepararaudio', 'montar:extrairaudio', 'legenda:estado', 'legenda:baixar', 'legenda:cancelar', 'legenda:transcrever', 'legenda:salvartexto', 'legenda:salvarsrt', 'legenda:montar', 'legenda:abrirsrt', 'salvar:copia', 'editar:detectar', 'editar:videodeimagem', 'escolher:foto', 'dividir:cortes', 'dividir:cancelar', 'imagem:medir', 'descritor:estado', 'descritor:baixar', 'descritor:descrever', 'descritor:cancelar', 'extras:salvartexto', 'quadro:salvar', 'foto:salvar', 'externo:abrir', 'atualizacao:reiniciar', 'post:preparar', 'postvideo:escolher', 'postvideo:avisos', 'postvideo:info', 'postvideo:sugerir', 'postvideo:explicacao', 'postvideo:orientacao', 'postvideo:analise', 'postvideo:preparar', 'postvideo:legendaTexto', 'post:salvar', 'post:listar', 'post:abrirpasta', 'post:legenda', 'midia:url', 'gaudio:finalizar', 'gaudio:guardar', 'gaudio:apagar', 'lote:escolherpasta', 'lote:conferir', 'lote:converter', 'lote:cancelar', 'atualizacao:verificar', 'atualizacao:instalar', 'atualizacao:cancelar'];
for (const c of canais) api[c.replace(/:(\w)/g, (_, l) => l.toUpperCase())] = chamar(c);
api.aoAndamentoPostVideo = (fn) => {
  const h = (_e, d) => fn(d);
  ipcRenderer.on('postvideo:andamento', h);
  return () => ipcRenderer.removeListener('postvideo:andamento', h);
};
api.aoAndamentoDivisao = (fn) => {
  const h = (_e, d) => fn(d);
  ipcRenderer.on('dividir:andamento', h);
  return () => ipcRenderer.removeListener('dividir:andamento', h);
};
api.aoAndamentoLote = (fn) => {
  const h = (_e, d) => fn(d);
  ipcRenderer.on('lote:andamento', h);
  return () => ipcRenderer.removeListener('lote:andamento', h);
};
api.aoProgressoAtualizacao = (fn) => {
  const h = (_e, d) => fn(d);
  ipcRenderer.on('atualizacao:progresso', h);
  return () => ipcRenderer.removeListener('atualizacao:progresso', h);
};
api.aoProgressoDescritor = (fn) => {
  const h = (_e, d) => fn(d);
  ipcRenderer.on('descritor:progresso', h);
  return () => ipcRenderer.removeListener('descritor:progresso', h);
};
api.aoProgressoLegenda = (fn) => {
  const h = (_e, d) => fn(d);
  ipcRenderer.on('legenda:progresso', h);
  return () => ipcRenderer.removeListener('legenda:progresso', h);
};
api.aoProgressoConversao = (fn) => {
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
  PROPORCOES: TX.PROPORCOES, QUALIDADES: TX.QUALIDADES, USOS_DO_TEXTO: TX.USOS_DO_TEXTO, EFEITOS: TX.EFEITOS, FUNDOS: TX.FUNDOS, FONTES_AUDIO: TX.FONTES_AUDIO,
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
  descreverObjetos: OB.descreverObjetos,
  ESPELHO: TX.ESPELHO,
  // Ajuste do áudio no Editar vídeo (as mesmas contas do Voz da Cena).
  ajuste: {
    VOLUME: AJ.VOLUME, VELOCIDADE: AJ.VELOCIDADE, EQ: AJ.EQ, PREDEFINICOES_EQ: AJ.PREDEFINICOES_EQ,
    mudarVolume: AJ.mudarVolume, mudarVelocidade: AJ.mudarVelocidade, porcento: AJ.porcento,
    normalizarAjuste: AJ.normalizarAjuste, normalizarEq: AJ.normalizarEq, ajusteNeutro: AJ.ajusteNeutro,
    resumoDoAjuste: AJ.resumoDoAjuste, decibeisFalados: AJ.decibeisFalados, nomeDoEq: AJ.nomeDoEq, eqNeutro: AJ.eqNeutro
  },
  diagnosticar: DG.diagnosticar,
  calcularFadesDeJuncao
};
contextBridge.exposeInMainWorld('api', api);
