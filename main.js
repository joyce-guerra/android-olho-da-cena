'use strict';
/* Olho da Cena: grava, monta, edita, junta e divide vídeos.
   Junta o Gerador de Vídeo 2.0.3 e o Gravador de Vídeo (teste) 0.3 num programa só.
   Processo principal: janela, protocolo app://, configurações e as tarefas pesadas (FFmpeg). */

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, protocol, net, desktopCapturer, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('./src/spawn-seguro'); // 1.8.6: filtros longos vão por arquivo
const { Readable } = require('stream');

const { listPresets, getPreset } = require('./src/presets');
const { listarFormatos, listarQualidades } = require('./src/formatos');
const FOTOS = require('./src/fotos');
const PASTAS_POSTS = require('./src/pastas-posts');
const PS = require('./src/pastas-saida');
const VPOST = require('./src/video-post');
const { LIMITES, lerTempo, escreverTempo, validarTitulos, resolverFonte } = require('./src/titulos');
const ABERT = require('./src/abertura');
const { planejarCortes } = require('./src/cortar');
const { analisarVideo } = require('./src/juntar');
const { lerTamanho } = require('./src/dividir');
const {
  renderizar,
  cortarVideo,
  salvarTrecho,
  exportarAudio,
  infoLogo,
  montarAudio,
  previaVelocidade,
  dividirVideo,
  conferirDivisao,
  juntarVideos,
  analisarLista,
  cancelar,
  verificarFFmpeg,
  duracaoDoAudio,
  gerarPreviaMixagem,
  detectarSilencios,
  cortarAudio,
  analisarImagens,
  ouvirAjuste,
  exigir,
  medirSonoridade, ganhoNivelamento, previaCortes, salvarTrechoAV, previaSilencios,
} = require('./src/render');

const { procurar } = require('./src/ffmpeg-path');
const RESP = require('./src/respiracoes');
const { argumentosMp4, tempoDoProgresso, qualidadeValida } = require('./src/conversao');
const { nomeDoVideo, nomeMelhorado3, nomeDoResultado, nomeSemRepetir } = require('./src/tempo');
const AJ = require('./src/ajuste');
const MONO = require('./src/mono');
const { formatoValido, tamanhoSaida } = require('./src/recorte');
const MH = require('./src/melhorar');
const CAD = require('./src/cadeia');
const DG = require('./src/diagnostico');
const TX = require('./src/textos');
const LEG = require('./src/legendas');
const DIV = require('./src/divisao');
const DESC = require('./src/descritor');
const SRT = require('./src/srt');
const { caminhoFiltro } = require('./src/ffmpeg-builder');
const crypto = require('crypto');

const NOME = 'Olho da Cena';
const PASTA = 'Olho da Cena';
const PASTA_ANTIGA = 'Gravador de Vídeo';

app.setName(NOME);
// O som da gravação passa pelo Web Audio, e os bipes também; nada disso pode esperar um clique.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Variáveis dos testes automáticos (OLHO_TESTE_*; os nomes antigos GRAVADOR_TESTE_* também valem).
const T = {};
for (const k of ['DADOS', 'VIDEO', 'MIC', 'DOCUMENTOS', 'TEXTO']) T[k] = process.env[`OLHO_TESTE_${k}`] || process.env[`GRAVADOR_TESTE_${k}`] || '';
if (T.DADOS) {
  app.setPath('userData', T.DADOS);
  // Testes automáticos: câmera e microfone falsos, sem pedir permissão.
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
  if (T.VIDEO) app.commandLine.appendSwitch('use-file-for-fake-video-capture', T.VIDEO);
  if (T.MIC) app.commandLine.appendSwitch('use-file-for-fake-audio-capture', T.MIC);
}

// As telas, os arquivos da detecção (wasm e modelos) e os vídeos e áudios abertos são servidos
// por app://olho/: funciona sem internet e permite carregar o WebAssembly (o file:// não permite).
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

let janela = null;

const pastaVisao = () => (app.isPackaged ? path.join(process.resourcesPath, 'visao') : path.join(__dirname, 'vendor', 'visao'));
// 3.0.3: molduras com cenário também servem de fundo para o vídeo. A tela desenha o cenário, no formato do vídeo,
// e guarda aqui como imagem parada; o valor do fundo é m- mais o nome da moldura.
const pastaFundosMoldura = () => path.join(app.getPath('userData'), 'fundos-moldura');
function fundoPorValor(valor) {
  const v = String(valor || '');
  if (v.startsWith('m-')) {
    const mo = FOTOS.acharMoldura(v.slice(2));
    return mo && mo.fundoReal === 'substitui' && !mo.soPost ? { valor: v, nome: mo.nome, sufixo: `moldura ${mo.nome.toLowerCase()}` } : null;
  }
  return TX.acharPor(TX.FUNDOS, v);
}
const arquivoDoFundo = (valor, formato) => path.join(String(valor).startsWith('m-') ? pastaFundosMoldura() : pastaFundos(), `${String(valor).replace(/[^\w-]/g, '')}-${formato}.jpg`);
const pastaFundos = () => (app.isPackaged ? path.join(process.resourcesPath, 'fundos') : path.join(__dirname, 'vendor', 'fundos'));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.tflite': 'application/octet-stream', '.task': 'application/octet-stream', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2' };
const MIDIA = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
  '.3gp': 'video/3gpp', '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac' };

// Só os arquivos que o próprio programa abriu ou gerou podem ser lidos pela tela.
const liberados = new Set();
function urlDoArquivo(caminho) {
  const abs = path.resolve(caminho);
  liberados.add(abs);
  return `app://olho/arquivo/${encodeURIComponent(abs)}`;
}

// Vídeo e áudio com pedido de pedaço (Range): o player pula para qualquer ponto sem ler tudo.
function servirArquivo(req, abs) {
  if (!liberados.has(abs)) return new Response('proibido', { status: 403 });
  let tam;
  try { tam = fs.statSync(abs).size; } catch (_) { return new Response('não encontrado', { status: 404 }); }
  const tipo = MIDIA[path.extname(abs).toLowerCase()] || TIPOS[path.extname(abs).toLowerCase()] || 'application/octet-stream';
  const faixa = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  if (faixa && tam > 0) {
    let ini = faixa[1] === '' ? null : Number(faixa[1]);
    let fim = faixa[2] === '' ? null : Number(faixa[2]);
    if (ini === null) { ini = Math.max(0, tam - (fim || 0)); fim = tam - 1; }
    if (fim === null || fim >= tam) fim = tam - 1;
    if (ini > fim || ini >= tam) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${tam}` } });
    const corpo = Readable.toWeb(fs.createReadStream(abs, { start: ini, end: fim }));
    return new Response(corpo, { status: 206, headers: { 'content-type': tipo, 'accept-ranges': 'bytes',
      'content-range': `bytes ${ini}-${fim}/${tam}`, 'content-length': String(fim - ini + 1) } });
  }
  return new Response(Readable.toWeb(fs.createReadStream(abs)), { status: 200,
    headers: { 'content-type': tipo, 'accept-ranges': 'bytes', 'content-length': String(tam) } });
}

function servir(req) {
  const u = new URL(req.url);
  const partes = u.pathname.split('/').filter(Boolean);
  if (partes[0] === 'arquivo' && partes.length >= 2) {
    return servirArquivo(req, path.resolve(decodeURIComponent(partes.slice(1).join('/'))));
  }
  const nomes = partes.map((p) => decodeURIComponent(p));
  if (nomes.some((p) => p === '..' || p.includes('/') || p.includes('\\'))) return new Response('proibido', { status: 403 });
  const [raiz, ...resto] = nomes;
  const base = raiz === 'visao' ? pastaVisao() : raiz === 'ui' ? path.join(__dirname, 'ui') : raiz === 'src' ? path.join(__dirname, 'src')
    : raiz === 'fundos' ? pastaFundos() : null;
  if (!base) return new Response('não encontrado', { status: 404 });
  const arq = path.join(base, ...resto);
  try {
    let dados = fs.readFileSync(arq);
    // ?cjs: entrega um módulo CommonJS embrulhado numa função, para o worker carregar com
    // importScripts sem os nomes de um arquivo colidirem com os de outro.
    if (u.searchParams.has('cjs') && /\.c?js$/i.test(arq)) {
      dados = Buffer.from('(function(){var module={exports:{}};var exports=module.exports;\n' + dados.toString('utf8') +
        '\n;self.__modulos=self.__modulos||{};self.__modulos[' + JSON.stringify(u.searchParams.get('cjs')) + ']=module.exports;})();\n', 'utf8');
    }
    return new Response(dados, { headers: { 'content-type': TIPOS[path.extname(arq).toLowerCase()] || 'application/octet-stream' } });
  } catch (_) {
    return new Response('não encontrado', { status: 404 });
  }
}

// --- Pastas --------------------------------------------------------------------

const pastaDocumentos = () => T.DOCUMENTOS || app.getPath('documents');
// 1.8: a pasta pode ser trocada nas Configurações (pastaArquivos); sem escolha, Documentos\Olho da Cena.
const pastaSaida = () => {
  const c = lerConfig();
  return c.pastaArquivos && path.isAbsolute(c.pastaArquivos) ? c.pastaArquivos : path.join(pastaDocumentos(), PASTA);
};
// 3.0.3: Tipo de salvamento. Universal (pastas = 'unica'): Áudios, Vídeos, Imagens e Extras na pasta escolhida.
// Avançado (pastas = 'dedicadas'): uma pasta por função, e dentro dela Áudios, Vídeos e Extras. Ver src/pastas-saida.js.
// A função em que a pessoa está vem do renderer (pastas:origem) toda vez que ela troca de tela.
let origemAtual = 'gravar';
const ORIGEM_DA_TELA = { gravar: 'gravar', gerar: 'montar', cortar: 'editar', dividir: 'editar', juntar: 'editar', lote: 'editar', edicao: 'editar', foto: 'fotos', editfoto: 'fotos', gaudio: 'audio', extras: 'extras' };
/** A pasta de um tipo (audio, video, imagem, extras) na função atual. 'audioavulso' é o Gravar áudio. Cria a pasta. */
function pastaDoTipo(nomeOuTipo, origem) {
  const base = pastaSaida();
  const n = String(nomeOuTipo || 'video');
  let o = origem || origemAtual, tipo;
  if (n === 'audioavulso') { o = 'audio'; tipo = 'audio'; }
  else if (['audio', 'video', 'imagem', 'extras'].includes(n)) tipo = n;
  else tipo = PS.tipoDoArquivo(n);
  const p = PS.pastaDe(base, lerConfig().pastas, o, tipo);
  try { fs.mkdirSync(p, { recursive: true }); } catch (_) { /* */ }
  return p;
}
/** 3.0.4: as pastas do tipo de salvamento escolhido existem desde o começo, e não só depois do primeiro arquivo salvo. */
function garantirEstrutura() {
  try {
    const base = criarPastaSaida();
    for (const rel of PS.estruturaDe(lerConfig().pastas)) fs.mkdirSync(path.join(base, ...rel), { recursive: true });
  } catch (_) { /* a pasta é criada na hora de salvar */ }
}
function criarPastaSaida() {
  const p = pastaSaida();
  try { fs.mkdirSync(p, { recursive: true }); } catch (_) { /* */ }
  return p;
}
const pastaTemporaria = () => path.join(app.getPath('userData'), 'gravando');
// Sugestão das janelas de "Salvar como": um nome solto vai para a pasta do programa.
function naPastaDoPrograma(sugestao) {
  if (path.isAbsolute(sugestao)) return sugestao;
  return path.join(pastaDoTipo(sugestao), sugestao);
}

// --- Configurações -------------------------------------------------------------

// Gravar: proporção e qualidade começam sem escolha (a primeira gravação pede as duas).
// espelhada: o Alt E trata a imagem como espelho (vem marcado).
// Montar: orientação (montarFormato), atmosfera (montarPreset) e qualidade (montarQualidade).
const PADRAO = { formato: '', qualidade: '', camera: '', microfone: '', legenda: false, texto: '', espelhada: true, seguirRosto: true,
  montarFormato: '', montarPreset: '', montarQualidade: '', avisoPastaAntiga: false, efeito: '', fundo: '',
  // 1.8: Configurações.
  pastaArquivos: '', confirmacao: 'ambos', gravados: 'estereo', importados: 'estereo', altS: 'ambos', altSPergunta: 'automatico', idiomaDescricao: 'pt', fonteAudio: 'mic',
  descartados: 'lixeira', pastas: 'unica', migrouPosts: false, leveFalhouNaVersao: '', avisoAtualizacao: '', legendaLocal: 'embaixo', legendaTamanho: 'media' };
const OPCOES_CONFIG = { confirmacao: ['ambos', 'som', 'beep'], gravados: ['estereo', 'mono'], importados: ['estereo', 'mono'],
  altS: ['ambos', 'video', 'audio'], altSPergunta: ['automatico', 'perguntar'], idiomaDescricao: ['pt', 'es', 'en'], fonteAudio: ['mic', 'pc', 'ambos'], descartados: ['lixeira', 'apagar'], pastas: ['unica', 'dedicadas'],
  legendaLocal: ['embaixo', 'meio', 'cima'], legendaTamanho: ['pequena', 'media', 'grande'] };
const arqConfig = () => path.join(app.getPath('userData'), 'configuracoes.json');
// Primeira vez: aproveita as escolhas do Gravador de Vídeo (teste), se houver (só lê; nada é apagado).
function configDoGravador() {
  try {
    const antigo = path.join(app.getPath('appData'), 'Gravador de Vídeo (teste)', 'configuracoes.json');
    const c = JSON.parse(fs.readFileSync(antigo, 'utf8'));
    const r = {};
    for (const k of ['formato', 'qualidade', 'camera', 'microfone', 'legenda', 'espelhada']) if (k in c) r[k] = c[k];
    return r;
  } catch (_) { return {}; }
}
function lerConfig() {
  try { return { ...PADRAO, ...JSON.parse(fs.readFileSync(arqConfig(), 'utf8')) }; } catch (_) {
    return T.DADOS ? { ...PADRAO } : { ...PADRAO, ...configDoGravador() };
  }
}
function salvarConfig(c) {
  const antes = lerConfig();
  const nova = { ...antes, ...c };
  nova.formato = formatoValido(nova.formato) || '';
  nova.qualidade = qualidadeValida(nova.qualidade) || '';
  nova.legenda = nova.legenda === true;
  nova.espelhada = nova.espelhada !== false;
  nova.seguirRosto = nova.seguirRosto !== false;
  for (const k of ['montarFormato', 'montarPreset', 'montarQualidade']) nova[k] = typeof nova[k] === 'string' ? nova[k].slice(0, 80) : '';
  nova.avisoPastaAntiga = nova.avisoPastaAntiga === true;
  nova.migrouPosts = nova.migrouPosts === true;
  nova.leveFalhouNaVersao = typeof nova.leveFalhouNaVersao === 'string' && /^\d+(\.\d+){1,3}$/.test(nova.leveFalhouNaVersao) ? nova.leveFalhouNaVersao : '';
  nova.avisoAtualizacao = typeof nova.avisoAtualizacao === 'string' ? nova.avisoAtualizacao.slice(0, 300) : '';
  // 1.1: lembra o último efeito e o último fundo escolhidos no Melhorar.
  nova.efeito = TX.acharPor(TX.EFEITOS, nova.efeito) ? nova.efeito : '';
  nova.fundo = fundoPorValor(nova.fundo) ? nova.fundo : '';
  for (const [k, ops] of Object.entries(OPCOES_CONFIG)) if (!ops.includes(nova[k])) nova[k] = PADRAO[k];
  nova.pastaArquivos = typeof nova.pastaArquivos === 'string' && path.isAbsolute(nova.pastaArquivos) ? nova.pastaArquivos : '';
  fs.mkdirSync(path.dirname(arqConfig()), { recursive: true });
  fs.writeFileSync(arqConfig(), JSON.stringify(nova, null, 1));
  if (antes.pastas !== nova.pastas || antes.pastaArquivos !== nova.pastaArquivos) garantirEstrutura();
  return nova;
}

// --- Janela --------------------------------------------------------------------

function criarJanela() {
  janela = new BrowserWindow({
    width: 1000, height: 820, title: NOME,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false,
      spellcheck: false, backgroundThrottling: false }
  });
  // Sem menu nenhum, nem escondido: o menu padrão do Electron responde a Alt F, Alt E, Alt V e
  // Alt H mesmo invisível, e engoliria os atalhos do programa antes de eles chegarem na tela.
  janela.removeMenu();
  const ses = janela.webContents.session;
  ses.setPermissionRequestHandler((_wc, permissao, ok) => ok(permissao === 'media' || permissao === 'display-capture'));
  ses.setPermissionCheckHandler((_wc, permissao) => permissao === 'media' || permissao === 'display-capture');
  // 2.0.1: o som do computador (Windows): a tela inteira só como exigência da captura; só o áudio é usado.
  ses.setDisplayMediaRequestHandler(async (_req, resposta) => {
    try {
      const fontes = await desktopCapturer.getSources({ types: ['screen'] });
      resposta({ video: fontes[0], audio: 'loopback' });
    } catch (_) { resposta({}); }
  });
  janela.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  janela.webContents.on('will-navigate', (e) => e.preventDefault());
  janela.loadURL('app://olho/ui/index.html');
}

app.whenReady().then(() => {
  // O nome com acento entra no User-Agent e quebra o protocolo app:// (cabeçalho só aceita ASCII).
  app.userAgentFallback = app.userAgentFallback.normalize('NFD').replace(/[^\x20-\x7e]/g, '');
  protocol.handle('app', servir);
  Menu.setApplicationMenu(null);
  criarPastaSaida();
  garantirEstrutura();
  criarJanela();
  aposAtualizacaoLeve();
});
app.on('window-all-closed', () => app.quit());

// --- Ajudantes do Gravar -------------------------------------------------------

const resposta = (fn) => async (...a) => {
  try { return { ok: true, valor: await fn(...a) }; } catch (e) { return { ok: false, erro: e.message || String(e) }; }
};
const lidar = (canal, fn) => ipcMain.handle(canal, (_e, d) => resposta(fn)(d));

lidar('config:ler', () => lerConfig());
// 3.0.4: Editar fotos. A pessoa escolhe uma pasta; o programa lista as fotos dela (só a pasta, sem as subpastas).
const EXT_FOTO = /\.(jpe?g|jfif|png|webp|bmp|gif|avif)$/i;
/** O que o Editar fotos recebe: a pasta, as fotos que o programa abre e o que mais havia, para dizer o que viu. */
function infoDeFotos(pasta, arquivos) {
  const nomes = arquivos.filter((n) => EXT_FOTO.test(n)).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  const outros = {};
  for (const n of arquivos) if (!EXT_FOTO.test(n)) { const x = path.extname(n).toLowerCase() || 'sem extensão'; outros[x] = (outros[x] || 0) + 1; }
  return { pasta, nome: path.basename(pasta), outros, totalDeArquivos: arquivos.length, arquivos: nomes.map((n) => ({ nome: n, caminho: path.join(pasta, n), url: urlDoArquivo(path.join(pasta, n)) })) };
}
const arquivosDaPasta = (pasta) => fs.readdirSync(pasta, { withFileTypes: true }).filter((e) => !e.isDirectory()).map((e) => e.name); // links e arquivos de nuvem também entram
// 3.0.4: a janela de escolher fotos mostra as fotos, e Control A escolhe todas. É a principal.
lidar('editfoto:escolherfotos', async () => {
  if (process.env.OLHO_TESTE_PASTA_FOTOS) return infoDeFotos(process.env.OLHO_TESTE_PASTA_FOTOS, arquivosDaPasta(process.env.OLHO_TESTE_PASTA_FOTOS));
  const r = await dialog.showOpenDialog(janela, {
    title: 'Escolher as fotos. Control A escolhe todas as da pasta',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Fotos', extensions: ['jpg', 'jpeg', 'jfif', 'png', 'webp', 'bmp', 'gif', 'avif'] }, { name: 'Todos os arquivos', extensions: ['*'] }]
  });
  if (r.canceled || !r.filePaths.length) return null;
  const pasta = path.dirname(r.filePaths[0]);
  return infoDeFotos(pasta, r.filePaths.filter((p) => path.dirname(p) === pasta).map((p) => path.basename(p)));
});
// A pasta inteira, para quem prefere. A janela do Windows para pastas só mostra pastas: o botão Selecionar Pasta escolhe a que está aberta.
lidar('editfoto:escolherpasta', async () => {
  if (process.env.OLHO_TESTE_PASTA_FOTOS) return infoDeFotos(process.env.OLHO_TESTE_PASTA_FOTOS, arquivosDaPasta(process.env.OLHO_TESTE_PASTA_FOTOS));
  const r = await dialog.showOpenDialog(janela, { title: 'Pasta com as fotos. Entre nela e use o botão Selecionar pasta', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths.length) return null;
  return infoDeFotos(r.filePaths[0], arquivosDaPasta(r.filePaths[0]));
});
// 3.0.4: copia um texto para a área de transferência, como a descrição do Alt Q.
lidar('area:copiar', ({ texto }) => { clipboard.writeText(String(texto || '')); return true; });
// 3.0.3: o cenário de uma moldura, desenhado pela tela no formato do vídeo, guardado como fundo.
lidar('fundo:salvarmoldura', ({ valor, formato, dados }) => {
  if (!fundoPorValor(valor)) throw new Error('Essa moldura não serve de fundo.');
  const fmt = formatoValido(formato) || 'horizontal';
  fs.mkdirSync(pastaFundosMoldura(), { recursive: true });
  const arq = arquivoDoFundo(valor, fmt);
  fs.writeFileSync(arq, Buffer.from(dados));
  return { arquivo: arq };
});
// 3.0.3: a tela em que a pessoa entrou diz de qual função vêm os arquivos que ela vai salvar.
lidar('pastas:origem', ({ tela, origem }) => {
  const o = origem || ORIGEM_DA_TELA[tela];
  if (o && PS.ORIGENS.includes(o)) origemAtual = o;
  return origemAtual;
});
lidar('config:salvar', (c) => salvarConfig(c));
lidar('app:versao', () => app.getVersion());
// 1.8: Configurações > Alterar a pasta: janela clássica do Windows para escolher a pasta.
lidar('config:pasta', async () => {
  const r = await dialog.showOpenDialog(janela, { title: 'Pasta de arquivos do Olho da Cena', defaultPath: criarPastaSaida(), properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths.length) return null;
  salvarConfig({ pastaArquivos: r.filePaths[0] });
  return criarPastaSaida();
});
// Pastas: a do programa e, se existir, a antiga do Gravador (só para avisar; nada é movido nem apagado).
lidar('pastas:info', () => {
  const antiga = path.join(pastaDocumentos(), PASTA_ANTIGA);
  let temAntiga = false;
  try { temAntiga = fs.statSync(antiga).isDirectory(); } catch (_) { /* */ }
  garantirMigracaoDePosts();
  return { pasta: criarPastaSaida(), nomePasta: PASTA, documentos: path.basename(pastaDocumentos()), antiga: temAntiga ? antiga : null, nomeAntiga: PASTA_ANTIGA, avisoAtualizacao: lerConfig().avisoAtualizacao || '' };
});

// --- Texto da leitura sombreada --------------------------------------------------

async function lerTexto(arquivo) {
  const ext = path.extname(arquivo).toLowerCase();
  if (ext === '.docx') {
    const mammoth = require('mammoth');
    const r = await mammoth.extractRawText({ path: arquivo });
    return r.value;
  }
  if (ext === '.doc') throw new Error('Arquivos .doc antigos não são lidos. No Word, salve como .docx.');
  return fs.readFileSync(arquivo, 'utf8');
}
lidar('texto:abrir', async () => {
  const r = T.TEXTO ? { canceled: false, filePaths: [T.TEXTO] } : await dialog.showOpenDialog(janela, {
    title: 'Abrir texto para a leitura sombreada', properties: ['openFile'],
    filters: [{ name: 'Texto ou Word', extensions: ['txt', 'md', 'docx'] }, { name: 'Todos os arquivos', extensions: ['*'] }]
  });
  if (r.canceled || !r.filePaths.length) return null;
  const texto = (await lerTexto(r.filePaths[0])).trim();
  if (!texto) throw new Error('Não achei texto nesse arquivo.');
  return { nome: path.basename(r.filePaths[0]), texto };
});

// --- Gravação --------------------------------------------------------------------

const gravacoes = new Map(); // id -> { arquivo, fd }
let proximoId = 1;

lidar('gravacao:iniciar', () => {
  fs.mkdirSync(pastaTemporaria(), { recursive: true });
  const id = proximoId++;
  const arquivo = path.join(pastaTemporaria(), `gravacao-${Date.now()}-${id}.webm`);
  gravacoes.set(id, { arquivo, fd: fs.openSync(arquivo, 'w') });
  return id;
});
lidar('gravacao:pedaco', ({ id, dados }) => {
  const g = gravacoes.get(id);
  if (!g) throw new Error('Gravação não encontrada.');
  fs.writeSync(g.fd, Buffer.from(dados));
  return true;
});
lidar('gravacao:descartar', ({ id }) => {
  const g = gravacoes.get(id);
  if (!g) return false;
  try { fs.closeSync(g.fd); } catch (_) { /* */ }
  try { fs.unlinkSync(g.arquivo); } catch (_) { /* */ }
  gravacoes.delete(id);
  return true;
});

// 3.0.1: o player de antes de decidir toca o arquivo provisório ou o salvo, só das pastas do programa.
lidar('midia:url', ({ arquivo }) => {
  const abs = path.resolve(String(arquivo || ''));
  const raizes = [pastaTemporaria(), pastaSaida()].map((r) => path.resolve(r) + path.sep);
  if (!raizes.some((r) => abs.startsWith(r)) || !fs.existsSync(abs)) throw new Error('Esse arquivo não está nas pastas do programa.');
  return { url: urlDoArquivo(abs) };
});
// 3.0: Gravar áudio. O WebM da gravação vira MP3 numa pasta temporária; só ao salvar ele vai para a pasta Olho da Cena.
let ultimoAudioGravado = null;
const doisDigitos = (n) => String(n).padStart(2, '0');
lidar('gaudio:finalizar', async ({ id }) => {
  const g = gravacoes.get(id);
  if (!g) throw new Error('Gravação não encontrada.');
  fs.closeSync(g.fd);
  gravacoes.delete(id);
  if (!fs.statSync(g.arquivo).size) { fs.unlinkSync(g.arquivo); throw new Error('A gravação ficou vazia. Nada foi salvo.'); }
  const d = new Date();
  const pasta = pastaDoTipo('audioavulso');
  let nome = `Áudio ${doisDigitos(d.getDate())}-${doisDigitos(d.getMonth() + 1)}-${d.getFullYear()} ${doisDigitos(d.getHours())}-${doisDigitos(d.getMinutes())}.mp3`;
  for (let i = 2; fs.existsSync(path.join(pasta, nome)); i++) nome = nome.replace(/( \d+)?\.mp3$/, ` ${i}.mp3`);
  const saida = path.join(pastaTemporaria(), `provisorio-audio-${Date.now()}.mp3`);
  const args = ['-y', '-v', 'error', '-i', g.arquivo, '-vn'];
  if (lerConfig().gravados === 'mono') args.push('-af', 'pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1');
  args.push('-c:a', 'libmp3lame', '-q:a', '2', saida);
  try { await rodar(exigir('ffmpeg'), args); }
  catch (e) {
    fs.mkdirSync(pasta, { recursive: true });
    const reserva = path.join(pasta, nome.replace(/\.mp3$/, '.webm'));
    try { fs.copyFileSync(g.arquivo, reserva); fs.unlinkSync(g.arquivo); } catch (_) { /* */ }
    throw new Error(`${e.message} A gravação original ficou guardada como ${path.basename(reserva)}, na pasta Olho da Cena.`);
  }
  fs.unlinkSync(g.arquivo);
  ultimoAudioGravado = saida;
  return { arquivo: saida, nome, pasta, provisorio: true };
});
lidar('gaudio:guardar', ({ arquivo, nome }) => {
  const alvo = path.resolve(String(arquivo || ''));
  if (!ultimoAudioGravado || alvo !== path.resolve(ultimoAudioGravado)) throw new Error('Não achei a gravação para salvar.');
  const pasta = pastaDoTipo('audioavulso');
  fs.mkdirSync(pasta, { recursive: true });
  const final = nomeSemRepetir(path.basename(String(nome || alvo)).replace(/[^\w .,()À-ÿ-]/g, '') || path.basename(alvo), (n) => fs.existsSync(path.join(pasta, n)));
  const destino = path.join(pasta, final);
  try { fs.renameSync(alvo, destino); } catch (_) { fs.copyFileSync(alvo, destino); fs.unlinkSync(alvo); }
  ultimoAudioGravado = destino;
  return { arquivo: destino, nome: final, pasta };
});
lidar('gaudio:apagar', ({ arquivo }) => {
  const alvo = path.resolve(String(arquivo || ''));
  if (!ultimoAudioGravado || alvo !== path.resolve(ultimoAudioGravado)) throw new Error('Só dá para descartar o áudio que acabou de ser gravado.');
  if (path.dirname(alvo) !== path.resolve(pastaTemporaria())) throw new Error('Este áudio já foi salvo.');
  ultimoAudioGravado = null;
  try { fs.unlinkSync(alvo); } catch (_) { /* já não existia */ }
  return true;
});

// 1.1: Descartar vídeo, logo depois de gravar. Só apaga a gravação que acabou
// de ser feita (nenhum outro arquivo), mandando-a para a Lixeira do Windows.
let ultimaGravacao = null;
lidar('gravacao:apagar', async ({ arquivo }) => {
  const alvo = path.resolve(String(arquivo || ''));
  if (!ultimaGravacao || alvo !== path.resolve(ultimaGravacao)) throw new Error('Só dá para descartar o vídeo que acabou de ser gravado.');
  ultimaGravacao = null;
  if (!fs.existsSync(alvo)) return { jaNaoExistia: true };
  // 1.3.1: ainda temporário (nunca foi salvo na pasta): apaga direto, sem Lixeira.
  if (path.dirname(alvo) === path.resolve(pastaTemporaria())) { fs.unlinkSync(alvo); return { ok: true, temporario: true }; }
  // 1.8: Configurações > Vídeos descartados: Lixeira (padrão) ou apagados em definitivo.
  if (lerConfig().descartados === 'apagar') { fs.unlinkSync(alvo); return { ok: true, definitivo: true }; }
  try { await shell.trashItem(alvo); } catch (_) { fs.unlinkSync(alvo); }
  return { ok: true };
});

// 1.3.1: Salvar e fechar / Salvar e continuar: só agora o vídeo vai para a pasta Olho da Cena.
lidar('gravacao:guardar', async ({ arquivo, nome }) => {
  const alvo = path.resolve(String(arquivo || ''));
  if (!ultimaGravacao || alvo !== path.resolve(ultimaGravacao)) throw new Error('Não achei a gravação para salvar.');
  if (path.dirname(alvo) !== path.resolve(pastaTemporaria())) return { arquivo: alvo, nome: path.basename(alvo), pasta: path.dirname(alvo), documentos: path.basename(pastaDocumentos()) };
  const pasta = pastaDoTipo('video');
  fs.mkdirSync(pasta, { recursive: true });
  const final = nomeSemRepetir(path.basename(String(nome || alvo)).replace(/[^\w .,()À-ÿ-]/g, '') || path.basename(alvo), (n) => fs.existsSync(path.join(pasta, n)));
  const destino = path.join(pasta, final);
  try { fs.renameSync(alvo, destino); } catch (_) { fs.copyFileSync(alvo, destino); fs.unlinkSync(alvo); }
  ultimaGravacao = destino;
  return { arquivo: destino, nome: final, pasta, documentos: path.basename(pastaDocumentos()) };
});

// 1.1: Salvar e fechar: o vídeo já está salvo; só fecha o programa.

// --- 1.3: áudio depois da gravação (tela Cortes) ---------------------------------------------
lidar('audiocortes:abrir', async ({ arquivo }) => {
  const info = await analisarVideo(arquivo, exigir);
  if (!info.valido) throw new Error(`O arquivo ${info.motivo}.`);
  const nivel = info.temAudio ? await ganhoNivelamento(arquivo) : { ganho: 0, lufs: null, pico: null };
  return { arquivo, url: urlDoArquivo(arquivo), duracao: info.duracao, temAudio: info.temAudio, ganhoNivelar: nivel.ganho, lufs: nivel.lufs, pico: nivel.pico };
});
// 1.6: Equalização e ajustes. "mono: true" vira o filtro de mono do arquivo (src/mono.js da 1.0.4,
// commit 6b666c4: a voz nos dois ouvidos, o canal bom ou a média dos dois); estéreo deixa como foi gravado.
async function comMono(entrada, ajuste) {
  if (!ajuste || ajuste.mono !== true) return ajuste ? { ...ajuste, mono: null } : ajuste;
  let f = null;
  try { f = await MONO.filtroMonoDoArquivo(entrada, procurar('ffmpeg')); } catch (_) { f = null; }
  return { ...ajuste, mono: f };
}
// 1.6: Alt P da Equalização: 6 segundos a partir do ponto atual, com tudo o que a tela escolheu
// (o mesmo ouvirAjuste do "Ouvir o ajuste" do Editar vídeo).
lidar('audioeq:previa', async ({ entrada, inicio, ajuste }) => {
  const saida = path.join(os.tmpdir(), `olho_previa_eq_${Date.now()}.wav`);
  const r = await ouvirAjuste({ entrada, inicio, ajuste: await comMono(entrada, ajuste), saida });
  return { url: urlDoArquivo(saida), inicio: r.inicio, duracao: r.duracao };
});
lidar('audiocortes:previa', async ({ entrada, segmentos, ajuste }) => {
  ajuste = await comMono(entrada, ajuste);
  const saida = path.join(os.tmpdir(), `olho_previa_cortes_${Date.now()}.wav`);
  await previaCortes({ entrada, segmentos, ajuste, saida });
  return { url: urlDoArquivo(saida) };
});
// Nomes "<vídeo> - trecho 1.mp4" e ".mp3" na mesma pasta, sem apagar nada que já exista.
const modoPedido = (m) => (['ambos', 'video', 'audio'].includes(m) ? m : lerConfig().altS); // 1.9.2: perguntado na hora, ou o das Configurações
lidar('audiocortes:salvartrecho', async ({ entrada, inicio, fim, numero, ganhoDb, modo: pedido }) => {
  const soAudio = fonteSoAudio(entrada); // 1.9: Edição de áudio de um arquivo só de áudio
  const pasta = pastaDoTipo('video'), pastaA = pastaDoTipo('audio');
  const base = path.basename(soAudio || entrada).replace(/\.[^.]+$/, '');
  let nome = `${base} - trecho ${numero}`;
  for (let i = 2; fs.existsSync(path.join(pasta, nome + '.mp4')) || fs.existsSync(path.join(pastaA, nome + '.mp3')); i++) nome = `${base} - trecho ${numero} (${i})`;
  return salvarTrechoAV({ entrada, inicio, fim, ganhoDb, saidaVideo: path.join(pasta, nome + '.mp4'), saidaAudio: path.join(pastaA, nome + '.mp3'), modo: soAudio ? 'audio' : modoPedido(pedido) });
});
// 1.8: Alt S fora da tela Cortes: salva o trabalho como está agora, num arquivo com nome
// ("<vídeo> - <tela>.mp4" e/ou ".mp3"), seguindo "O Alt S salva em" das Configurações.
lidar('audio:salvarestado', async ({ entrada, original, ajuste, camadas, tela, planos, modo: pedido }) => {
  ajuste = await comMono(entrada, ajuste);
  const soAudio = fonteSoAudio(original, entrada); // 1.9: só o MP3, com o nome e a pasta do áudio original
  const modo = soAudio ? 'audio' : modoPedido(pedido);
  const origem = soAudio || original || entrada;
  const pastaV = pastaDoTipo('video'), pastaA = pastaDoTipo('audio');
  const base = `${path.basename(origem).replace(/\.[^.]+$/, '')} - ${String(tela || 'salvo').replace(/[^\w .,()À-ÿ-]/g, '')}`;
  let nome = base;
  for (let i = 2; fs.existsSync(path.join(pastaV, nome + '.mp4')) || fs.existsSync(path.join(pastaA, nome + '.mp3')); i++) nome = `${base} (${i})`;
  fs.mkdirSync(pastaTemporaria(), { recursive: true });
  const temp = path.join(pastaTemporaria(), `estado-${Date.now()}.mp4`);
  const temCamadas = Array.isArray(camadas) && camadas.length;
  if (!temCamadas && (!ajuste || AJ.ajusteNeutro(ajuste))) fs.copyFileSync(entrada, temp);
  else {
    const r = await cortarVideo({ entrada, descartes: [], saida: temp, ajuste, camadas: temCamadas ? camadas : undefined }, () => {});
    if (r && r.ok === false) throw new Error(r.erro || 'Não consegui salvar.');
  }
  // 1.8.6: na gravação, a imagem das telas de áudio é leve; aqui o MP4 sai com a imagem de verdade, cortada igual.
  let tempV = temp;
  if (Array.isArray(planos) && original && !soAudio) {
    const rp = await new Promise((ok) => { const p = spawn(procurar('ffprobe') || 'ffprobe', ['-v', 'error', '-show_entries', 'stream=width', '-select_streams', 'v:0', '-of', 'csv=p=0', temp], { windowsHide: true }); let o = ''; p.stdout.on('data', (b) => { o += b; }); p.on('close', () => ok(o.trim())); p.on('error', () => ok('')); });
    if (rp === '16') { tempV = temp.replace(/\.mp4$/, '-v.mp4'); await videoDaCadeia({ original, planos: planosComVel(planos, ajuste), audio: temp, saida: tempV }); }
  }
  const info = await analisarVideo(tempV, exigir);
  const r = await salvarTrechoAV({ entrada: tempV, inicio: 0, fim: info.duracao, ganhoDb: 0, saidaVideo: path.join(pastaV, nome + '.mp4'), saidaAudio: path.join(pastaA, nome + '.mp3'), modo });
  try { fs.unlinkSync(temp); if (tempV !== temp) fs.unlinkSync(tempV); } catch (_) { /* */ }
  return { ...r, nome };
});
// Salvar e continuar: o vídeo com os cortes e o nivelamento, num arquivo novo ("<vídeo> editado.mp4").
// 1.4: Silêncios e crossfade. Detecção = detectarSilencios da 1.0.0 (silencedetect), sem mudança.
lidar('audiosilencios:detectar', async ({ entrada, limiarDb, duracaoMinima, margem, respiracoes, ajustarGanho, pausaMinima, deixar }) => {
  // 1.8.1: os três níveis medem a voz; silêncio (e respiração) = mais de 19 dB abaixo dela.
  if (pausaMinima != null) return { silencios: RESP.silenciosPelaVoz(await amostrasMono16k(entrada, 44100), 44100, { pausaMinima, deixar }) };
  // Leve: exatamente como antes. 1.7.2: equilibrado e agressivo medem a voz e, se a gravação
  // estiver baixa, sobem o volume só para medir (ganho 0 no volume normal: nada muda).
  if (!respiracoes && !ajustarGanho) return { silencios: await detectarSilencios(entrada, { limiarDb, duracaoMinima, margem }) };
  const amostras = await amostrasMono16k(entrada);
  const ganhoDb = RESP.ganhoParaVoz(amostras, 16000);
  const silencios = await detectarSilencios(entrada, { limiarDb, duracaoMinima, margem, ganhoDb });
  // 1.6: só o nível agressivo procura também as respirações e corta junto com os silêncios.
  if (!respiracoes) return { silencios };
  return { silencios: RESP.juntar(silencios, RESP.detectar(amostras, 16000)) };
});
function amostrasMono16k(arquivo, taxa = 16000) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const p = spawn(require('./src/render').exigir('ffmpeg'),
      ['-v', 'error', '-i', arquivo, '-map', '0:a:0', '-ac', '1', '-ar', String(taxa), '-f', 'f32le', '-'], { windowsHide: true });
    const partes = [];
    p.stdout.on('data', (d) => partes.push(d));
    p.on('error', reject);
    p.on('close', () => { const b = Buffer.concat(partes); resolve(new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4))); });
  });
}
lidar('audiosilencios:previa', async ({ entrada, descartes, fade, ajuste, centro }) => {
  ajuste = await comMono(entrada, ajuste);
  const saida = path.join(os.tmpdir(), `olho_previa_silencios_${Date.now()}.wav`);
  const r = await previaSilencios({ entrada, descartes, fade, ajuste, saida, centro });
  return { url: urlDoArquivo(saida), duracao: r.duracao, inicio: r.inicio };
});
// 1.7.1: Salvar e continuar dos Cortes e dos Silêncios já aplica os cortes (e o crossfade) num
// arquivo temporário; a tela seguinte trabalha nele, com os tempos de verdade.
lidar('audiocortes:aplicar', async ({ entrada, descartes, fade, leve }) => {
  if (!Array.isArray(descartes) || !descartes.length) return { arquivo: entrada };
  fs.mkdirSync(pastaTemporaria(), { recursive: true });
  const saida = path.join(pastaTemporaria(), `etapa-${Date.now()}.mp4`);
  // 1.8.6: leve = só o som de verdade (a imagem 16x16 acompanha); o vídeo é cortado uma vez, no Finalizar.
  const r = await cortarVideo({ entrada, descartes, saida, fade: !!fade, sobrepor: !!fade, leve: !!leve }, (p) => { if (janela) janela.webContents.send('render:progresso', p); });
  if (r && r.ok === false) throw new Error(r.erro || 'Não consegui salvar.');
  return { arquivo: saida, duracao: r && r.duracao, plano: r && r.plano };
});
async function salvarAudioCortes({ entrada, original, descartes, ajuste, fade, camadas, leve, pico }) {
  ajuste = await comMono(entrada, ajuste);
  const origem = original || entrada; // 1.7.1: nome e pasta vêm do vídeo gravado, não do temporário
  // 1.8.6: leve (gravação): o som final fica num temporário; o vídeo final sai só no Finalizar.
  if (leve) fs.mkdirSync(pastaTemporaria(), { recursive: true });
  const pasta = leve ? pastaTemporaria() : pastaDoTipo('video'); // 3.0.3: sai na pasta do programa, não ao lado do original
  const base = path.basename(origem).replace(/\.[^.]+$/, '');
  const nome = nomeSemRepetir(`${base} editado.mp4`, (n) => fs.existsSync(path.join(pasta, n)));
  const saida = path.join(pasta, nome);
  const temCamadas = Array.isArray(camadas) && camadas.length;
  if (!(descartes && descartes.length) && !temCamadas && (!ajuste || AJ.ajusteNeutro(ajuste) || AJ.semEfeitoNoSom(ajuste, pico))) {
    fs.copyFileSync(entrada, saida);
    return { arquivo: saida, nome, pasta, duracao: (await analisarVideo(saida, exigir)).duracao };
  }
  const r = await cortarVideo({ entrada, descartes, saida, ajuste, fade: !!fade, sobrepor: !!fade, camadas: Array.isArray(camadas) && camadas.length ? camadas : undefined, leve: !!leve }, (p) => { if (janela) janela.webContents.send('render:progresso', p); });
  if (r && r.ok === false) throw new Error(r.erro || 'Não consegui salvar.');
  return { arquivo: saida, nome, pasta, duracao: r && r.duracao, plano: r && r.plano };
}
lidar('audiocortes:salvar', async (d) => {
  const soAudio = fonteSoAudio(d.original, d.entrada);
  // Leve (Montar vídeo): o resultado fica no temporário; o Montar tira o som dele.
  if (!soAudio || d.leve) return salvarAudioCortes(d);
  // 1.9: arquivo só de áudio: o MP4 de trabalho fica no temporário e o resultado sai em MP3,
  // "<áudio> editado.mp3", na pasta Áudios do programa (3.0.3), e não ao lado do original.
  // O MP4 do meio do caminho fica no temporário e some: só o MP3 sai (um vídeo, nesse caso, também não ganha um "editado.mp4").
  const r = await salvarAudioCortes({ ...d, leve: true });
  const pasta = pastaDoTipo('audio');
  const base = path.basename(soAudio).replace(/\.[^.]+$/, '');
  const nome = nomeSemRepetir(`${base} editado.mp3`, (n) => fs.existsSync(path.join(pasta, n)));
  const saida = path.join(pasta, nome);
  const info = await analisarVideo(r.arquivo, exigir);
  await salvarTrechoAV({ entrada: r.arquivo, inicio: 0, fim: info.duracao, ganhoDb: 0, saidaVideo: null, saidaAudio: saida, modo: 'audio' });
  if (r.arquivo !== d.entrada && path.dirname(r.arquivo) === path.resolve(pastaTemporaria())) { try { fs.unlinkSync(r.arquivo); } catch (_) { /* */ } }
  return { arquivo: saida, nome, pasta, duracao: info.duracao, soAudio: true };
});

// --- 1.9.2: Dividir vídeo: partes por tempo e cortes manuais ------------------------------------
// Cada trecho sai do vídeo original, na orientação escolhida para ele, com a legenda daquele pedaço
// (se houver) e no formato pedido: só vídeo, só áudio ou os dois. O original nunca muda.
const divisaoAtual = { cancelar: false, processo: null };
lidar('dividir:cortes', async ({ entrada, cortes, modo, legenda, nome, rotulo }) => {
  if (!entrada || !fs.existsSync(entrada)) throw new Error('Não achei o vídeo.');
  if (!Array.isArray(cortes) || !cortes.length) throw new Error('Nenhum trecho para salvar.');
  const f = await faixasDoArquivo(entrada);
  const comVideo = modo !== 'audio' && f.video, comAudio = modo !== 'video' && f.audio;
  const pastaV = pastaDoTipo('video'), pastaA = pastaDoTipo('audio');
  const base = String(nome || path.basename(entrada)).replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '').trim() || 'video';
  const palavra = rotulo || 'parte';
  const cues = legenda && legenda.srt && fs.existsSync(legenda.srt) && LEG.estilo(legenda.estilo)
    ? SRT.parseSrt(fs.readFileSync(legenda.srt, 'utf8')).map((c) => ({ inicio: c.inicio, fim: c.fim, texto: c.linhas.join(' ') })) : null;
  divisaoAtual.cancelar = false;
  fs.mkdirSync(pastaTemporaria(), { recursive: true });
  const feitos = [];
  for (let i = 0; i < cortes.length; i++) {
    if (divisaoAtual.cancelar) { const e = new Error('CANCELADO'); e.feitos = feitos.length; throw e; }
    const c = cortes[i];
    const ini = Math.max(0, Number(c.inicio) || 0), fim = Math.min(f.duracao || Infinity, Number(c.fim) || 0);
    if (fim - ini < 0.2) continue;
    let n = `${base} - ${palavra} ${i + 1}`;
    for (let k = 2; fs.existsSync(path.join(pastaV, n + '.mp4')) || fs.existsSync(path.join(pastaA, n + '.mp3')); k++) n = `${base} - ${palavra} ${i + 1} (${k})`;
    if (janela) janela.webContents.send('dividir:andamento', { atual: i + 1, total: cortes.length });
    if (comVideo) {
      const o = DIV.filtroOrientacao(c.orientacao || 'manter', f.largura, f.altura);
      let filtro = o.filtro;
      let ass = null;
      const doTrecho = cues ? DIV.legendasDoTrecho(cues, ini, fim) : [];
      if (doTrecho.length) {
        ass = path.join(pastaTemporaria(), `divisao-${Date.now()}-${i}.ass`);
        fs.writeFileSync(ass, LEG.assDasLegendas(doTrecho, legenda.estilo, o.largura, o.altura), 'utf8');
        filtro = filtro.replace(/\[v\]$/, '[v0]') + `;[v0]subtitles='${caminhoFiltro(ass)}'[v]`;
      }
      try {
        await rodar(exigir('ffmpeg'), ['-y', '-v', 'error', '-ss', ini.toFixed(3), '-to', fim.toFixed(3), '-i', entrada, '-filter_complex', filtro, '-map', '[v]', '-map', '0:a?',
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', path.join(pastaV, n + '.mp4')]);
      } finally { if (ass) { try { fs.unlinkSync(ass); } catch (_) { /* */ } } }
    }
    if (comAudio) {
      await rodar(exigir('ffmpeg'), ['-y', '-v', 'error', '-ss', ini.toFixed(3), '-to', fim.toFixed(3), '-i', entrada, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', path.join(pastaA, n + '.mp3')]);
    }
    feitos.push(n);
  }
  return { feitos, video: comVideo, audio: comAudio, documentos: path.basename(pastaDocumentos()) };
});
lidar('dividir:cancelar', () => { divisaoAtual.cancelar = true; return true; });

// --- 1.9.3: descrição de uma imagem (Montar vídeo, Editar áudio): medidas locais, sem internet ---------
/** Cor com nome, a partir de matiz (0 a 360), saturação e valor (0 a 1). */
function nomeDaCor(h, sat, v) {
  if (v < 0.18) return 'preto';
  if (sat < 0.12) return v > 0.85 ? 'branco' : 'cinza';
  if (h < 15 || h >= 345) return 'vermelho';
  if (h < 40) return v < 0.55 ? 'marrom' : 'laranja';
  if (h < 65) return 'amarelo';
  if (h < 165) return 'verde';
  if (h < 200) return 'azul-claro';
  if (h < 255) return 'azul';
  if (h < 290) return 'roxo';
  return 'rosa';
}
lidar('imagem:medir', async ({ caminho }) => {
  if (!caminho || !fs.existsSync(caminho)) throw new Error('Não achei a imagem.');
  const W = 96;
  const f = await faixasDoArquivo(caminho).catch(() => ({ largura: 0, altura: 0 }));
  const H = Math.max(8, Math.round((W * (f.altura || W)) / (f.largura || W)));
  const buf = await new Promise((ok, falha) => {
    const p = spawn(exigir('ffmpeg'), ['-v', 'error', '-i', caminho, '-frames:v', '1', '-vf', `scale=${W}:${H}`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { windowsHide: true });
    const partes = []; p.stdout.on('data', (b) => partes.push(b)); p.on('error', falha); p.on('close', () => ok(Buffer.concat(partes)));
  });
  const n = Math.floor(buf.length / 3);
  if (n < 16) throw new Error('Não consegui ler a imagem.');
  const cores = new Map(); const cinza = new Float32Array(n);
  let soma = 0, soma2 = 0;
  for (let i = 0; i < n; i++) {
    const r = buf[i * 3] / 255, g = buf[i * 3 + 1] / 255, b = buf[i * 3 + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
    const nome = nomeDaCor(h, max ? d / max : 0, max);
    cores.set(nome, (cores.get(nome) || 0) + 1);
    const y = 0.299 * r + 0.587 * g + 0.114 * b; cinza[i] = y * 255; soma += y; soma2 += y * y;
  }
  const brilho = soma / n, contraste = Math.sqrt(Math.max(0, soma2 / n - brilho * brilho));
  const picos = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; picos.push(Math.abs(4 * cinza[i] - cinza[i - 1] - cinza[i + 1] - cinza[i - W] - cinza[i + W])); }
  picos.sort((a, b) => a - b);
  const pico = picos[Math.floor(picos.length * 0.995)] || 0;
  const predominantes = [...cores.entries()].sort((a, b) => b[1] - a[1]).filter(([, q]) => q / n >= 0.12).slice(0, 3).map(([c]) => c);
  const luz = brilho < 0.22 ? 'bem escura' : brilho < 0.35 ? 'escura' : brilho > 0.8 ? 'muito clara' : brilho > 0.65 ? 'clara' : 'com luz equilibrada';
  const nitidez = pico >= 60 ? 'nítida' : pico >= 28 ? 'um pouco suave' : 'desfocada ou muito lisa';
  const apagada = contraste < 0.12 ? ', com pouco contraste' : '';
  const lista = predominantes.length > 1 ? predominantes.slice(0, -1).join(', ') + ' e ' + predominantes[predominantes.length - 1] : predominantes[0];
  const texto = `Imagem ${luz}${apagada}, ${nitidez}${lista ? `, com ${predominantes.length > 1 ? 'cores predominantes' : 'cor predominante'} ${lista}` : ''}.`;
  return { texto, url: urlDoArquivo(caminho), largura: f.largura, altura: f.altura };
});

// --- 1.9.2: Editar vídeo e Editar áudio -----------------------------------------------------------
/** Quadros pequenos, em tons de cinza, espalhados pelo vídeo: [{ w, h, px: Uint8Array }]. */
async function quadrosCinza(arquivo, duracao, n = 16, largura = 160) {
  const f = await faixasDoArquivo(arquivo);
  const h = Math.max(2, Math.round((largura * (f.altura || 9)) / (f.largura || 16) / 2) * 2);
  const taxa = Math.max(0.05, n / Math.max(1, duracao || f.duracao || 1));
  const buf = await new Promise((ok, falha) => {
    const p = spawn(exigir('ffmpeg'), ['-v', 'error', '-i', arquivo, '-vf', `fps=${taxa.toFixed(4)},scale=${largura}:${h},format=gray`, '-frames:v', String(n), '-f', 'rawvideo', '-'], { windowsHide: true });
    const partes = []; p.stdout.on('data', (b) => partes.push(b)); p.on('error', falha); p.on('close', () => ok(Buffer.concat(partes)));
  });
  const tam = largura * h, lista = [];
  for (let i = 0; i + tam <= buf.length; i += tam) lista.push({ w: largura, h, px: buf.subarray(i, i + tam) });
  return lista;
}
/** Maior sequência de linhas com "cara de texto" (muitas trocas fortes de claro e escuro na mesma linha). */
function linhasDeTexto(q, y0f, y1f) {
  const { w, h, px } = q; const x0 = Math.round(w * 0.08), x1 = Math.round(w * 0.92);
  const limite = (x1 - x0) * 0.07; let seguidas = 0, maior = 0;
  for (let y = Math.round(h * y0f); y < Math.round(h * y1f); y++) {
    let t = 0;
    for (let x = x0; x < x1 - 1; x++) if (Math.abs(px[y * w + x + 1] - px[y * w + x]) > 45) t++;
    if (t > limite) { seguidas++; maior = Math.max(maior, seguidas); } else seguidas = 0;
  }
  return maior;
}
/** Variação no tempo (desvio médio de cada pixel entre os quadros) e bordas da imagem média, num retângulo. */
function canto(qs, x0, y0, x1, y1) {
  const { w } = qs[0]; let varia = 0, bord = 0, t = 0;
  const media = (x, y) => { let s = 0; for (const q of qs) s += q.px[y * w + x]; return s / qs.length; };
  for (let y = y0 + 1; y < y1 - 1; y++) for (let x = x0 + 1; x < x1 - 1; x++) {
    let soma = 0, soma2 = 0;
    for (const q of qs) { const v = q.px[y * w + x]; soma += v; soma2 += v * v; }
    const m = soma / qs.length; varia += Math.sqrt(Math.max(0, soma2 / qs.length - m * m)); t++;
    if (Math.abs(media(x + 1, y) - media(x - 1, y)) + Math.abs(media(x, y + 1) - media(x, y - 1)) > 80) bord++;
  }
  return { varia: t ? varia / t : 0, bordas: t ? bord / t : 0 };
}
/** "Parece ter" legenda e logo. Não é 100% certo: a pessoa confirma ou desmarca.
   Legenda: faixa de letras na parte de baixo em boa parte do vídeo. Logo: um canto com desenho que
   fica parado enquanto a imagem em volta dele se mexe (em vídeo de câmera parada, não dá para saber). */
lidar('editar:detectar', async ({ arquivo, duracao }) => {
  const qs = await quadrosCinza(arquivo, duracao, 16, 320);
  if (qs.length < 4) return { legenda: false, logo: false };
  const { w, h } = qs[0];
  const comTexto = qs.filter((q) => linhasDeTexto(q, 0.6, 0.97) >= 3).length;
  const legenda = comTexto >= qs.length * 0.3;
  const r = Math.round;
  const cantos = { 'em cima, à esquerda': [0, 0], 'em cima, à direita': [0.82, 0], 'embaixo, à esquerda': [0, 0.82], 'embaixo, à direita': [0.82, 0.82] };
  let cantoLogo = null;
  for (const [nome, [fx, fy]] of Object.entries(cantos)) {
    const c = canto(qs, r(w * fx), r(h * fy), r(w * (fx + 0.18)), r(h * (fy + 0.18)));
    // Vizinhança: a faixa logo depois do canto, para dentro da imagem.
    const vx = fx < 0.5 ? [0.18, 0.36] : [0.64, 0.82], vy = fy < 0.5 ? [0, 0.18] : [0.82, 1];
    const v = canto(qs, r(w * vx[0]), r(h * vy[0]), r(w * vx[1]), r(h * vy[1]));
    if (c.varia < 6 && c.bordas > 0.04 && v.varia > Math.max(10, c.varia * 3)) { cantoLogo = nome; break; }
  }
  // Luz da imagem toda (para vídeo sem pessoa): brilho médio e contraste.
  let soma = 0, soma2 = 0, n = 0;
  for (const q of qs) for (let i = 0; i < q.px.length; i += 3) { soma += q.px[i]; soma2 += q.px[i] * q.px[i]; n++; }
  const brilho = soma / n, contraste = Math.sqrt(Math.max(0, soma2 / n - brilho * brilho));
  const luz = brilho < 60 ? 'a imagem está escura' : brilho > 200 ? 'a imagem está clara demais, com partes estouradas' : contraste < 25 ? 'a imagem está apagada, com pouco contraste' : 'a luz está boa';
  // 1.9.3: nitidez da imagem toda, sem precisar de rosto: o quanto as bordas mais marcadas são nítidas.
  const picos = qs.map((q) => {
    const v = [];
    for (let y = 1; y < q.h - 1; y += 2) for (let x = 1; x < q.w - 1; x += 2) { const i = y * q.w + x; v.push(Math.abs(4 * q.px[i] - q.px[i - 1] - q.px[i + 1] - q.px[i - q.w] - q.px[i + q.w])); }
    v.sort((a, b) => a - b); return v[Math.floor(v.length * 0.995)] || 0;
  }).sort((a, b) => a - b);
  const pico = picos[Math.floor(picos.length / 2)];
  const nitidez = pico >= 70 ? 'a imagem está nítida' : pico >= 35 ? 'a imagem está um pouco desfocada' : 'a imagem está desfocada';
  return { legenda, logo: !!cantoLogo, cantoLogo, luz, nitidez, brilho: Math.round(brilho), pico };
});

/** Orientação e qualidade escolhidas no fim do Editar vídeo: o vídeo inteiro cabe no formato novo,
   com o próprio vídeo desfocado nas sobras (nada é cortado). Só refaz o que mudou. */
async function converterSaida(video, saida) {
  if (!saida || (!saida.formato && !saida.qualidade)) return;
  const f = await faixasDoArquivo(video);
  const formatoAtual = f.largura > f.altura * 1.1 ? 'horizontal' : f.altura > f.largura * 1.1 ? 'vertical' : 'quadrado';
  // 1.9.3: "vertical-cheio" preenche a tela vertical e corta as laterais; os outros mantêm o vídeo inteiro.
  const cheio = saida.formato === 'vertical-cheio';
  const formato = cheio ? 'vertical' : (formatoValido(saida.formato) || formatoAtual);
  const qualidade = saida.qualidade || (Math.min(f.largura, f.altura) >= 1000 ? 'alta' : 'leve');
  const { largura: W, altura: H } = tamanhoSaida(formato, qualidade);
  const crf = { alta: 18, padrao: 21, leve: 23 }[qualidade] || 20;
  const filtro = cheio
    ? `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=yuv420p[v]`
    : `[0:v]split=2[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=20:2,eq=brightness=-0.08[fundo];` +
      `[b]scale=${W}:${H}:force_original_aspect_ratio=decrease[meio];[fundo][meio]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[v]`;
  const temp = video.replace(/\.mp4$/i, '') + ' (formato).mp4';
  await rodar(exigir('ffmpeg'), ['-y', '-v', 'error', '-i', video, '-filter_complex', filtro, '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf),
    '-c:a', 'copy', '-movflags', '+faststart', temp]);
  fs.renameSync(temp, video);
}

/** Editar áudio: vídeo com uma imagem só, do tamanho do áudio. tipo 'fundo' (um fundo do programa) ou
   'foto' (fundo neutro com a foto de quem fala no centro, mais para cima, para a legenda caber embaixo). */
lidar('editar:videodeimagem', async ({ audio, tipo, fundo, foto, formato }) => {
  const fmt = formatoValido(formato) || 'horizontal';
  const { largura: W, altura: H } = tamanhoSaida(fmt, 'alta');
  fs.mkdirSync(pastaTemporaria(), { recursive: true });
  const saida = path.join(pastaTemporaria(), `imagem-${Date.now()}.mp4`);
  let entradas, filtro;
  if (tipo === 'fundo') {
    const img = arquivoDoFundo(fundo || '', fmt);
    if (!fs.existsSync(img)) throw new Error('Não achei esse fundo.');
    entradas = ['-loop', '1', '-framerate', '1', '-i', img];
    filtro = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=25,format=yuv420p[v]`;
  } else {
    if (!foto || !fs.existsSync(foto)) throw new Error('Escolha a foto de quem fala.');
    const lado = Math.round(Math.min(W, H) * 0.5 / 2) * 2;
    const topo = Math.round(H * (fmt === 'vertical' ? 0.22 : 0.12));
    entradas = ['-f', 'lavfi', '-i', `color=c=0x2B2F36:s=${W}x${H}:r=25`, '-loop', '1', '-framerate', '1', '-i', foto];
    filtro = `[1:v]scale=${lado}:${lado}:force_original_aspect_ratio=increase,crop=${lado}:${lado},setsar=1[f];[0:v][f]overlay=(W-w)/2:${topo},fps=25,format=yuv420p[v]`;
  }
  await rodar(exigir('ffmpeg'), ['-y', '-v', 'error', ...entradas, '-i', audio, '-filter_complex', filtro, '-map', '[v]', '-map', `${tipo === 'fundo' ? 1 : 2}:a:0`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', '-crf', '20', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', saida]);
  const f = await faixasDoArquivo(saida);
  return { arquivo: saida, duracao: f.duracao, largura: f.largura, altura: f.altura, formato: fmt };
});
lidar('escolher:foto', async (d) => {
  const r = await dialog.showOpenDialog(janela, { title: (d && d.titulo) || 'Foto de quem fala', properties: ['openFile'],
    filters: [{ name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp'] }, { name: 'Todos os arquivos', extensions: ['*'] }] });
  return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
});

// --- 1.9: Edição de vídeo e áudio ----------------------------------------------------------
// Arquivo só de áudio vira um MP4 temporário com uma imagem preta de 16x16, para as telas de
// áudio (as mesmas da gravação) trabalharem igual. No fim, sai só o som, em MP3.
const fontesSoAudio = new Map(); // MP4 temporário -> áudio original
function fonteSoAudio(...arquivos) {
  for (const a of arquivos) {
    if (!a) continue;
    const f = fontesSoAudio.get(path.resolve(String(a)));
    if (f) return f;
  }
  return null;
}
function faixasDoArquivo(arquivo) {
  return new Promise((ok, falha) => {
    const p = spawn(exigir('ffprobe'), ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:stream_disposition=attached_pic:format=duration', '-of', 'json', arquivo], { windowsHide: true });
    let o = '';
    p.stdout.on('data', (b) => { o += b; });
    p.on('error', falha);
    p.on('close', () => {
      try {
        const j = JSON.parse(o || '{}');
        const st = j.streams || [];
        // Capa de MP3 aparece como faixa de vídeo "attached_pic": não conta como imagem.
        const v = st.find((x) => x.codec_type === 'video' && !(x.disposition && x.disposition.attached_pic));
        ok({ video: !!v, audio: st.some((x) => x.codec_type === 'audio'), audioCodec: ((st.find((x) => x.codec_type === 'audio')) || {}).codec_name || '', duracao: Number((j.format || {}).duration) || 0,
          largura: v ? Number(v.width) || 0 : 0, altura: v ? Number(v.height) || 0 : 0 });
      } catch (_) { ok({ video: false, audio: false, duracao: 0 }); }
    });
  });
}
function embrulharAudio(entrada, saida, codec) {
  // 1.9.4: MP3 e AAC entram no vídeo de trabalho como estão, sem regravar (2 segundos em vez de 30 para 10 minutos).
  // 1.9.6: WAV e os outros formatos entram em FLAC, sem perda e umas dez vezes mais rápido que AAC.
  const copiar = ['mp3', 'aac'].includes(String(codec || '').toLowerCase());
  return new Promise((ok, falha) => {
    const args = ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=16x16:r=30', '-i', entrada,
      '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      ...(copiar ? ['-c:a', 'copy'] : ['-c:a', 'flac', '-strict', '-2']), '-shortest', '-movflags', '+faststart', saida];
    const p = spawn(exigir('ffmpeg'), args, { windowsHide: true });
    let erro = '';
    p.stderr.on('data', (b) => { erro = (erro + b).slice(-2000); });
    p.on('error', falha);
    p.on('close', (c) => (c === 0 ? ok() : falha(new Error('Não consegui preparar o áudio. ' + erro.split('\n').filter(Boolean).slice(-1).join(' ')))));
  });
}
lidar('edicao:escolher', async () => {
  const r = process.env.OLHO_TESTE_EDICAO_ARQUIVO ? { canceled: false, filePaths: [process.env.OLHO_TESTE_EDICAO_ARQUIVO] } : await dialog.showOpenDialog(janela, {
    title: 'Adicionar vídeo ou áudio',
    properties: ['openFile'],
    filters: [
      { name: 'Vídeos e áudios', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', '3gp', 'mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'wma'] },
      { name: 'Todos os arquivos', extensions: ['*'] }
    ]
  });
  if (r.canceled || !r.filePaths.length) return null;
  const arquivo = r.filePaths[0];
  const f = await faixasDoArquivo(arquivo);
  const nome = path.basename(arquivo);
  const pasta = path.dirname(arquivo);
  if (!f.video && !f.audio) throw new Error('O arquivo não tem som nem imagem que o programa consiga abrir.');
  return { original: arquivo, nome, pasta, soAudio: !f.video, temAudio: f.audio, duracao: f.duracao, largura: f.largura, altura: f.altura };
});
// Editar áudio: devolve o arquivo em que as telas de áudio trabalham.
lidar('edicao:prepararaudio', async ({ original, semImagem }) => {
  const f = await faixasDoArquivo(original);
  if (!f.audio) throw new Error('Este arquivo não tem som.');
  if (f.video) {
    // 3.0.3: Editar áudio do menu Áudio, com um vídeo: o resultado é só o som, em MP3. As outras telas voltam a tratar o mesmo vídeo como vídeo.
    if (semImagem) fontesSoAudio.set(path.resolve(original), original); else fontesSoAudio.delete(path.resolve(original));
    return { arquivo: original };
  }
  // O mesmo áudio, sem mudança desde a última vez, reaproveita o MP4 temporário.
  const marca = `${path.resolve(original)}|${fs.statSync(original).mtimeMs}`;
  const pronto = embrulhados.get(marca);
  if (pronto && fs.existsSync(pronto)) return { arquivo: pronto };
  fs.mkdirSync(pastaTemporaria(), { recursive: true });
  const saida = path.join(pastaTemporaria(), `edicao-audio-${Date.now()}.mp4`);
  await embrulharAudio(original, saida, f.audioCodec);
  fontesSoAudio.set(path.resolve(saida), original);
  embrulhados.set(marca, saida);
  return { arquivo: saida };
});
const embrulhados = new Map(); // "<áudio>|<data>" -> MP4 temporário
// 1.9.1: Alt S nas telas que não têm um salvar próprio: uma cópia do arquivo, no formato das
// Configurações ("O Alt S salva em": vídeo e áudio, só vídeo ou só áudio). Arquivo só de áudio sai em MP3.
lidar('salvar:copia', async ({ arquivo, nome, soAudio, exato, modo: pedido }) => {
  if (!arquivo || !fs.existsSync(arquivo)) throw new Error('Não achei o arquivo para salvar.');
  const f = await faixasDoArquivo(arquivo);
  if (soAudio) f.video = false; // 1.9.2: Editar áudio, "Só o áudio": o MP4 de trabalho vira só o MP3
  const modo = f.video ? modoPedido(pedido) : 'audio';
  const pastaV = pastaDoTipo('video'), pastaA = pastaDoTipo('audio');
  const base = String(nome || path.basename(arquivo)).replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '').trim() || 'salvo';
  const raiz = exato ? base : `${base} - salvo`; // exato: o nome como veio (Editar áudio, "fala editado")
  let n = raiz;
  for (let i = 2; fs.existsSync(path.join(pastaV, n + '.mp4')) || fs.existsSync(path.join(pastaA, n + '.mp3')); i++) n = `${raiz} ${i}`;
  if (f.video) {
    const r = await salvarTrechoAV({ entrada: arquivo, inicio: 0, fim: f.duracao, ganhoDb: 0, saidaVideo: path.join(pastaV, n + '.mp4'), saidaAudio: path.join(pastaA, n + '.mp3'), modo });
    return { nome: n, video: !!r.saidaVideo, audio: !!r.saidaAudio, documentos: path.basename(pastaDocumentos()) };
  }
  await rodar(exigir('ffmpeg'), ['-y', '-v', 'error', '-i', arquivo, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', path.join(pastaA, n + '.mp3')]);
  return { nome: n, video: false, audio: true, documentos: path.basename(pastaDocumentos()) };
});
// 1.9: Montar vídeo: o som do MP4 de trabalho das etapas de áudio vira o áudio do vídeo (M4A, sem recodificar).
lidar('montar:extrairaudio', async ({ arquivo }) => {
  fs.mkdirSync(pastaTemporaria(), { recursive: true });
  // 1.9.6: o som sai sem regravar, no recipiente que serve ao codec dele (AAC em m4a, MP3 em mp3, FLAC em flac).
  const codec = String((await faixasDoArquivo(arquivo)).audioCodec || '').toLowerCase();
  const saida = path.join(pastaTemporaria(), `montar-audio-${Date.now()}.${codec === 'mp3' ? 'mp3' : codec === 'flac' ? 'flac' : 'm4a'}`);
  await new Promise((ok, falha) => {
    const p = spawn(exigir('ffmpeg'), ['-y', '-v', 'error', '-i', arquivo, '-map', '0:a:0', '-vn', '-c:a', 'copy', saida], { windowsHide: true });
    let erro = '';
    p.stderr.on('data', (b) => { erro = (erro + b).slice(-2000); });
    p.on('error', falha);
    p.on('close', (c) => (c === 0 ? ok() : falha(new Error('Não consegui tirar o som do vídeo de trabalho. ' + erro.trim().split('\n').slice(-1)[0]))));
  });
  const f = await faixasDoArquivo(saida);
  return { caminho: saida, url: urlDoArquivo(saida), duracao: f.duracao };
});
// Os MP4 temporários dos áudios somem quando o programa fecha.
app.on('will-quit', () => { for (const a of fontesSoAudio.keys()) { try { fs.unlinkSync(a); } catch (_) { /* */ } } });

// --- 2.0.6: aviso de versão nova ---------------------------------------------------------------------
// O programa consulta, ao abrir, um arquivo pequeno no site (atualizacao.json). Se a versão de lá for maior,
// avisa. Só baixa e instala se a pessoa pedir; o setup é conferido pela assinatura SHA-256 antes de rodar.
const ATUALIZACAO_URL = process.env.OLHO_TESTE_ATUALIZACAO || 'https://joycepsi.com.br/olho/atualizacao.json';
const ATU = require('./src/atualizacao');
const atualizacaoTrabalho = { abortar: null, processo: null };
let atualizacaoAchada = null, atualizacaoPronta = null;
const versaoMaior = ATU.versaoMaior;
// Onde o programa está instalado. Em desenvolvimento (sem app.asar) a rota leve nunca é usada.
const pastaRecursos = () => process.env.OLHO_TESTE_RECURSOS || process.resourcesPath;
const asarDoApp = () => path.join(pastaRecursos(), 'app.asar');
const empacotado = () => !!process.env.OLHO_TESTE_RECURSOS || (app.isPackaged && fs.existsSync(asarDoApp()));
const helperDoApp = () => path.join(pastaRecursos(), 'helper', 'trocar-asar.js');
function baseRuntimeLocal() {
  try { const j = JSON.parse(fs.readFileSync(path.join(pastaRecursos(), 'helper', 'base-runtime.json'), 'utf8')); return typeof j.baseRuntime === 'string' ? j.baseRuntime : ''; } catch (_) { return ''; }
}
/** A pasta do programa aceita criar e renomear arquivo, sem pedir permissão extra? */
function pastaDoAppGravavel() {
  const pasta = path.dirname(asarDoApp());
  const a = path.join(pasta, `.teste-${process.pid}-${Date.now()}`), b = a + '.b';
  try { fs.writeFileSync(a, 'x'); fs.renameSync(a, b); fs.unlinkSync(b); return true; }
  catch (_) { try { fs.unlinkSync(a); } catch (__) { /* */ } try { fs.unlinkSync(b); } catch (__) { /* */ } return false; }
}
const pastaAtualizacao = () => path.join(app.getPath('userData'), 'atualizacao');
async function verificarAtualizacao() {
  try {
    if (!/^https:\/\//i.test(ATUALIZACAO_URL) && !process.env.OLHO_TESTE_ATUALIZACAO) return null;
    const ctl = new AbortController(); const lim = setTimeout(() => ctl.abort(), 8000);
    const r = await net.fetch(ATUALIZACAO_URL, { signal: ctl.signal, headers: { 'cache-control': 'no-cache' } });
    clearTimeout(lim);
    if (!r.ok) return null;
    const texto = await r.text();
    if (texto.length > 65536) return null;
    const v = ATU.validarManifesto(JSON.parse(texto));
    if (!v.ok) return null;
    const m = v.manifesto;
    const rota = ATU.escolherRota(m, { versaoAtual: app.getVersion(), baseRuntimeLocal: baseRuntimeLocal(), temHelper: fs.existsSync(helperDoApp()),
      empacotado: empacotado(), pastaGravavel: m.leve ? pastaDoAppGravavel() : false, leveFalhouNaVersao: lerConfig().leveFalhouNaVersao || '' });
    if (rota.rota === 'nenhuma') return null;
    atualizacaoPronta = null;
    atualizacaoAchada = { ...m, rota: rota.rota, motivoRota: rota.motivo, url: new URL(m.arquivo, ATUALIZACAO_URL).href,
      urlLeve: m.leve ? new URL(m.leve.arquivo, ATUALIZACAO_URL).href : '' };
    return { versao: m.versao, notas: m.notas, tamanho: rota.rota === 'leve' ? m.leve.tamanho : m.tamanho, atual: app.getVersion(), rota: rota.rota };
  } catch (_) { return null; }
}
lidar('atualizacao:verificar', () => verificarAtualizacao());
lidar('atualizacao:cancelar', () => { if (atualizacaoTrabalho.abortar) atualizacaoTrabalho.abortar(); return true; });
const sha256DoArquivo = (c) => new Promise((ok, falha) => { const h = crypto.createHash('sha256'); fs.createReadStream(c).on('data', (b) => h.update(b)).on('end', () => ok(h.digest('hex'))).on('error', falha); });
async function baixarSetupCompleto(a) {
  const destino = path.join(app.getPath('temp'), 'olho-da-cena-atualizacao', a.arquivo);
  await baixarConferido(a.url, destino, a.sha256, 'atualizacao', a.tamanho, { trabalho: atualizacaoTrabalho, canal: 'atualizacao:progresso',
    origem: new URL(ATUALIZACAO_URL).origin, limite: Math.max(a.tamanho * 1.05, 1024) , ocioso: 45000 });
  if (process.env.OLHO_TESTE_ATUALIZACAO) return { baixado: destino, versao: a.versao, rota: 'completo' };
  // O instalador fecha este programa, troca os arquivos e abre a versão nova. Os projetos e as configurações ficam.
  spawn(destino, [], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
  setTimeout(() => app.quit(), 800);
  return { baixado: destino, versao: a.versao, rota: 'completo' };
}
lidar('atualizacao:instalar', async () => {
  if (!atualizacaoAchada) throw new Error('Não há atualização para instalar.');
  if (atualizacaoTrabalho.abortar) throw new Error('A atualização já está sendo baixada.');
  const a = atualizacaoAchada;
  if (a.rota === 'leve') {
    // Pacote leve: baixa para a pasta privada, confere tamanho e hash, copia para ao lado do app.asar e espera a pessoa confirmar o reinício.
    // Nome neutro: o Electron trata qualquer arquivo .asar como pacote e se recusaria a lê-lo como arquivo comum.
    const dest = path.join(pastaAtualizacao(), 'pacote-leve.bin');
    let novo = '';
    try {
      fs.mkdirSync(pastaAtualizacao(), { recursive: true });
      await baixarConferido(a.urlLeve, dest, a.leve.sha256, 'atualizacao', a.leve.tamanho, { trabalho: atualizacaoTrabalho, canal: 'atualizacao:progresso',
        origem: new URL(ATUALIZACAO_URL).origin, limite: a.leve.tamanho, ocioso: 45000 });
      if (fs.statSync(dest).size !== a.leve.tamanho) throw new Error('o tamanho do arquivo não confere.');
      novo = asarDoApp() + '.novo';
      fs.copyFileSync(dest, novo);
      if ((await sha256DoArquivo(novo)) !== a.leve.sha256) throw new Error('a cópia ao lado do programa não confere.');
    } catch (e) {
      if (/CANCELADO/.test(e.message || '')) throw e;
      for (const f of [dest, novo]) { if (f) { try { fs.unlinkSync(f); } catch (_) { /* */ } } }
      // O leve falhou: a instalação fica como está, e a rota passa a ser o setup completo.
      a.rota = 'completo';
      return { leveFalhou: true, motivo: e.message || String(e), tamanho: a.tamanho, versao: a.versao };
    }
    if (process.env.OLHO_TESTE_ATUALIZACAO) { atualizacaoPronta = { novo, versao: a.versao }; return { leve: true, pronto: true, versao: a.versao, novo }; }
    atualizacaoPronta = { novo, versao: a.versao };
    return { leve: true, pronto: true, versao: a.versao };
  }
  return baixarSetupCompleto(a);
});
// Só depois da confirmação da pessoa: o ajudante espera este programa fechar, troca o arquivo e abre de novo.
lidar('atualizacao:reiniciar', () => {
  if (!atualizacaoPronta || !fs.existsSync(atualizacaoPronta.novo)) throw new Error('Não há pacote pronto para aplicar.');
  const args = [helperDoApp(), ...ATU.argumentosDoHelper({ pid: process.pid, asar: asarDoApp(), novo: atualizacaoPronta.novo, backup: asarDoApp() + '.anterior', exe: process.execPath,
    versao: atualizacaoPronta.versao, marca: path.join(pastaAtualizacao(), 'saude.txt'), diagnostico: path.join(pastaAtualizacao(), 'diagnostico.json') })];
  if (process.env.OLHO_TESTE_ATUALIZACAO) return { args };
  fs.mkdirSync(pastaAtualizacao(), { recursive: true });
  spawn(process.execPath, args, { detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }).unref();
  setTimeout(() => app.quit(), 600);
  return true;
});
// Depois de uma troca: avisa o ajudante que a abertura deu certo, e guarda o que ele registrou para dizer à pessoa.
function aposAtualizacaoLeve() {
  const marca = process.env.OLHO_MARCA_SAUDE, versao = process.env.OLHO_POS_ATUALIZACAO;
  if (marca && versao && janela) {
    janela.webContents.once('did-finish-load', () => setTimeout(() => { try { fs.mkdirSync(path.dirname(marca), { recursive: true }); fs.writeFileSync(marca, app.getVersion()); } catch (_) { /* o ajudante desfaz */ } }, 3000));
    if (app.getVersion() === versao) salvarConfig({ avisoAtualizacao: `Atualizado para a versão ${app.getVersion()}.` });
  }
  const falhou = process.env.OLHO_ATUALIZACAO_FALHOU;
  let diag = null; try { diag = JSON.parse(fs.readFileSync(path.join(pastaAtualizacao(), 'diagnostico.json'), 'utf8')); } catch (_) { /* nenhum */ }
  if (falhou || (diag && diag.ok === false && diag.versao)) {
    const v = falhou || diag.versao;
    salvarConfig({ leveFalhouNaVersao: String(v), avisoAtualizacao: `A atualização rápida para a versão ${v} não deu certo, e a versão anterior foi mantida. Use o botão de baixar e instalar a versão completa, na tela inicial.` });
    try { fs.unlinkSync(path.join(pastaAtualizacao(), 'diagnostico.json')); } catch (_) { /* */ }
  }
}

// --- 2.0.5: converter áudios em lote em vídeo simples ------------------------------------------------
// A pasta traz os áudios e, se a pessoa quiser, uma imagem chamada logo e outra imagem de qualquer nome.
// Cada áudio vira um vídeo leve: título igual ao nome do arquivo, logo acima ou em faixa, imagem de fundo.
const LOTE = require('./src/lote');
const loteAtual = { cancelar: false, processo: null };
async function lerPastaLote(pasta) {
  const nomes = fs.readdirSync(pasta, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name);
  const r = LOTE.separarPasta(nomes);
  const dims = async (n) => {
    if (!n) return null;
    try { const f = await faixasDoArquivo(path.join(pasta, n)); return f.largura && f.altura ? { largura: f.largura, altura: f.altura } : null; } catch (_) { return null; }
  };
  return { pasta, nome: path.basename(pasta), ...r, dimsImagem: await dims(r.imagem), dimsLogo: await dims(r.logo) };
}
lidar('lote:escolherpasta', async () => {
  const r = await dialog.showOpenDialog(janela, { title: 'Pasta com os áudios, a logo e a imagem', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths.length) return null;
  return lerPastaLote(r.filePaths[0]);
});
lidar('lote:conferir', async ({ pasta, formato }) => {
  const r = await lerPastaLote(pasta);
  return { avisos: r.dimsImagem ? LOTE.avisosDaImagem(r.dimsImagem.largura, r.dimsImagem.altura, formato) : [], tem: r.audios.length };
});
lidar('lote:cancelar', () => {
  loteAtual.cancelar = true;
  if (loteAtual.processo) { try { loteAtual.processo.kill(); } catch (_) { /* */ } }
  return true;
});
/** ffmpeg com o andamento (0 a 1) do vídeo que está sendo escrito. */
function rodarLote(args, duracao, aoAvancar) {
  return new Promise((ok, falha) => {
    const p = spawn(exigir('ffmpeg'), ['-progress', 'pipe:1', '-nostats', ...args], { windowsHide: true });
    loteAtual.processo = p;
    let erro = '', resto = '';
    p.stdout.on('data', (b) => {
      resto += b.toString();
      const linhas = resto.split(/\r?\n/); resto = linhas.pop();
      for (const l of linhas) {
        const x = /^out_time_us=(\d+)/.exec(l);
        if (x && duracao > 0) aoAvancar(Math.min(1, Number(x[1]) / 1e6 / duracao));
      }
    });
    p.stderr.on('data', (b) => { erro = (erro + b).slice(-3000); });
    p.on('error', falha);
    p.on('close', (c, sinal) => {
      loteAtual.processo = null;
      if (loteAtual.cancelar) return falha(new Error('CANCELADO'));
      if (sinal || c === null) return falha(new Error('CANCELADO'));
      c === 0 ? ok() : falha(new Error(erro.split('\n').filter(Boolean).slice(-2).join(' ') || 'O FFmpeg parou.'));
    });
  });
}
lidar('lote:converter', async ({ pasta, formato }) => {
  if (loteAtual.processo) throw new Error('Já tem uma conversão em andamento.');
  if (!pasta || !fs.existsSync(pasta)) throw new Error('Não achei a pasta.');
  if (!LOTE.TAMANHOS[formato]) throw new Error('Escolha a proporção.');
  const info = await lerPastaLote(pasta);
  if (!info.audios.length) throw new Error('A pasta não tem áudios.');
  loteAtual.cancelar = false;
  const { resolverFonte } = require('./src/titulos');
  const fonte = resolverFonte(['C:/Windows/Fonts/arialbd.ttf', 'C:/Windows/Fonts/arial.ttf']);
  if (!fonte) throw new Error('Não encontrei nenhuma fonte para escrever o título.');
  const temp = path.join(pastaTemporaria(), `lote-${Date.now()}`);
  fs.mkdirSync(temp, { recursive: true });
  const seguro = (n) => String(n).replace(/[\\/:*?"<>|]/g, '').trim() || 'video';
  const destino = path.join(pasta, `Áudios em vídeo - ${seguro(info.nome)}`); // dentro da pasta dos áudios de origem
  fs.mkdirSync(destino, { recursive: true });
  const feitos = [], falhas = [];
  let cancelado = false;
  try {
    const comLogo = !!info.logo && !!info.dimsLogo, comImagem = !!info.imagem;
    const L = LOTE.layout(formato, { comLogo, comImagem, logoLargura: comLogo ? info.dimsLogo.largura : 1, logoAltura: comLogo ? info.dimsLogo.altura : 1 });
    let luminancia = 0.5;
    if (comLogo) {
      const amostra = await new Promise((ok) => {
        const p = spawn(exigir('ffmpeg'), ['-v', 'error', '-i', path.join(pasta, info.logo), '-vf', 'scale=16:16:flags=neighbor,format=rgba', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'], { windowsHide: true });
        const partes = []; p.stdout.on('data', (b) => partes.push(b)); p.on('error', () => ok(null)); p.on('close', () => ok(Buffer.concat(partes)));
      });
      if (amostra && amostra.length >= 4) luminancia = LOTE.luminanciaDe(amostra);
    }
    const fundo = path.join(temp, 'fundo.png');
    await rodar(exigir('ffmpeg'), LOTE.argsFundo({ L, imagem: comImagem ? path.join(pasta, info.imagem) : null, logo: comLogo ? path.join(pasta, info.logo) : null, luminancia, saida: fundo }));
    const total = info.audios.length;
    for (let i = 0; i < total; i++) {
      if (loteAtual.cancelar) { cancelado = true; break; }
      const nome = info.audios[i];
      const envia = (frac) => { if (janela) janela.webContents.send('lote:andamento', { atual: i + 1, total, nome, pct: Math.round(frac * 100), pctGeral: Math.round(((i + frac) / total) * 100) }); };
      envia(0);
      const arq = path.join(pasta, nome);
      const saida = path.join(destino, nomeLivre(destino, seguro(LOTE.semExtensao(nome)) + '.mp4'));
      try {
        const f = await faixasDoArquivo(arq);
        if (!f.audio) throw new Error('O arquivo não tem som.');
        const { tam, linhas } = LOTE.titularLinhas(LOTE.tituloDe(nome), L.W, L.base, L.maxAltura);
        const arquivosLinhas = linhas.map((linha, k) => { const t = path.join(temp, `t${i}_${k}.txt`); fs.writeFileSync(t, linha, 'utf8'); return t; });
        const quadro = path.join(temp, `q${i}.png`);
        await rodar(exigir('ffmpeg'), LOTE.argsQuadro({ L, fundo, fonte, arquivosLinhas, tam, comImagem, saida: quadro }));
        let ultimo = -1;
        await rodarLote(LOTE.argsVideo({ quadro, audio: arq, codec: f.audioCodec, saida }), f.duracao, (frac) => { const p = Math.floor(frac * 100); if (p > ultimo) { ultimo = p; envia(frac); } });
        feitos.push(path.basename(saida));
        envia(1);
      } catch (e) {
        try { fs.unlinkSync(saida); } catch (_) { /* */ }
        if (e.message === 'CANCELADO') { cancelado = true; break; }
        falhas.push({ nome, erro: e.message });
      }
    }
  } finally {
    try { fs.rmSync(temp, { recursive: true, force: true }); } catch (_) { /* */ }
  }
  return { feitos: feitos.length, falhas, cancelado, total: info.audios.length, pasta: destino, documentos: path.basename(pastaDocumentos()) };
});

// --- 1.9: tela de legenda: Whisper (opcional, baixado só se a pessoa quiser) -------------------
// O setup não traz o Whisper. Na tela de legenda, a pessoa escolhe baixar o modelo pequeno ou o
// grande; o motor (whisper.cpp, uns 4 MB) vem junto no primeiro download. Tudo fica guardado em
// AppData\Roaming\olho-da-cena\whisper e é conferido pela assinatura SHA-256 antes de usar.
const WHISPER = {
  motor: { url: 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.5/whisper-bin-x64.zip',
    sha256: '2a0e85915d0ff9e2a1d1b45b19973f05fbcdfb51d3af03557454acf6ccaa5e8a', tamanho: 4092743 },
  modelos: [
    { id: 'pequeno', nome: 'modelo pequeno', arquivo: 'ggml-small-q5_1.bin', tamanho: 190085487, tamanhoTexto: 'uns 190 MB',
      sha256: 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb' },
    { id: 'grande', nome: 'modelo grande', arquivo: 'ggml-large-v3-turbo.bin', tamanho: 1624555275, tamanhoTexto: 'uns 1,6 GB',
      sha256: '1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69' }
  ]
};
const urlModelo = (m) => (process.env.OLHO_TESTE_WHISPER_BASE ? `${process.env.OLHO_TESTE_WHISPER_BASE}/${m.arquivo}` :
  `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${m.arquivo}`);
const urlMotor = () => (process.env.OLHO_TESTE_WHISPER_BASE ? `${process.env.OLHO_TESTE_WHISPER_BASE}/whisper-bin-x64.zip` : WHISPER.motor.url);
const pastaWhisper = () => path.join(app.getPath('userData'), 'whisper');
const exeWhisper = () => path.join(pastaWhisper(), 'motor', 'whisper-cli.exe');
const arquivoModelo = (m) => path.join(pastaWhisper(), 'modelos', m.arquivo);
const modeloPorId = (id) => WHISPER.modelos.find((m) => m.id === id);
const legendaTrabalho = { abortar: null, processo: null };

function estadoWhisper() {
  return {
    motor: fs.existsSync(exeWhisper()),
    modelos: WHISPER.modelos.map((m) => ({ id: m.id, nome: m.nome, tamanhoTexto: m.tamanhoTexto, instalado: fs.existsSync(arquivoModelo(m)) }))
  };
}
lidar('legenda:estado', () => {
  if (process.env.OLHO_TESTE_PALAVRAS) return { motor: true, modelos: [{ id: 'teste', nome: 'Teste', tamanhoTexto: '', instalado: true }] };
  return estadoWhisper();
});

/** Baixa url para destino, conferindo o SHA-256; avisa o andamento. Cancela com legendaTrabalho.abortar. */
async function baixarConferido(url, destino, sha256, fase, totalEsperado, o = {}) {
  const trab = o.trabalho || legendaTrabalho; // 1.9.3: o descritor de imagens usa o mesmo download, com outro canal
  const canal = o.canal || 'legenda:progresso';
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const parcial = destino + '.parcial';
  const ctl = new AbortController();
  trab.abortar = () => ctl.abort();
  let saida = null;
  try {
    const resp = await net.fetch(url, { signal: ctl.signal });
    if (!resp.ok) throw new Error(`o servidor respondeu ${resp.status}.`);
    if (o.origem && resp.url && new URL(resp.url).origin !== o.origem) throw new Error('o servidor mandou o arquivo de outro endereço, então não aceitei.');
    const total = Number(resp.headers.get('content-length')) || totalEsperado || 0;
    saida = fs.createWriteStream(parcial);
    let recebido = 0, ultimo = -1;
    const terminou = new Promise((ok, falha) => { saida.on('finish', ok); saida.on('error', falha); });
    // Cada pedaço é copiado antes de ir para o disco: o pedaço que chega da rede pode ter a
    // memória reaproveitada pelo próximo, e o arquivo sairia estragado.
    let marcaOciosa = null;
    const armar = () => { if (o.ocioso) { clearTimeout(marcaOciosa); marcaOciosa = setTimeout(() => ctl.abort(), o.ocioso); } };
    armar();
    for await (const pedaco of resp.body) {
      const b = Buffer.from(pedaco);
      recebido += b.length;
      armar();
      if (o.limite && recebido > o.limite) throw new Error('o arquivo é maior do que o anunciado, então parei.');
      if (!saida.write(b)) await new Promise((ok) => saida.once('drain', ok));
      const pct = total ? Math.floor((recebido / total) * 100) : 0;
      if (pct !== ultimo && janela) { ultimo = pct; janela.webContents.send(canal, { fase, pct, recebido, total, ...(o.extra ? o.extra(recebido) : {}) }); }
    }
    clearTimeout(marcaOciosa);
    saida.end();
    await terminou;
    // A assinatura é conferida no arquivo já gravado, lido de volta do disco.
    const hash = crypto.createHash('sha256');
    await new Promise((ok, falha) => { fs.createReadStream(parcial).on('data', (b) => hash.update(b)).on('end', ok).on('error', falha); });
    if (hash.digest('hex') !== sha256) throw new Error('o arquivo baixado veio diferente do esperado. Tente de novo.');
    fs.renameSync(parcial, destino);
  } catch (e) {
    if (saida) { saida.destroy(); await new Promise((ok) => setTimeout(ok, 100)); } // Windows não apaga arquivo aberto
    try { fs.unlinkSync(parcial); } catch (_) { /* */ }
    if (ctl.signal.aborted) throw new Error('CANCELADO');
    throw e;
  } finally { trab.abortar = null; }
}
async function instalarMotor() {
  if (fs.existsSync(exeWhisper())) return;
  const zip = path.join(pastaWhisper(), 'motor.zip');
  await baixarConferido(urlMotor(), zip, WHISPER.motor.sha256, 'motor', WHISPER.motor.tamanho);
  const JSZip = require('jszip');
  const z = await JSZip.loadAsync(fs.readFileSync(zip));
  const pasta = path.join(pastaWhisper(), 'motor');
  fs.mkdirSync(pasta, { recursive: true });
  // Só o que o whisper-cli precisa: ele e as bibliotecas dele.
  for (const [nome, item] of Object.entries(z.files)) {
    const base = path.basename(nome);
    if (item.dir || !(/^whisper-cli\.exe$/i.test(base) || /\.dll$/i.test(base))) continue;
    fs.writeFileSync(path.join(pasta, base), await item.async('nodebuffer'));
  }
  try { fs.unlinkSync(zip); } catch (_) { /* */ }
  if (!fs.existsSync(exeWhisper())) throw new Error('o pacote do Whisper veio sem o programa de transcrição.');
}
lidar('legenda:baixar', async ({ modelo }) => {
  const m = modeloPorId(modelo);
  if (!m) throw new Error('Modelo desconhecido.');
  if (legendaTrabalho.abortar || legendaTrabalho.processo) throw new Error('Já tem um download ou uma transcrição em andamento.');
  await instalarMotor();
  if (!fs.existsSync(arquivoModelo(m))) await baixarConferido(urlModelo(m), arquivoModelo(m), m.sha256, 'modelo', m.tamanho);
  return estadoWhisper();
});
lidar('legenda:cancelar', () => {
  if (legendaTrabalho.abortar) legendaTrabalho.abortar();
  if (legendaTrabalho.processo) { try { legendaTrabalho.processo.kill(); } catch (_) { /* */ } }
  return true;
});

function rodar(cmd, args, opcoes = {}, aoErro = null) {
  return new Promise((ok, falha) => {
    const p = spawn(cmd, args, { windowsHide: true, ...opcoes });
    let erro = '';
    if (opcoes.guardar) legendaTrabalho.processo = p;
    p.stderr.on('data', (b) => { const t = b.toString(); erro = (erro + t).slice(-4000); if (aoErro) aoErro(t); });
    p.stdout.on('data', (b) => { if (aoErro) aoErro(b.toString()); });
    p.on('error', falha);
    p.on('close', (c, sinal) => {
      if (opcoes.guardar) legendaTrabalho.processo = null;
      if (sinal || c === null) return falha(new Error('CANCELADO'));
      c === 0 ? ok() : falha(new Error(erro.split('\n').filter(Boolean).slice(-2).join(' ')));
    });
  });
}
/** Transcreve o som do arquivo com o modelo escolhido: palavras com os tempos. */
lidar('legenda:transcrever', async ({ arquivo, modelo }) => {
  if (process.env.OLHO_TESTE_PALAVRAS) return { palavras: JSON.parse(process.env.OLHO_TESTE_PALAVRAS) };
  const m = modeloPorId(modelo);
  if (!m || !fs.existsSync(arquivoModelo(m))) throw new Error('O modelo não está instalado.');
  if (!fs.existsSync(exeWhisper())) throw new Error('O Whisper não está instalado.');
  if (legendaTrabalho.abortar || legendaTrabalho.processo) throw new Error('Já tem um download ou uma transcrição em andamento.');
  // Caminhos curtos, só com letras simples, relativos à pasta do Whisper: o whisper-cli do Windows
  // não entende acento no caminho (nome de usuário com acento, por exemplo).
  const raizW = pastaWhisper();
  const trabalho = path.join(raizW, 'trabalho');
  fs.mkdirSync(trabalho, { recursive: true });
  for (const f of fs.readdirSync(trabalho)) { try { fs.unlinkSync(path.join(trabalho, f)); } catch (_) { /* */ } }
  await rodar(exigir('ffmpeg'), ['-y', '-v', 'error', '-i', arquivo, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', path.join(trabalho, 'audio.wav')], { guardar: true });
  const args = ['-m', `modelos/${m.arquivo}`, '-f', 'trabalho/audio.wav', '-l', 'pt', '-ml', '1', '-sow', '-oj', '-of', 'trabalho/saida',
    '-t', String(Math.max(1, Math.min(8, os.cpus().length))), '-pp'];
  const exe = exeWhisper();
  const [cmd, todos] = process.platform === 'win32' || !process.env.OLHO_TESTE_WHISPER_WINE ? [exe, args] : ['wine', [exe, ...args]];
  let ultimo = -1;
  await rodar(cmd, todos, { cwd: raizW, guardar: true }, (t) => {
    const r = /progress\s*=\s*(\d+)%/g; let x;
    while ((x = r.exec(t))) {
      const pct = Number(x[1]);
      if (pct > ultimo && janela) { ultimo = pct; janela.webContents.send('legenda:progresso', { fase: 'transcricao', pct }); }
    }
  });
  const json = JSON.parse(fs.readFileSync(path.join(trabalho, 'saida.json'), 'utf8'));
  const palavras = LEG.palavrasDoWhisper(json);
  for (const f of fs.readdirSync(trabalho)) { try { fs.unlinkSync(path.join(trabalho, f)); } catch (_) { /* */ } }
  if (!palavras.length) throw new Error('O Whisper não encontrou fala neste áudio.');
  return { palavras };
});
/** Arquivo de texto ou SRT na pasta Extras da função atual, sem apagar nada que já exista. */
function salvarNaRaiz(nome, conteudo) {
  const pasta = pastaDoTipo('extras');
  const final = nomeLivre(pasta, String(nome).replace(/[\\/:*?"<>|]/g, '').trim() || 'legenda');
  fs.writeFileSync(path.join(pasta, final), conteudo, 'utf8');
  return { caminho: path.join(pasta, final), nome: final, documentos: path.basename(pastaDocumentos()) };
}
// 2.0: Extras, descrição de imagem salva em texto na pasta Olho da Cena.
lidar('extras:salvartexto', ({ nome, sufixo, texto }) => salvarNaRaiz(`${nome} - ${sufixo || 'texto'}.txt`, String(texto || '') + '\n'));
lidar('legenda:salvartexto', ({ palavras, nome }) => {
  const texto = LEG.textoDaTranscricao(palavras);
  return { ...salvarNaRaiz(`${nome} - transcrição.txt`, texto), linhas: texto.split('\n').filter((l) => l.trim()).length };
});
lidar('legenda:salvarsrt', ({ legendas, estilo, nome }) => salvarNaRaiz(`${nome} - legenda.srt`, LEG.srtDasLegendas(legendas, estilo)));
lidar('legenda:montar', ({ palavras, cues, estilo }) => (palavras ? LEG.legendasDasPalavras(palavras, estilo) : LEG.legendasDoSrt(cues, estilo)));
lidar('legenda:abrirsrt', async () => {
  const r = await dialog.showOpenDialog(janela, { title: 'Inserir SRT', properties: ['openFile'],
    filters: [{ name: 'Legenda SRT', extensions: ['srt'] }, { name: 'Todos os arquivos', extensions: ['*'] }] });
  if (r.canceled || !r.filePaths.length) return null;
  const bruto = fs.readFileSync(r.filePaths[0]);
  // UTF-8 é o comum; arquivo antigo do Windows vem em Latin-1 e viraria letra trocada.
  let texto = bruto.toString('utf8');
  if (texto.includes('�')) texto = bruto.toString('latin1');
  texto = texto.replace(/^﻿/, '').replace(/<[^>]+>/g, '');
  const originais = SRT.parseSrt(texto);
  if (!originais.length) throw new Error('Não encontrei nenhuma legenda nesse arquivo. Ele é mesmo um SRT?');
  originais.sort((a, b) => a.inicio - b.inicio);
  const { cues, pontos } = SRT.revisarCues(originais);
  const lista = cues.map((c) => ({ inicio: c.inicio, fim: c.fim, texto: c.linhas.join(' ').replace(/\s+/g, ' ').trim() })).filter((c) => c.texto);
  return { cues: lista, nome: path.basename(r.filePaths[0]), ajustes: pontos.length };
});
/** Gravar vídeo: queima a legenda (ASS do estilo) no vídeo pronto, no mesmo arquivo. */
async function queimarLegenda(video, legenda) {
  if (!legenda) return false;
  if (!legenda.srt || !fs.existsSync(legenda.srt) || !LEG.estilo(legenda.estilo)) throw new Error('O vídeo ficou pronto, mas não achei o arquivo da legenda para pôr nele.');
  const medida = await new Promise((ok) => {
    const p = spawn(exigir('ffprobe'), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', video], { windowsHide: true });
    let o = ''; p.stdout.on('data', (b) => { o += b; }); p.on('close', () => ok(o.trim())); p.on('error', () => ok(''));
  });
  const [largura, altura] = medida.split(',').map(Number);
  if (!largura || !altura) throw new Error('Não consegui medir o vídeo para pôr a legenda.');
  const cues = SRT.parseSrt(fs.readFileSync(legenda.srt, 'utf8')).map((c) => ({ inicio: c.inicio, fim: c.fim, texto: c.linhas.join(' ') }));
  fs.mkdirSync(pastaTemporaria(), { recursive: true });
  const ass = path.join(pastaTemporaria(), `legenda-${Date.now()}.ass`);
  fs.writeFileSync(ass, LEG.assDasLegendas(cues, legenda.estilo, largura, altura), 'utf8');
  const temp = video.replace(/\.mp4$/i, '') + ' (legenda).mp4';
  try {
    await rodar(exigir('ffmpeg'), ['-y', '-v', 'error', '-i', video, '-vf', `subtitles='${caminhoFiltro(ass)}'`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', temp]);
    fs.renameSync(temp, video);
    return true;
  } catch (e) {
    try { fs.unlinkSync(temp); } catch (_) { /* */ }
    throw new Error('O vídeo ficou pronto, mas não consegui pôr a legenda. ' + e.message);
  } finally { try { fs.unlinkSync(ass); } catch (_) { /* */ } }
}

// --- 1.9.3: descritor de imagens, experimental: motor llama.cpp + Gemma 3 de 4 bilhões --------------
// Opcional, como o Whisper: um botão baixa os três arquivos em fila e confere cada um. Tudo roda no
// computador, sem internet depois do download. Fica em AppData\Roaming\olho-da-cena\descritor.
const DESCRITOR = {
  partes: [
    { id: 'motor', arquivo: 'llama-bin-win-cpu-x64.zip', url: 'https://github.com/ggml-org/llama.cpp/releases/download/b12054/llama-b12054-bin-win-cpu-x64.zip',
      sha256: '20c4ef19ce5bc19a244a598833be5ed10aebf2dc05746038edf1da37ef1c680e', tamanho: 24586599 },
    { id: 'modelo', arquivo: 'gemma-3-4b-it-Q4_K_M.gguf', url: 'https://huggingface.co/ggml-org/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf',
      sha256: '882e8d2db44dc554fb0ea5077cb7e4bc49e7342a1f0da57901c0802ea21a0863', tamanho: 2489757856 },
    { id: 'visao', arquivo: 'mmproj-model-f16.gguf', url: 'https://huggingface.co/ggml-org/gemma-3-4b-it-GGUF/resolve/main/mmproj-model-f16.gguf',
      sha256: '8c0fb064b019a6972856aaae2c7e4792858af3ca4561be2dbf649123ba6c40cb', tamanho: 851251104 }
  ]
};
const descritorTrabalho = { abortar: null, processo: null };
const pastaDescritor = () => path.join(app.getPath('userData'), 'descritor');
const exeDescritor = () => path.join(pastaDescritor(), 'motor', 'llama-mtmd-cli.exe');
const arqDescritor = (p) => path.join(pastaDescritor(), 'modelos', p.arquivo);
const urlDescritor = (p) => (process.env.OLHO_TESTE_WHISPER_BASE ? `${process.env.OLHO_TESTE_WHISPER_BASE}/${p.arquivo}` : p.url);
function estadoDescritor() {
  const motor = fs.existsSync(exeDescritor());
  const modelo = DESCRITOR.partes.filter((p) => p.id !== 'motor').every((p) => fs.existsSync(arqDescritor(p)));
  return { motor, modelo, instalado: motor && modelo };
}
lidar('descritor:estado', () => estadoDescritor());
async function instalarMotorDescritor() {
  if (fs.existsSync(exeDescritor())) return;
  const zip = path.join(pastaDescritor(), 'motor.zip');
  const p = DESCRITOR.partes[0];
  const JSZip = require('jszip');
  const z = await JSZip.loadAsync(fs.readFileSync(zip));
  const pasta = path.join(pastaDescritor(), 'motor');
  fs.mkdirSync(pasta, { recursive: true });
  // Só o programa de descrever e as bibliotecas dele. Para teste no Wine, sem as variantes de CPU novas demais.
  const pular = process.env.OLHO_TESTE_WHISPER_WINE ? /ggml-cpu-(sapphirerapids|cannonlake|cascadelake|cooperlake|icelake|skylakex|zen4|alderlake)\.dll$/i : null;
  for (const [nome, item] of Object.entries(z.files)) {
    const base = path.basename(nome);
    if (item.dir || !(/^llama-mtmd-cli\.exe$/i.test(base) || /\.dll$/i.test(base)) || (pular && pular.test(base))) continue;
    fs.writeFileSync(path.join(pasta, base), await item.async('nodebuffer'));
  }
  try { fs.unlinkSync(zip); } catch (_) { /* */ }
  void p;
  if (!fs.existsSync(exeDescritor())) throw new Error('o pacote do descritor veio sem o programa de descrever.');
}
lidar('descritor:baixar', async () => {
  if (descritorTrabalho.abortar || descritorTrabalho.processo) throw new Error('Já tem um download ou uma descrição em andamento.');
  const total = DESCRITOR.partes.reduce((a, p) => a + p.tamanho, 0);
  let antes = 0;
  for (const p of DESCRITOR.partes) {
    const feito = p.id === 'motor' ? fs.existsSync(exeDescritor()) : fs.existsSync(arqDescritor(p));
    if (!feito) {
      const destino = p.id === 'motor' ? path.join(pastaDescritor(), 'motor.zip') : arqDescritor(p);
      const base = antes;
      await baixarConferido(urlDescritor(p), destino, p.sha256, 'descritor-' + p.id, p.tamanho, {
        trabalho: descritorTrabalho, canal: 'descritor:progresso',
        extra: (recebido) => ({ pct: Math.min(99, Math.floor(((base + recebido) / total) * 100)) })
      });
      if (p.id === 'motor') await instalarMotorDescritor();
    }
    antes += p.tamanho;
  }
  if (janela) janela.webContents.send('descritor:progresso', { fase: 'descritor', pct: 100 });
  return estadoDescritor();
});
lidar('descritor:cancelar', () => {
  if (descritorTrabalho.abortar) descritorTrabalho.abortar();
  if (descritorTrabalho.processo) { try { descritorTrabalho.processo.kill(); } catch (_) { /* */ } }
  return true;
});
// 2.0.7: Tirar fotos. A foto pronta (JPG) vai para a pasta do programa, ou para a subpasta Fotos nas pastas dedicadas.
lidar('foto:salvar', ({ dados, nome }) => {
  const pasta = pastaDoTipo('imagem', origemAtual === 'gravar' ? 'fotos' : undefined);
  const limpo = String(nome || 'Foto.jpg').replace(/[\\/:*?"<>|]/g, '').trim() || 'Foto.jpg';
  const final = nomeLivre(pasta, /\.jpe?g$/i.test(limpo) ? limpo : limpo + '.jpg');
  const arq = path.join(pasta, final);
  fs.writeFileSync(arq, Buffer.from(dados));
  return { caminho: arq, nome: final, pasta };
});
// 3.0: Criar post. Cada post tem a sua subpasta em Posts, e as imagens saem numeradas na ordem de postar.
const pastaDePosts = () => path.join(criarPastaSaida(), 'Posts');
/** Posts\Imagens ou Posts\Vídeos. As pastas de post soltas de antes vão para Imagens, uma vez só, antes de qualquer pasta nova. */
function garantirMigracaoDePosts() {
  if (lerConfig().migrouPosts) return;
  const raiz = path.join(criarPastaSaida(), 'Posts');
  const r = PASTAS_POSTS.migrarPostsParaImagens(raiz, fs);
  if (r.feito) salvarConfig({ migrouPosts: true }); // em silêncio: só quem testa tem as pastas antigas
}
const pastaDoTipoDePost = (tipo) => { garantirMigracaoDePosts(); return path.join(pastaDePosts(), PASTAS_POSTS.nomeDaSubpasta(tipo)); };
const arquivosDoPost = (pasta) => { try { return fs.readdirSync(pasta).filter((n) => /\.(jpe?g|png|mp4|txt)$/i.test(n)).sort(); } catch (_) { return []; } };
lidar('post:preparar', ({ nome, tipo }) => {
  const limpo = FOTOS.nomeDaPastaPost(nome);
  if (!limpo) throw new Error('Escreva um nome para a pasta.');
  const pasta = path.join(pastaDoTipoDePost(tipo), limpo);
  const existia = fs.existsSync(pasta);
  const nomes = arquivosDoPost(pasta);
  return { pasta, nome: limpo, existia, arquivos: nomes.length, proximo: FOTOS.proximoNumeroPost(nomes), lista: nomes, subpasta: PASTAS_POSTS.nomeDaSubpasta(tipo) };
});
// 3.0.2: posts em vídeo. O vídeo é escolhido aqui, os cartões chegam como imagens prontas e a legenda como palavras com tempos.
lidar('postvideo:escolher', async () => {
  let arquivo = process.env.OLHO_TESTE_VIDEO_POST || '';
  if (!arquivo) {
    const r = await dialog.showOpenDialog(janela, { title: 'Escolher o vídeo do post', properties: ['openFile'],
      filters: [{ name: 'Vídeos', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', '3gp'] }, { name: 'Todos os arquivos', extensions: ['*'] }] });
    if (r.canceled || !r.filePaths.length) return null;
    arquivo = r.filePaths[0];
  }
  const f = await faixasDoArquivo(arquivo);
  if (!f.video) throw new Error('Este arquivo não tem imagem. Escolha um vídeo.');
  return { arquivo, nome: path.basename(arquivo), temAudio: !!f.audio, duracao: f.duracao, largura: f.largura, altura: f.altura };
});
lidar('postvideo:orientacao', ({ formato, proporcao }) => VPOST.orientacaoDeGravacao(formato, proporcao));
lidar('postvideo:analise', (d) => VPOST.analisarTempo(d));
lidar('postvideo:explicacao', ({ formato, proporcao }) => VPOST.explicacaoDoFormato(formato, proporcao));
lidar('postvideo:info', async ({ arquivo }) => {
  if (!arquivo || !fs.existsSync(arquivo)) throw new Error('Não achei o vídeo.');
  const f = await faixasDoArquivo(arquivo);
  if (!f.video) throw new Error('Este arquivo não tem imagem.');
  return { arquivo, nome: path.basename(arquivo), temAudio: !!f.audio, duracao: f.duracao, largura: f.largura, altura: f.altura };
});
// Procura nas pastas de vídeos do programa (a raiz, Vídeos e as pastas de Vídeos de cada função) os vídeos que servem para este formato. Todos os que servem.
lidar('postvideo:sugerir', async ({ formato, proporcao }) => {
  const pastas = process.env.OLHO_TESTE_PASTA_VIDEOS ? [process.env.OLHO_TESTE_PASTA_VIDEOS] : PS.pastasDeVideos(criarPastaSaida());
  const achados = [];
  for (const pasta of [...new Set(pastas)]) {
    let nomes = [];
    try { nomes = fs.readdirSync(pasta, { withFileTypes: true }).filter((e) => e.isFile() && /\.(mp4|mov|mkv|webm|m4v|avi|3gp)$/i.test(e.name)).map((e) => e.name); } catch (_) { continue; }
    for (const n of nomes) { const c = path.join(pasta, n); try { achados.push({ caminho: c, pasta, nome: n, quando: fs.statSync(c).mtimeMs }); } catch (_) { /* */ } }
  }
  achados.sort((a, b) => b.quando - a.quando);
  const saida = [];
  for (const a of achados) {
    try {
      const f = await faixasDoArquivo(a.caminho);
      if (!f.video || !f.largura || !f.altura) continue;
      const av = VPOST.avaliarVideo({ formato, proporcao, duracao: f.duracao, largura: f.largura, altura: f.altura, temAudio: !!f.audio });
      if (av.nivel === 'nao') continue;
      saida.push({ arquivo: a.caminho, nome: a.nome, pasta: path.basename(a.pasta), temAudio: !!f.audio, duracao: f.duracao, largura: f.largura, altura: f.altura, nivel: av.nivel, motivo: av.motivo });
    } catch (_) { /* arquivo que o programa não abre fica de fora */ }
  }
  saida.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'bem' ? -1 : 1));
  return { sugestoes: saida, olhadas: achados.length };
});
lidar('postvideo:avisos', ({ formato, duracao, largura, altura, temAudio, proporcao }) => VPOST.avisosDoVideo({ formato, duracao, largura, altura, temAudio, proporcao }));
lidar('postvideo:preparar', async ({ pasta, arquivo: arquivoOriginal, formato, proporcao, ajuste, palavras, abertura, fecho, rotulo, duracao: duracaoPedida, largura: larguraPedida, altura: alturaPedida, temAudio: temAudioPedido, edicao }) => {
  let arquivo = arquivoOriginal, duracao = duracaoPedida, largura = larguraPedida, altura = alturaPedida, temAudio = temAudioPedido;
  const raiz = path.resolve(pastaDePosts());
  const alvo = path.resolve(String(pasta || ''));
  if (!(alvo.startsWith(raiz + path.sep))) throw new Error('Pasta do post inválida.');
  if (!arquivo || !fs.existsSync(arquivo)) throw new Error('Não achei o vídeo.');
  const fmt = VPOST.FORMATOS_VIDEO[formato];
  if (!fmt) throw new Error('Formato de vídeo desconhecido.');
  fs.mkdirSync(alvo, { recursive: true });
  fs.mkdirSync(pastaTemporaria(), { recursive: true });
  const [W, H] = VPOST.tamanhoDoPost(formato, proporcao);
  const limpar = [];
  // Cortes, silêncios e trilha marcados nas telas de áudio: o post aplica tudo aqui, numa passada só, antes dos cartões e da legenda.
  if (edicao && Array.isArray(edicao.planos) && edicao.audioArq && fs.existsSync(edicao.audioArq)) {
    const temp = path.join(pastaTemporaria(), `postvideo-editado-${Date.now()}.mp4`);
    limpar.push(temp);
    if (janela) janela.webContents.send('postvideo:andamento', { editando: true });
    try {
      await rodar(exigir('ffmpeg'), ['-y', '-v', 'error', '-i', arquivo, '-i', edicao.audioArq, '-filter_complex', `${CAD.filtroCadeia(edicao.planos)};[vc]fps=30,setsar=1,format=yuv420p[v]`,
        '-map', '[v]', '-map', '1:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-c:a', 'aac', '-b:a', '192k', '-shortest', temp]);
    } catch (e) { for (const f of limpar) { try { fs.unlinkSync(f); } catch (_) { /* */ } } throw new Error('Não consegui aplicar os cortes e o áudio no vídeo. ' + e.message); }
    const f = await faixasDoArquivo(temp);
    arquivo = temp; duracao = f.duracao; largura = f.largura; altura = f.altura; temAudio = !!f.audio;
  }
  const partes = VPOST.partesDoVideo(duracao, formato);
  const imagem = (dados, nome) => { if (!dados) return null; const c = path.join(pastaTemporaria(), `${nome}-${Date.now()}.png`); fs.writeFileSync(c, Buffer.from(dados)); return c; };
  const cartaoAb = imagem(abertura, 'abertura'), cartaoFe = imagem(fecho, 'fecho');
  const cues = palavras && palavras.length ? LEG.legendasDasPalavras(palavras, fmt.estilo) : [];
  const saidas = [];
  for (const c of [cartaoAb, cartaoFe]) if (c) limpar.push(c);
  try {
    for (let k = 0; k < partes.length; k++) {
      const p = partes[k];
      const ini = p.inicio !== undefined ? p.inicio : p.ini, fim = p.fim;
      let ass = null;
      const dela = cues.filter((c) => c.fim > ini && c.inicio < fim).map((c) => ({ inicio: Math.max(0, c.inicio - ini), fim: Math.min(fim, c.fim) - ini, texto: c.texto }));
      if (dela.length) { ass = path.join(pastaTemporaria(), `postvideo-${Date.now()}-${k}.ass`); fs.writeFileSync(ass, LEG.assDasLegendas(dela, fmt.estilo, W, H), 'utf8'); limpar.push(ass); }
      let numero = FOTOS.proximoNumeroPost(arquivosDoPost(alvo));
      const resumo = (rotulo || '').trim() || path.basename(arquivoOriginal, path.extname(arquivoOriginal));
      const sufixo = partes.length > 1 ? ` parte ${k + 1} de ${partes.length}` : '';
      let nome = FOTOS.nomeDoArquivoPost({ numero, moldura: formato, texto: resumo + sufixo, rotulo: '' });
      nome = nome.replace(/\.(jpe?g|png)$/i, '.mp4');
      while (fs.existsSync(path.join(alvo, nome))) { numero++; nome = FOTOS.nomeDoArquivoPost({ numero, moldura: formato, texto: resumo + sufixo, rotulo: '' }).replace(/\.(jpe?g|png)$/i, '.mp4'); }
      const saida = path.join(alvo, nome);
      const args = VPOST.argumentosDoPost({ entrada: arquivo, ini, fim, temAudio: !!temAudio, w: largura, h: altura, W, H, ajuste, ass,
        abertura: k === 0 ? cartaoAb : null, fecho: k === partes.length - 1 ? cartaoFe : null, saida });
      if (janela) janela.webContents.send('postvideo:andamento', { parte: k + 1, de: partes.length });
      try { await rodar(exigir('ffmpeg'), args); } catch (e) { try { fs.unlinkSync(saida); } catch (_) { /* */ } throw new Error('O FFmpeg não conseguiu preparar o vídeo. ' + e.message); }
      saidas.push({ caminho: saida, nome, numero });
    }
  } finally { for (const f of limpar) { try { fs.unlinkSync(f); } catch (_) { /* */ } } }
  return { saidas, pasta: alvo, lista: arquivosDoPost(alvo), legendado: cues.length > 0 };
});
lidar('postvideo:legendaTexto', async ({ pasta, palavras, link, imagem }) => {
  const raiz = path.resolve(pastaDePosts());
  const alvo = path.resolve(String(pasta || ''));
  if (!(alvo.startsWith(raiz + path.sep)) || !fs.existsSync(alvo)) throw new Error('Pasta do post inválida.');
  const fala = LEG.textoDaTranscricao(palavras || []);
  let corpo = '', origem = 'rascunho', motivo = '';
  if (process.env.OLHO_TESTE_LEGENDA) { corpo = process.env.OLHO_TESTE_LEGENDA; origem = 'gemma'; }
  else if (fala && imagem && estadoDescritor().instalado) {
    try { corpo = limparLegenda(await rodarDescritor(imagem, pedidoDeLegenda(fala), 380)); origem = corpo ? 'gemma' : 'rascunho'; } catch (e) { motivo = e.message || String(e); }
  } else if (!fala) motivo = 'O vídeo não tem fala para transcrever.';
  else motivo = 'O descritor de imagens não está instalado.';
  if (!corpo) corpo = fala;
  if (link && String(link).trim()) corpo = (corpo ? corpo + '\n\n' : '') + 'Link: ' + String(link).trim();
  if (!corpo) return { arquivo: '', nome: '', origem, motivo };
  const nome = nomeLivre(alvo, 'legenda.txt');
  fs.writeFileSync(path.join(alvo, nome), corpo + '\n', 'utf8');
  return { arquivo: path.join(alvo, nome), nome, origem, motivo };
});
lidar('post:salvar', ({ pasta, moldura, texto, rotulo, dados }) => {
  const raiz = path.resolve(pastaDePosts());
  const alvo = path.resolve(String(pasta || ''));
  if (!(alvo.startsWith(raiz + path.sep))) throw new Error('Pasta do post inválida.');
  fs.mkdirSync(alvo, { recursive: true });
  let numero = FOTOS.proximoNumeroPost(arquivosDoPost(alvo));
  let nome = FOTOS.nomeDoArquivoPost({ numero, moldura, texto, rotulo });
  while (fs.existsSync(path.join(alvo, nome))) { numero++; nome = FOTOS.nomeDoArquivoPost({ numero, moldura, texto, rotulo }); }
  const arq = path.join(alvo, nome);
  fs.writeFileSync(arq, Buffer.from(dados));
  return { caminho: arq, nome, numero, pasta: alvo, lista: arquivosDoPost(alvo) };
});
lidar('post:listar', ({ pasta }) => {
  const raiz = path.resolve(pastaDePosts());
  const alvo = path.resolve(String(pasta || ''));
  if (!(alvo.startsWith(raiz + path.sep))) throw new Error('Pasta do post inválida.');
  return { lista: arquivosDoPost(alvo) };
});
lidar('post:abrirpasta', ({ pasta }) => { const alvo = path.resolve(String(pasta || pastaDePosts())); fs.mkdirSync(alvo, { recursive: true }); return shell.openPath(alvo).then((r) => { if (r) throw new Error(r); return true; }); });
// 2.0.2: o quadro do vídeo ou da câmera vira um arquivo temporário para o descritor ler.
lidar('quadro:salvar', ({ dados }) => {
  fs.mkdirSync(pastaTemporaria(), { recursive: true });
  const arq = path.join(pastaTemporaria(), `quadro-${Date.now()}.png`);
  fs.writeFileSync(arq, Buffer.from(dados));
  return { caminho: arq };
});
/** Roda o descritor (Gemma) numa imagem com o pedido dado e devolve o texto bruto. Só um por vez. */
async function rodarDescritor(caminho, pedido, tokens) {
  if (!estadoDescritor().instalado) throw new Error('O descritor de imagens não está instalado.');
  if (!caminho || !fs.existsSync(caminho)) throw new Error('Não achei a imagem.');
  if (descritorTrabalho.abortar || descritorTrabalho.processo) throw new Error('Já tem um download ou uma descrição em andamento.');
  // Caminhos relativos, curtos e sem acento: o programa do Windows não entende acento no caminho.
  const raiz = pastaDescritor();
  const trabalho = path.join(raiz, 'trabalho');
  fs.mkdirSync(trabalho, { recursive: true });
  const img = path.join(trabalho, 'imagem.jpg');
  await rodar(exigir('ffmpeg'), ['-y', '-v', 'error', '-i', caminho, '-frames:v', '1', '-vf', "scale='min(896,iw)':-2", '-q:v', '3', img]);
  fs.writeFileSync(path.join(trabalho, 'pedido.txt'), pedido, 'utf8');
  const args = ['-m', `modelos/${DESCRITOR.partes[1].arquivo}`, '--mmproj', `modelos/${DESCRITOR.partes[2].arquivo}`, '--image', 'trabalho/imagem.jpg',
    '-f', 'trabalho/pedido.txt', '-n', String(tokens), '--temp', '0.2', '-t', String(Math.max(1, Math.min(8, os.cpus().length)))];
  const [cmd, todos] = process.env.OLHO_TESTE_WHISPER_WINE ? ['wine', [exeDescritor(), ...args]] : [exeDescritor(), args];
  return new Promise((ok, falha) => {
    const p = spawn(cmd, todos, { windowsHide: true, cwd: raiz });
    descritorTrabalho.processo = p;
    const partes = []; let erro = '';
    p.stdout.on('data', (b) => partes.push(b));
    p.stderr.on('data', (b) => { erro = (erro + b).slice(-3000); });
    const limite = setTimeout(() => { try { p.kill(); } catch (_) { /* */ } }, 15 * 60 * 1000);
    p.on('error', (e) => { clearTimeout(limite); descritorTrabalho.processo = null; falha(e); });
    p.on('close', (c, sinal) => {
      clearTimeout(limite); descritorTrabalho.processo = null;
      if (sinal || c === null) return falha(new Error('CANCELADO'));
      c === 0 ? ok(Buffer.concat(partes).toString('utf8')) : falha(new Error('O descritor parou. ' + erro.split('\n').filter(Boolean).slice(-1).join(' ')));
    });
  });
}
/** Descreve uma imagem com o Gemma. Só estimativa: o texto vem limpo, sem abertura nem despedida. */
lidar('descritor:descrever', async ({ caminho, idioma, modo, contexto }) => {
  const saida = await rodarDescritor(caminho, DESC.pedidoDe(idioma, modo, contexto), modo === 'composicao' ? 650 : modo === 'quadro' ? 420 : 220);
  const texto = modo === 'quadro' || modo === 'composicao' ? DESC.semGenero(DESC.limparResposta(saida)) : DESC.limparResposta(saida);
  if (!texto) throw new Error('O modelo não escreveu nada.');
  return { texto };
});

// 3.0: a legenda do post, escrita em segundo plano pelo Gemma e guardada em legenda.txt na pasta do post.
// Sem o descritor instalado (ou se ele falhar), a pasta recebe um rascunho com o próprio texto do post, e o programa avisa.
const pedidoDeLegenda = (texto) => 'Você escreve legendas para o Instagram em português do Brasil. A imagem é um post cujo texto é: "' + String(texto).replace(/"/g, "'").slice(0, 1500) + '". ' +
  'Escreva uma legenda acolhedora e natural, que complemente o post sem repeti-lo, em um ou dois parágrafos curtos, com até 600 caracteres. Não invente fatos. No fim, no máximo cinco hashtags. ' +
  'Responda só com a legenda, sem introdução e sem despedida.';
function limparLegenda(bruto) {
  const ABERTURA = /^(com certeza|claro|certo|aqui est[aá]|segue|a seguir|sure|certainly|here is|here's)\b/i;
  const DESPEDIDA = /^(espero que|se precisar|se quiser|posso ajudar|i hope|let me know|feel free)\b/i;
  return String(bruto || '').replace(/\r/g, '').split('\n').map((l) => l.trim())
    .filter((l, i, tudo) => !(ABERTURA.test(l) && /[:：]$/.test(l)) && !DESPEDIDA.test(l) && !(l === '' && (i === 0 || tudo[i - 1] === '')))
    .join('\n').replace(/^["“«]+|["”»]+$/g, '').trim().slice(0, 2200);
}
lidar('post:legenda', async ({ pasta, textos, imagem }) => {
  const raiz = path.resolve(pastaDePosts());
  const alvo = path.resolve(String(pasta || ''));
  if (!(alvo.startsWith(raiz + path.sep)) || !fs.existsSync(alvo)) throw new Error('Pasta do post inválida.');
  const plano = (Array.isArray(textos) ? textos : [textos]).map((t) => FOTOS.semMarcasPost(t).trim()).filter(Boolean).join('\n\n');
  let corpo = '', origem = 'rascunho', motivo = '';
  if (process.env.OLHO_TESTE_LEGENDA) { corpo = process.env.OLHO_TESTE_LEGENDA; origem = 'gemma'; }
  else if (!estadoDescritor().instalado) motivo = 'O descritor de imagens não está instalado.';
  else {
    try { corpo = limparLegenda(await rodarDescritor(imagem, pedidoDeLegenda(plano), 380)); origem = corpo ? 'gemma' : 'rascunho'; if (!corpo) motivo = 'O modelo não escreveu nada.'; }
    catch (e) { corpo = ''; motivo = e.message || String(e); }
  }
  if (!corpo) corpo = plano;
  const nome = nomeLivre(alvo, 'legenda.txt');
  fs.writeFileSync(path.join(alvo, nome), corpo + '\n', 'utf8');
  return { arquivo: path.join(alvo, nome), nome, caracteres: corpo.length, origem, motivo };
});

// Só os dois endereços da licença abrem no navegador, e nada mais.
const LINKS_PERMITIDOS = ['https://creativecommons.org/licenses/by-nc-nd/4.0/deed.pt-br', 'https://joycepsi.com.br'];
lidar('externo:abrir', ({ url }) => { if (!LINKS_PERMITIDOS.includes(String(url).replace(/\/$/, ''))) throw new Error('Endereço não permitido.'); return shell.openExternal(String(url)).then(() => true); });
lidar('app:sair', () => { setTimeout(() => app.quit(), 150); return true; });

function converter(entrada, saida, duracao, qualidade) {
  const ff = procurar('ffmpeg');
  if (!ff) throw new Error('Não achei o FFmpeg, que transforma a gravação em MP4. Reinstale o Olho da Cena.');
  return new Promise((resolve, reject) => {
    const args = argumentosMp4(entrada, saida, qualidade);
    // 1.8: Configurações > Áudios gravados em mono: a mesma voz nos dois lados.
    if (lerConfig().gravados === 'mono') { const i = args.indexOf('-af'); if (i >= 0) args[i + 1] += ',pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1'; }
    const p = spawn(ff, args, { windowsHide: true });
    let erro = '';
    let ultimo = -1;
    p.stderr.on('data', (b) => {
      const s = b.toString();
      erro = (erro + s).slice(-4000);
      const t = tempoDoProgresso(s);
      if (t !== null && duracao > 0 && janela) {
        const pct = Math.min(99, Math.floor((t / duracao) * 100));
        if (pct > ultimo) { ultimo = pct; janela.webContents.send('conversao:progresso', pct); }
      }
    });
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error('O FFmpeg não conseguiu converter a gravação. ' + erro.split('\n').filter(Boolean).slice(-2).join(' ')))));
  });
}

lidar('gravacao:finalizar', async ({ id, duracao, formato, qualidade }) => {
  const g = gravacoes.get(id);
  if (!g) throw new Error('Gravação não encontrada.');
  fs.closeSync(g.fd);
  gravacoes.delete(id);
  if (!fs.statSync(g.arquivo).size) { fs.unlinkSync(g.arquivo); throw new Error('A gravação ficou vazia. Nada foi salvo.'); }
  // 1.3.1: o vídeo fica numa pasta temporária do programa até a pessoa escolher
  // Salvar e fechar ou Salvar e continuar (gravacao:guardar). Descartar e Voltar apagam o temporário.
  const pasta = pastaDoTipo('video');
  let nome = nomeDoVideo(new Date(), formato);
  for (let i = 2; fs.existsSync(path.join(pasta, nome)); i++) nome = nomeDoVideo(new Date(), formato).replace(/\.mp4$/, ` ${i}.mp4`);
  const saida = path.join(pastaTemporaria(), `provisorio-${Date.now()}.mp4`);
  try {
    await converter(g.arquivo, saida, duracao, qualidade);
  } catch (e) {
    // Não perde a gravação: guarda o WebM original na pasta de saída.
    fs.mkdirSync(pasta, { recursive: true });
    const reserva = path.join(pasta, nome.replace(/\.mp4$/, '.webm'));
    try { fs.copyFileSync(g.arquivo, reserva); fs.unlinkSync(g.arquivo); } catch (_) { /* */ }
    try { fs.unlinkSync(saida); } catch (_) { /* */ }
    throw new Error(`${e.message} A gravação original ficou guardada como ${path.basename(reserva)}, na pasta Olho da Cena.`);
  }
  fs.unlinkSync(g.arquivo);
  ultimaGravacao = saida;
  return { arquivo: saida, nome, pasta, documentos: path.basename(pastaDocumentos()), formato, qualidade, provisorio: true };
});

// --- Melhorar (borrar ou substituir o fundo) -----------------------------------------------
// O FFmpeg "decodificador" solta quadros pequenos; a tela (worker do MediaPipe) devolve uma
// máscara por quadro; o FFmpeg "compositor" junta original + máscara + fundo no MP4 final.

const melhorias = new Map();
let proximaMelhoria = 1;

function nomeLivre(pasta, nome) {
  return nomeSemRepetir(nome, (n) => fs.existsSync(path.join(pasta, n)));
}
function dataDoArquivo(arquivo) {
  try { return fs.statSync(arquivo).mtime; } catch (_) { return new Date(); }
}
lidar('melhorar:iniciar', ({ arquivo, formato, qualidade, efeito, fundo, amostra, duracao, ajuste, largura: larguraPedida, altura: alturaPedida, planos, audioArq, nomeBase, tituloNome }) => {
  // 1.8.6: gravação: os cortes do áudio entram aqui, na mesma passada do fundo, e o som vem do arquivo editado.
  const cadeia = Array.isArray(planos) && audioArq ? CAD.filtroCadeia(planos) : null;
  const ff = procurar('ffmpeg');
  if (!ff) throw new Error('Não achei o FFmpeg. Reinstale o Olho da Cena.');
  if (!fs.existsSync(arquivo)) throw new Error('Não achei o vídeo original. Ele foi movido ou apagado?');
  const ef = TX.acharPor(TX.EFEITOS, efeito);
  if (!ef) throw new Error('Efeito desconhecido.');
  const aj = AJ.normalizarAjuste(ajuste);
  const comAudio = !AJ.ajusteNeutro(aj);
  if (efeito === 'nenhum' && !comAudio) throw new Error('Nada para melhorar: escolha um efeito para a imagem ou mude o áudio.');
  let sufixo = ef.sufixo, fundoArq = null;
  if (efeito === 'substituir') {
    const fu = fundoPorValor(fundo);
    if (!fu) throw new Error('Escolha um dos fundos.');
    sufixo = fu.sufixo;
    fundoArq = arquivoDoFundo(fu.valor, formatoValido(formato) || 'horizontal');
    if (!fs.existsSync(fundoArq)) throw new Error('Não achei a imagem do fundo. Reinstale o Olho da Cena.');
  }
  // Vídeo do Editar vídeo (não gravado aqui): usa o tamanho dele (par, até 1920), e a imagem é ajustada a esse tamanho.
  const { largura, altura } = larguraPedida && alturaPedida
    ? { largura: Math.max(2, Math.round(larguraPedida / 2) * 2), altura: Math.max(2, Math.round(alturaPedida / 2) * 2) }
    : tamanhoSaida(formato, qualidade);
  const { mw, mh } = MH.tamanhoMascara(largura, altura);
  const tr = MH.trecho(duracao, amostra);
  const total = MH.quadrosDo(tr.duracao);
  // Tudo vai para a pasta Vídeos da função atual, venha o vídeo de onde vier.
  const pasta = pastaDoTipo('video');
  // 1.9.2: no Editar, o nome do arquivo original mais "editado".
  const nome = nomeLivre(pasta, nomeBase ? `${String(nomeBase).replace(/[\\/:*?"<>|]/g, '')} editado${amostra ? ' (amostra)' : ''}.mp4` : nomeDoResultado({ titulo: tituloNome, sufixo, formato, amostra }));
  const saida = path.join(pasta, nome);
  const id = proximaMelhoria++;
  const duracaoSaida = MH.duracaoFinal(tr.duracao, aj);
  const job = { id, saida, nome, pasta, total, escritos: 0, fila: [], resto: Buffer.alloc(0), fimDecod: false, esperando: null,
    erroDecod: '', erroComp: '', cancelado: false, soAudio: efeito === 'nenhum' };
  if (job.soAudio) {
    // Só o áudio: um FFmpeg só, sem segmentação; o andamento vem do tempo que o FFmpeg informa.
    job.comp = spawn(ff, MH.argumentosSoAudio({ original: arquivo, saida, inicio: tr.inicio, duracao: tr.duracao, qualidade, ajuste: aj }), { windowsHide: true });
    job.comp.stderr.on('data', (b) => {
      const txt = b.toString();
      job.erroComp = (job.erroComp + txt).slice(-4000);
      const t = tempoDoProgresso(txt);
      if (t !== null && duracaoSaida > 0) {
        const pct = Math.min(99, Math.floor((t / duracaoSaida) * 100));
        if (janela && pct > (job.ultimoPct ?? -1)) { job.ultimoPct = pct; janela.webContents.send('melhorar:progresso', pct); }
      }
    });
    job.fimComp = new Promise((resolve) => job.comp.on('close', resolve));
    job.comp.on('error', (e) => { job.erroComp += e.message; });
    melhorias.set(id, job);
    return { id, soAudio: true, total, nome, inicio: tr.inicio, duracao: tr.duracao, duracaoSaida };
  }
  const tamanhoQuadro = mw * mh * 4;
  job.decod = spawn(ff, MH.argumentosDecodificar({ original: arquivo, inicio: tr.inicio, duracao: tr.duracao, mw, mh, cadeia }), { windowsHide: true });
  job.comp = spawn(ff, MH.argumentosCompor({ original: arquivo, saida, efeito, fundoArq, largura, altura, mw, mh,
    inicio: tr.inicio, duracao: tr.duracao, qualidade, ajuste: aj, cadeia, audioArq: cadeia ? audioArq : null }), { windowsHide: true });
  const acordar = () => { if (job.esperando) { const r = job.esperando; job.esperando = null; r(); } };
  job.decod.stdout.on('data', (b) => {
    let buf = job.resto.length ? Buffer.concat([job.resto, b]) : b;
    while (buf.length >= tamanhoQuadro) { job.fila.push(Buffer.from(buf.subarray(0, tamanhoQuadro))); buf = buf.subarray(tamanhoQuadro); }
    job.resto = Buffer.from(buf);
    // Não deixa acumular quadros na memória: espera a tela pegar os que já chegaram.
    if (job.fila.length >= 8) job.decod.stdout.pause();
    acordar();
  });
  job.decod.stderr.on('data', (b) => { job.erroDecod = (job.erroDecod + b).slice(-2000); });
  job.decod.on('close', () => { job.fimDecod = true; acordar(); });
  job.decod.on('error', (e) => { job.erroDecod += e.message; job.fimDecod = true; acordar(); });
  job.comp.stderr.on('data', (b) => { job.erroComp = (job.erroComp + b).slice(-4000); });
  job.comp.stdin.on('error', () => { /* o compositor saiu antes; o erro aparece no fim */ });
  job.fimComp = new Promise((resolve) => job.comp.on('close', resolve));
  job.comp.on('error', (e) => { job.erroComp += e.message; });
  melhorias.set(id, job);
  return { id, mw, mh, total, nome, inicio: tr.inicio, duracao: tr.duracao, duracaoSaida };
});
// 1.8.2: Analisar fundo / Analisar vídeo: quadros pequenos (3 por segundo) dos 6 segundos do começo, meio e fim,
// e a imagem do fundo escolhido no mesmo tamanho. Nada é salvo.
function quadroPreto(q) {
  let soma = 0, n = 0;
  for (let i = 0; i < q.length; i += 64) { soma += q[i] + q[i + 1] + q[i + 2]; n++; }
  return soma / n / 3 < 6;
}
function quadrosCrus(ff, args, tamanho) {
  return new Promise((resolve, reject) => {
    const p = spawn(ff, args, { windowsHide: true });
    const partes = []; let erro = '';
    p.stdout.on('data', (b) => partes.push(b));
    p.stderr.on('data', (b) => { erro = (erro + b).slice(-2000); });
    p.on('error', reject);
    p.on('close', () => {
      const buf = Buffer.concat(partes), lista = [];
      for (let o = 0; o + tamanho <= buf.length; o += tamanho) lista.push(new Uint8Array(buf.subarray(o, o + tamanho)));
      if (!lista.length) return reject(new Error('Não consegui ler os quadros do vídeo. ' + erro.split('\n').filter(Boolean).slice(-1).join(' ')));
      resolve(lista);
    });
  });
}
lidar('analise:quadros', async ({ arquivo, duracao, formato, qualidade, efeito, fundo }) => {
  const ff = procurar('ffmpeg');
  if (!ff) throw new Error('Não achei o FFmpeg. Reinstale o Olho da Cena.');
  if (!fs.existsSync(arquivo)) throw new Error('Não achei o vídeo. Ele foi movido ou apagado?');
  const { largura, altura } = tamanhoSaida(formato, qualidade);
  const { mw, mh } = MH.tamanhoMascara(largura, altura);
  const t = mw * mh * 4;
  // 1.8.4: o rosto é procurado como no Alt E: quadro com até 960 pontos no lado maior (o de 384 da máscara
  // é pequeno demais para achar rosto de verdade em vídeo comprimido).
  const esc = Math.min(1, 960 / Math.max(largura, altura));
  const rw = Math.round(largura * esc / 2) * 2, rh = Math.round(altura * esc / 2) * 2;
  const janelas = [], rostos = [];
  let pretos = 0, totalQuadros = 0;
  for (const j of DG.janelasDoVideo(duracao)) {
    const ini = ['-v', 'error', '-nostdin', '-ss', String(j.inicio), '-t', String(j.duracao), '-i', arquivo, '-an', '-vf'];
    // 1.8.5: recorta no formato (como o Alt E) em vez de esticar, e pula quadros pretos (decodificação vazia).
    const caber = (a, b) => `scale=${a}:${b}:force_original_aspect_ratio=increase:flags=bicubic,crop=${a}:${b},setsar=1`;
    const pq = await quadrosCrus(ff, [...ini, `fps=3,${caber(mw, mh)},format=rgba`, '-f', 'rawvideo', 'pipe:1'], t);
    const gr = await quadrosCrus(ff, [...ini, `fps=3,${caber(rw, rh)},format=rgba`, '-f', 'rawvideo', 'pipe:1'], rw * rh * 4);
    const n = Math.min(pq.length, gr.length), bons = [];
    for (let k = 0; k < n; k++) { if (!quadroPreto(pq[k])) bons.push(k); else pretos++; }
    janelas.push(bons.map((k) => pq[k])); rostos.push(bons.map((k) => gr[k]));
    totalQuadros += n;
  }
  // 1.8.5: registro para conferir o que a análise recebeu: 3 quadros em JPG (um por trecho, no tamanho do rosto)
  // e um txt (o worker completa com quantos rostos achou). Pasta "Olho da Cena - analise" na pasta temporária do sistema.
  let pastaRegistro = null;
  try {
    pastaRegistro = path.join(os.tmpdir(), 'Olho da Cena - analise');
    fs.mkdirSync(pastaRegistro, { recursive: true });
    for (const f of fs.readdirSync(pastaRegistro)) fs.rmSync(path.join(pastaRegistro, f), { force: true });
    const ws = DG.janelasDoVideo(duracao);
    for (let k = 0; k < ws.length; k++) {
      await quadrosCrus(ff, ['-v', 'error', '-nostdin', '-y', '-ss', String(ws[k].inicio + ws[k].duracao / 2), '-i', arquivo, '-frames:v', '1',
        '-vf', `scale=${rw}:${rh}:force_original_aspect_ratio=increase,crop=${rw}:${rh}`, path.join(pastaRegistro, `quadro-${k + 1}.jpg`)], 1).catch(() => null);
    }
    const info = await new Promise((ok) => { const p = spawn(ff, ['-hide_banner', '-i', arquivo], { windowsHide: true }); let e = ''; p.stderr.on('data', (b) => { e += b; }); p.on('close', () => ok(e)); p.on('error', () => ok('')); });
    fs.writeFileSync(path.join(pastaRegistro, 'registro.txt'), [`Arquivo analisado: ${arquivo}`, `Duração: ${duracao} s, formato ${formato}, qualidade ${qualidade}, efeito ${efeito}`,
      `Quadros do rosto: ${rw}x${rh}; da máscara: ${mw}x${mh}`, `Quadros lidos: ${totalQuadros}, pretos pulados: ${pretos}`,
      'Dados do vídeo (FFmpeg):', ...info.split('\n').filter((l) => /Stream|Duration|rotate|displaymatrix/i.test(l)).map((l) => l.trim()), ''].join('\r\n'));
  } catch (_) { pastaRegistro = null; }
  let imagemFundo = null;
  if (efeito === 'substituir') {
    const fu = fundoPorValor(fundo);
    if (!fu) throw new Error('Escolha um dos fundos.');
    const fa = arquivoDoFundo(fu.valor, formatoValido(formato) || 'horizontal');
    if (!fs.existsSync(fa)) throw new Error('Não achei a imagem do fundo. Reinstale o Olho da Cena.');
    imagemFundo = (await quadrosCrus(ff, ['-v', 'error', '-nostdin', '-i', fa, '-frames:v', '1',
      '-vf', `scale=${mw}:${mh}:force_original_aspect_ratio=increase,crop=${mw}:${mh},format=rgba`, '-f', 'rawvideo', 'pipe:1'], t))[0];
  }
  return { mw, mh, janelas, imagemFundo, rw, rh, rostos, pastaRegistro };
});
lidar('analise:registro', ({ pasta, texto }) => {
  if (!pasta || path.basename(pasta) !== 'Olho da Cena - analise') return false;
  fs.appendFileSync(path.join(pasta, 'registro.txt'), String(texto || '').replace(/\n/g, '\r\n') + '\r\n');
  return true;
});
// Ouvir: 5 segundos do meio do vídeo, só o som, já com volume, equalização e velocidade.
lidar('melhorar:ouvir', ({ arquivo, duracao, ajuste }) => {
  const ff = procurar('ffmpeg');
  if (!ff) throw new Error('Não achei o FFmpeg. Reinstale o Olho da Cena.');
  if (!fs.existsSync(arquivo)) throw new Error('Não achei o vídeo original. Ele foi movido ou apagado?');
  const tr = MH.trecho(duracao, true);
  return new Promise((resolve, reject) => {
    const p = spawn(ff, MH.argumentosOuvir({ original: arquivo, inicio: tr.inicio, duracao: tr.duracao, ajuste: AJ.normalizarAjuste(ajuste) }), { windowsHide: true });
    const partes = []; let erro = '';
    p.stdout.on('data', (b) => partes.push(b));
    p.stderr.on('data', (b) => { erro = (erro + b).slice(-2000); });
    p.on('error', reject);
    p.on('close', (c) => {
      const buf = Buffer.concat(partes);
      if (c !== 0 || buf.length < 100) return reject(new Error('Não consegui preparar o áudio para ouvir. ' + erro.split('\n').filter(Boolean).slice(-1).join(' ')));
      resolve(new Uint8Array(buf.buffer, buf.byteOffset, buf.length));
    });
  });
});
lidar('melhorar:quadro', async ({ id }) => {
  const job = melhorias.get(id);
  if (!job || job.cancelado) return null;
  while (!job.fila.length && !job.fimDecod) await new Promise((r) => { job.esperando = r; });
  const q = job.fila.shift();
  if (job.fila.length < 4 && job.decod.stdout.isPaused()) job.decod.stdout.resume();
  return q ? new Uint8Array(q.buffer, q.byteOffset, q.length) : null;
});

lidar('melhorar:mascara', async ({ id, dados }) => {
  const job = melhorias.get(id);
  if (!job || job.cancelado) return false;
  const ok = job.comp.stdin.write(Buffer.from(dados));
  if (!ok && !job.cancelado) {
    await new Promise((r) => { job.comp.stdin.once('drain', r); job.comp.once('close', r); });
  }
  job.escritos++;
  const pct = Math.min(99, Math.floor((job.escritos / job.total) * 100));
  if (janela && pct !== job.ultimoPct) { job.ultimoPct = pct; janela.webContents.send('melhorar:progresso', pct); }
  return true;
});

function encerrarMelhoria(job) {
  // SIGKILL: o FFmpeg, com SIGTERM, às vezes fica esperando a entrada; o arquivo parcial é apagado mesmo.
  try { if (job.decod) job.decod.kill('SIGKILL'); } catch (_) { /* */ }
  try { job.comp.kill('SIGKILL'); } catch (_) { /* */ }
  job.fimDecod = true;
  if (job.esperando) { const r = job.esperando; job.esperando = null; r(); }
}

// 1.1: título e/ou logo nos 3 primeiros segundos do vídeo melhorado
// (o mesmo desenho da Abertura do Editar vídeo). Só imagem: o som é copiado.
function aplicarAbertura(arquivo, abertura) {
  const ff = procurar('ffmpeg');
  if (!ff) throw new Error('Não achei o FFmpeg. Reinstale o Olho da Cena.');
  const erros = ABERT.validarAbertura(abertura);
  if (erros.length) throw new Error(erros.join(' '));
  const temp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'abertura-'));
  return new Promise((resolve, reject) => {
    const sonda = spawn(ff, ['-hide_banner', '-i', arquivo], { windowsHide: true });
    let txt = '';
    sonda.stderr.on('data', (b) => { txt += b; });
    sonda.on('close', () => {
      const m = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(txt);
      if (!m) return reject(new Error('Não consegui ler o tamanho do vídeo para pôr o título e o logo.'));
      const plano = ABERT.planejarAbertura({ largura: +m[1], altura: +m[2], titulo: abertura.titulo, logo: abertura.logo });
      const arquivosLinhas = (plano.titulo ? plano.titulo.linhas : []).map((linha, i) => {
        const a = path.join(temp, `linha_${i}.txt`); fs.writeFileSync(a, linha, 'utf8'); return a;
      });
      const fonte = resolverFonte(ABERT.FONTES);
      if (plano.titulo && !fonte) return reject(new Error('Não encontrei uma fonte para escrever o título.'));
      const extras = ABERT.entradasAbertura(plano, abertura.logo);
      const f = ABERT.filtroAbertura({ plano, rotuloV: '[0:v]', entradaLogo: extras.length ? '[1:v]' : null, logo: abertura.logo, fonte, arquivosLinhas });
      const saida = path.join(temp, 'com-abertura.mp4');
      const args = ['-y', '-i', arquivo, ...extras, '-filter_complex', f.partes.join(';'), '-map', f.rotulo, '-map', '0:a?',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', saida];
      const p = spawn(ff, args, { windowsHide: true });
      let erro = '';
      p.stderr.on('data', (b) => { erro = (erro + b).slice(-2000); });
      p.on('close', (c) => {
        try {
          if (c !== 0 || !fs.existsSync(saida)) throw new Error('Não consegui pôr o título e o logo. ' + erro.split('\n').filter(Boolean).slice(-1).join(''));
          fs.copyFileSync(saida, arquivo);
          resolve();
        } catch (e) { reject(e); } finally { try { fs.rmSync(temp, { recursive: true, force: true }); } catch (_) { /* */ } }
      });
    });
  });
}

lidar('melhorar:concluir', async ({ id, abertura, legenda, saida: formatoSaida }) => {
  const job = melhorias.get(id);
  if (!job) throw new Error('Processamento não encontrado.');
  if (!job.soAudio) job.comp.stdin.end();
  const codigo = await job.fimComp;
  melhorias.delete(id);
  if (codigo !== 0 || !fs.existsSync(job.saida)) {
    try { fs.unlinkSync(job.saida); } catch (_) { /* */ }
    throw new Error('O FFmpeg não conseguiu montar o vídeo. ' + (job.erroComp + ' ' + job.erroDecod).split('\n').filter(Boolean).slice(-2).join(' '));
  }
  await converterSaida(job.saida, formatoSaida); // 1.9.2: Editar vídeo, orientação e qualidade
  if (ABERT.temAbertura(abertura)) await aplicarAbertura(job.saida, abertura);
  const comLegenda = await queimarLegenda(job.saida, legenda); // 1.9
  return { arquivo: job.saida, nome: job.nome, pasta: job.pasta, documentos: path.basename(pastaDocumentos()), comLegenda };
});

// 1.8.6: vídeo final da gravação sem fundo: a imagem original com os cortes do áudio (uma passada) e o som editado.
// Sem cortes nem velocidade, a imagem é só copiada.
function planosComVel(planos, ajuste) {
  const v = AJ.filtroVelocidadeVideo(ajuste ? AJ.normalizarAjuste(ajuste) : null);
  return v ? [...planos, { cortes: false, velocidade: v }] : planos;
}
function videoDaCadeia({ original, planos, audio, saida }) {
  const ff = procurar('ffmpeg');
  const copiar = !CAD.temCortes(planos);
  const args = ['-y', '-hide_banner', '-nostdin', '-i', original, '-i', audio,
    ...(copiar ? ['-map', '0:v:0', '-c:v', 'copy'] : ['-filter_complex', CAD.filtroCadeia(planos), '-map', '[vc]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p']),
    '-map', '1:a:0?', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', saida];
  return new Promise((resolve, reject) => {
    const p = spawn(ff, args, { windowsHide: true });
    let erro = '';
    p.stderr.on('data', (b) => { erro = (erro + b).slice(-4000); });
    p.on('error', reject);
    p.on('close', (c) => (c === 0 && fs.existsSync(saida) ? resolve() : reject(new Error('O FFmpeg não conseguiu montar o vídeo. ' + erro.split('\n').filter(Boolean).slice(-1).join(' ')))));
  });
}
// 1.3.1: Fundo original (só no caminho da gravação): o vídeo já cortado vira o final, com título e logo se houver.
lidar('melhorar:semFundo', async ({ arquivo, formato, abertura, original, planos, legenda, saida: formatoSaida, nomeBase }) => {
  if (!fs.existsSync(arquivo)) throw new Error('Não achei o vídeo com os cortes. Ele foi movido ou apagado?');
  const pasta = pastaDoTipo('video');
  const nome = nomeLivre(pasta, nomeBase ? `${String(nomeBase).replace(/[\\/:*?"<>|]/g, '')} editado.mp4` : nomeDoResultado({ titulo: abertura && abertura.titulo, sufixo: null, formato }));
  const saida = path.join(pasta, nome);
  if (original && Array.isArray(planos)) await videoDaCadeia({ original, planos, audio: arquivo, saida });
  else fs.copyFileSync(arquivo, saida);
  try {
    await converterSaida(saida, formatoSaida); // 1.9.2
    if (ABERT.temAbertura(abertura)) await aplicarAbertura(saida, abertura);
  } catch (e) { try { fs.unlinkSync(saida); } catch (_) { /* */ } throw e; }
  const comLegenda = await queimarLegenda(saida, legenda); // 1.9
  return { arquivo: saida, nome, pasta, documentos: path.basename(pastaDocumentos()), comLegenda };
});

lidar('melhorar:cancelar', async ({ id }) => {
  const job = melhorias.get(id);
  if (!job) return false;
  job.cancelado = true;
  encerrarMelhoria(job);
  await job.fimComp;
  melhorias.delete(id);
  try { fs.unlinkSync(job.saida); } catch (_) { /* */ }
  return true;
});

app.on('before-quit', () => { for (const job of melhorias.values()) { encerrarMelhoria(job); try { fs.unlinkSync(job.saida); } catch (_) { /* */ } } });

lidar('pasta:abrir', async (p) => {
  const alvo = p || pastaSaida();
  fs.mkdirSync(alvo, { recursive: true });
  const erro = await shell.openPath(alvo);
  if (erro) throw new Error(erro);
  return true;
});

// --- IPC ---------------------------------------------------------------------

ipcMain.handle('presets:listar', (_e, contexto) => listPresets(contexto));

ipcMain.handle('formatos:listar', () => listarFormatos());

ipcMain.handle('qualidades:listar', () => listarQualidades());

ipcMain.handle('ffmpeg:verificar', () => verificarFFmpeg());

ipcMain.handle('titulos:limites', () => LIMITES);

ipcMain.handle('titulos:lerTempo', (_e, texto) => lerTempo(texto));

ipcMain.handle('titulos:escreverTempo', (_e, seg) => escreverTempo(seg));

ipcMain.handle('titulos:conferir', (_e, dados) => {
  try {
    const r = validarTitulos({
      titulos: (dados.titulos || []).map((t) => ({
        texto: t.texto,
        // A tela manda o instante em `tempo` (o título do começo vai com 0).
        tempo: t.tempo !== undefined ? t.tempo : t.segundos,
        trocarPreset: t.trocarPreset
      })),
      fim: dados.fim,
      duracaoAudio: dados.duracaoAudio || 0,
      formatoId: dados.formatoId,
      preset: getPreset(dados.presetId)
    });
    return { erros: r.erros, avisos: r.avisos };
  } catch (e) {
    return { erros: [e.message], avisos: [] };
  }
});

ipcMain.handle('escolher:audio', async () => {
  const r = await dialog.showOpenDialog(janela, {
    title: 'Escolha o áudio',
    properties: ['openFile'],
    filters: [
      { name: 'Áudio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus'] },
      { name: 'Todos os arquivos', extensions: ['*'] }
    ]
  });
  if (r.canceled || !r.filePaths.length) return null;

  const caminho = r.filePaths[0];
  try {
    const duracao = await duracaoDoAudio(caminho);
    return { caminho, url: urlDoArquivo(caminho), duracao };
  } catch (e) {
    return { caminho, duracao: null, erro: e.message };
  }
});

ipcMain.handle('escolher:srt', async () => {
  const r = await dialog.showOpenDialog(janela, {
    title: 'Escolha o arquivo de legenda',
    properties: ['openFile'],
    filters: [
      { name: 'Legenda', extensions: ['srt', 'vtt', 'ass'] },
      { name: 'Todos os arquivos', extensions: ['*'] }
    ]
  });
  if (r.canceled || !r.filePaths.length) return null;
  return r.filePaths[0];
});

// Uma imagem por vez: usado ao marcar imagens ouvindo o áudio, no modo manual.
ipcMain.handle('escolher:imagem-unica', async () => {
  const r = await dialog.showOpenDialog(janela, {
    title: 'Escolha a imagem para este ponto',
    properties: ['openFile'],
    filters: [
      { name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tif', 'tiff'] },
      { name: 'Todos os arquivos', extensions: ['*'] }
    ]
  });
  if (r.canceled || !r.filePaths.length) return null;
  return r.filePaths[0];
});

ipcMain.handle('escolher:imagens', async () => {
  const r = await dialog.showOpenDialog(janela, {
    title: 'Escolha as imagens',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tif', 'tiff'] },
      { name: 'Todos os arquivos', extensions: ['*'] }
    ]
  });
  if (r.canceled) return [];
  return r.filePaths;
});

ipcMain.handle('escolher:logo', async () => {
  const r = await dialog.showOpenDialog(janela, {
    title: 'Escolha a imagem do logo',
    properties: ['openFile'],
    filters: [
      { name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] },
      { name: 'Todos os arquivos', extensions: ['*'] }
    ]
  });
  if (r.canceled || !r.filePaths.length) return null;
  const caminho = r.filePaths[0];
  try {
    return { ok: true, caminho, ...(await infoLogo(caminho)) };
  } catch (e) {
    return { ok: false, caminho, erro: e.message };
  }
});

ipcMain.handle('escolher:saida', async (_e, sugestao) => {
  const r = await dialog.showSaveDialog(janela, {
    title: 'Salvar o vídeo como',
    defaultPath: naPastaDoPrograma(sugestao || 'video.mp4'),
    filters: [{ name: 'Vídeo MP4', extensions: ['mp4'] }]
  });
  if (r.canceled || !r.filePath) return null;
  return r.filePath;
});

// Janela de "Salvar como" genérica: vídeo (MP4) ou áudio (MP3 ou WAV). Se a
// pessoa digitar o nome sem extensão, a do primeiro tipo da lista é posta.
ipcMain.handle('escolher:salvar-como', async (_e, opcoes) => {
  const o = opcoes || {};
  const audio = o.tipo === 'audio';
  const filtros = audio
    ? [{ name: 'Áudio MP3', extensions: ['mp3'] }, { name: 'Áudio WAV', extensions: ['wav'] }]
    : [{ name: 'Vídeo MP4', extensions: ['mp4'] }];
  const r = await dialog.showSaveDialog(janela, {
    title: o.titulo || (audio ? 'Salvar o áudio como' : 'Salvar o vídeo como'),
    defaultPath: naPastaDoPrograma(o.sugestao || (audio ? 'audio.mp3' : 'video.mp4')),
    filters: filtros
  });
  if (r.canceled || !r.filePath) return null;
  let destino = r.filePath;
  const ext = path.extname(destino).toLowerCase();
  const aceitas = audio ? ['.mp3', '.wav'] : ['.mp4'];
  if (!aceitas.includes(ext)) destino += aceitas[0];
  return destino;
});

ipcMain.handle('trecho:salvar', async (evento, config) => {
  try {
    const r = await salvarTrecho(config, (p) => evento.sender.send('render:progresso', p));
    return r;
  } catch (e) {
    if (e.message === 'CANCELADO') return { ok: false, cancelado: true };
    return { ok: false, erro: e.message };
  }
});

// Roda por fora da fila principal: pode acontecer ao mesmo tempo que um corte.
ipcMain.handle('audio:exportar', async (_e, config) => {
  try {
    return await exportarAudio(config);
  } catch (e) {
    return { ok: false, erro: e.message };
  }
});

ipcMain.handle('render:iniciar', async (evento, config) => {
  try {
    const resultado = await renderizar(config, (p) => {
      evento.sender.send('render:progresso', p);
    });
    return resultado;
  } catch (e) {
    if (e.message === 'CANCELADO') return { ok: false, cancelado: true };
    return { ok: false, erro: e.message };
  }
});

ipcMain.handle('escolher:videos', async () => {
  const r = await dialog.showOpenDialog(janela, {
    title: 'Escolha os vídeos',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Vídeos', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', '3gp'] },
      { name: 'Todos os arquivos', extensions: ['*'] }
    ]
  });
  if (r.canceled) return [];
  return r.filePaths;
});

ipcMain.handle('videos:analisar', async (_e, dados) => {
  try {
    const r = await analisarLista(dados.caminhos, dados.formatoId, exigir);
    return {
      relatorio: r.relatorio,
      erros: r.erros,
      duracaoTotal: r.duracaoTotal
    };
  } catch (e) {
    return { relatorio: [], erros: [], duracaoTotal: 0, erro: e.message };
  }
});

// --- Cortar ------------------------------------------------------------------

ipcMain.handle('escolher:video', async (_e, titulo) => {
  const r = await dialog.showOpenDialog(janela, {
    title: typeof titulo === 'string' && titulo ? titulo : 'Escolha o vídeo para cortar',
    properties: ['openFile'],
    filters: [
      { name: 'Vídeos', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', '3gp'] },
      { name: 'Todos os arquivos', extensions: ['*'] }
    ]
  });
  if (r.canceled || !r.filePaths.length) return null;

  const caminho = r.filePaths[0];
  try {
    const info = await analisarVideo(caminho, exigir);
    if (!info.valido) return { caminho, erro: `O arquivo ${info.motivo}.` };
    return {
      caminho,
      url: urlDoArquivo(caminho),
      duracao: info.duracao,
      temAudio: info.temAudio,
      largura: info.largura,
      altura: info.altura
    };
  } catch (e) {
    return { caminho, erro: e.message };
  }
});

// Conta rápida, sem ler o arquivo de novo: a duração já é conhecida.
ipcMain.handle('cortar:planejar', (_e, dados) => {
  const r = planejarCortes(dados.descartes, dados.duracao);
  return {
    erros: r.erros,
    avisos: r.avisos,
    duracaoFinal: r.duracaoFinal,
    trechos: r.mantidos.length
  };
});

ipcMain.handle('cortar:iniciar', async (evento, config) => {
  try {
    const r = await cortarVideo(config, (p) => evento.sender.send('render:progresso', p));
    return { ...r, url: urlDoArquivo(r.saida) };
  } catch (e) {
    if (e.message === 'CANCELADO') return { ok: false, cancelado: true };
    return { ok: false, erro: e.message };
  }
});

// Ouvir o ajuste do áudio (Editar vídeo): 6 segundos a partir do ponto atual.
ipcMain.handle('ajuste:ouvir', async (_e, { entrada, inicio, ajuste }) => {
  try {
    const saida = path.join(os.tmpdir(), `olho_ouvir_ajuste_${Date.now()}.wav`);
    const r = await ouvirAjuste({ entrada, inicio, ajuste, saida });
    return { ok: true, url: urlDoArquivo(saida), inicio: r.inicio, duracao: r.duracao };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
});

// Abre um vídeo já conhecido (a gravação, ou o vídeo melhorado) no Editar vídeo, sem janela de escolha.
ipcMain.handle('video:abrir-caminho', async (_e, caminho) => {
  try {
    const info = await analisarVideo(caminho, exigir);
    if (!info.valido) return { caminho, erro: `O arquivo ${info.motivo}.` };
    return { caminho, url: urlDoArquivo(caminho), duracao: info.duracao, temAudio: info.temAudio, largura: info.largura, altura: info.altura };
  } catch (e) {
    return { caminho, erro: e.message };
  }
});

// --- Dividir -----------------------------------------------------------------

ipcMain.handle('dividir:planejar', async (_e, dados) => {
  const tamanho = lerTamanho(dados.tamanho);
  try {
    return await conferirDivisao({ entrada: dados.entrada, tamanho });
  } catch (e) {
    return { erros: [e.message], avisos: [], partes: [] };
  }
});

ipcMain.handle('dividir:iniciar', async (evento, config) => {
  const tamanho = lerTamanho(config.tamanho);
  try {
    const orientacao = config.orientacao === 'horizontal' ? 'horizontal' : 'vertical';
    const r = await dividirVideo({ entrada: config.entrada, tamanho, orientacao, pastaBase: pastaDoTipo('video') }, (p) => evento.sender.send('render:progresso', p));
    return r;
  } catch (e) {
    if (e.message === 'CANCELADO') return { ok: false, cancelado: true, partesProntas: e.partesProntas || 0 };
    return { ok: false, erro: e.message };
  }
});

ipcMain.handle('juntar:iniciar', async (evento, config) => {
  try {
    return await juntarVideos(config, (p) => evento.sender.send('render:progresso', p));
  } catch (e) {
    if (e.message === 'CANCELADO') return { ok: false, cancelado: true };
    return { ok: false, erro: e.message };
  }
});

ipcMain.handle('previa:mixagem', async (_e, config) => {
  try {
    const r = await gerarPreviaMixagem(config);
    return { ok: true, url: urlDoArquivo(r.caminho), inicio: r.inicio, duracaoJanela: r.duracaoJanela };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
});

ipcMain.handle('silencio:detectar', async (_e, { entrada, limiarDb, duracaoMinima, margem }) => {
  try {
    const silencios = await detectarSilencios(entrada, { limiarDb, duracaoMinima, margem });
    return { ok: true, silencios };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
});

ipcMain.handle('audio:cortar', async (_e, { entrada, descartes, fade }) => {
  try {
    const saida = path.join(os.tmpdir(), `gv_audio_sem_silencio_${Date.now()}.wav`);
    const r = await cortarAudio({ entrada, descartes, saida, fade });
    return {
      ok: true,
      caminho: r.saida,
      url: urlDoArquivo(r.saida),
      duracao: r.duracao,
      mantidos: r.mantidos,
      fades: r.fades
    };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
});

ipcMain.handle('audio:montar', async (_e, { itens }) => {
  try {
    const saida = path.join(os.tmpdir(), `gv_audio_montado_${Date.now()}.wav`);
    const r = await montarAudio({ itens, saida, mono: lerConfig().importados === 'mono' });
    return { ok: true, caminho: r.saida, url: urlDoArquivo(r.saida), duracao: r.duracao };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
});

ipcMain.handle('audio:previa-velocidade', async (_e, { entrada, velocidade }) => {
  try {
    const saida = path.join(os.tmpdir(), `gv_previa_velocidade_${Date.now()}.wav`);
    await previaVelocidade({ entrada, velocidade, saida });
    return { ok: true, url: urlDoArquivo(saida) };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
});

ipcMain.handle('imagens:analisar-compatibilidade', async (_e, { caminhos, formatoId }) => {
  try {
    const resultados = await analisarImagens(caminhos, formatoId);
    return { ok: true, resultados };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
});

ipcMain.handle('render:cancelar', () => {
  cancelar();
  return true;
});

ipcMain.handle('abrir:pasta', (_e, caminho) => {
  shell.showItemInFolder(caminho);
  return true;
});
