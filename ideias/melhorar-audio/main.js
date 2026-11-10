'use strict';
/* Gravador de Vídeo (teste): grava vídeos e shorts simples com câmera e microfone.
   Processo principal: janela, configurações, arquivos da gravação e conversão para MP4. */

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, protocol } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { procurar } = require('./src/ffmpeg-path');
const { argumentosMp4, tempoDoProgresso, qualidadeValida } = require('./src/conversao');
const { nomeDoVideo, nomeMelhorado3, nomeSemRepetir } = require('./src/tempo');
const AJ = require('./src/ajuste');
const { formatoValido, tamanhoSaida } = require('./src/recorte');
const MH = require('./src/melhorar');
const TX = require('./src/textos');

app.setName('Gravador de Vídeo (teste)');
// O som da gravação passa pelo Web Audio, e os bipes também; nada disso pode esperar um clique.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const T = process.env;
if (T.GRAVADOR_TESTE_DADOS) {
  app.setPath('userData', T.GRAVADOR_TESTE_DADOS);
  // Testes automáticos: câmera e microfone falsos, sem pedir permissão.
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
  if (T.GRAVADOR_TESTE_VIDEO) app.commandLine.appendSwitch('use-file-for-fake-video-capture', T.GRAVADOR_TESTE_VIDEO);
  if (T.GRAVADOR_TESTE_MIC) app.commandLine.appendSwitch('use-file-for-fake-audio-capture', T.GRAVADOR_TESTE_MIC);
}

// As telas e os arquivos da detecção (wasm e modelos) são servidos por app://gravador/,
// que funciona sem internet e permite carregar o WebAssembly (o file:// não permite).
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

let janela = null;
module.exports = { janela: () => janela };

const pastaVisao = () => (app.isPackaged ? path.join(process.resourcesPath, 'visao') : path.join(__dirname, 'vendor', 'visao'));
const pastaFundos = () => (app.isPackaged ? path.join(process.resourcesPath, 'fundos') : path.join(__dirname, 'vendor', 'fundos'));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.tflite': 'application/octet-stream', '.task': 'application/octet-stream', '.json': 'application/json' };

function servir(req) {
  const u = new URL(req.url);
  const partes = decodeURIComponent(u.pathname).split('/').filter(Boolean);
  if (partes.some((p) => p === '..')) return new Response('proibido', { status: 403 });
  const [raiz, ...resto] = partes;
  const base = raiz === 'visao' ? pastaVisao() : raiz === 'ui' ? path.join(__dirname, 'ui') : raiz === 'src' ? path.join(__dirname, 'src') : null;
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

// --- Configurações -------------------------------------------------------------

// Proporção e qualidade começam sem escolha: a primeira gravação pede as duas.
// espelhada: o Alt E trata a imagem como espelho (na câmera da Joyce os lados saíam trocados na 0.2).
const PADRAO = { formato: '', qualidade: '', camera: '', microfone: '', legenda: false, texto: '', espelhada: true };
const arqConfig = () => path.join(app.getPath('userData'), 'configuracoes.json');
function lerConfig() {
  try { return { ...PADRAO, ...JSON.parse(fs.readFileSync(arqConfig(), 'utf8')) }; } catch (_) { return { ...PADRAO }; }
}
function salvarConfig(c) {
  const nova = { ...lerConfig(), ...c };
  nova.formato = formatoValido(nova.formato) || '';
  nova.qualidade = qualidadeValida(nova.qualidade) || '';
  nova.legenda = nova.legenda === true;
  nova.espelhada = nova.espelhada !== false;
  fs.mkdirSync(path.dirname(arqConfig()), { recursive: true });
  fs.writeFileSync(arqConfig(), JSON.stringify(nova, null, 1));
  return nova;
}

// --- Janela --------------------------------------------------------------------

function criarJanela() {
  janela = new BrowserWindow({
    width: 1000, height: 820, title: 'Gravador de Vídeo (teste)',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false,
      spellcheck: false, backgroundThrottling: false }
  });
  // Sem menu: o menu do Electron, mesmo escondido, engoliria Alt R, Alt T e Alt E.
  janela.removeMenu();
  const ses = janela.webContents.session;
  ses.setPermissionRequestHandler((_wc, permissao, ok) => ok(permissao === 'media'));
  ses.setPermissionCheckHandler((_wc, permissao) => permissao === 'media');
  janela.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  janela.webContents.on('will-navigate', (e) => e.preventDefault());
  janela.loadURL('app://gravador/ui/index.html');
}

app.whenReady().then(() => {
  // O nome com acento entra no User-Agent e quebra o protocolo app:// (cabeçalho só aceita ASCII).
  app.userAgentFallback = app.userAgentFallback.normalize('NFD').replace(/[^\x20-\x7e]/g, '');
  protocol.handle('app', servir);
  Menu.setApplicationMenu(null);
  criarJanela();
});
app.on('window-all-closed', () => app.quit());

// --- Ajudantes -----------------------------------------------------------------

const resposta = (fn) => async (...a) => {
  try { return { ok: true, valor: await fn(...a) }; } catch (e) { return { ok: false, erro: e.message || String(e) }; }
};
const lidar = (canal, fn) => ipcMain.handle(canal, (_e, d) => resposta(fn)(d));

const pastaDocumentos = () => T.GRAVADOR_TESTE_DOCUMENTOS || app.getPath('documents');
const pastaSaida = () => path.join(pastaDocumentos(), 'Gravador de Vídeo');
const pastaTemporaria = () => path.join(app.getPath('userData'), 'gravando');

lidar('config:ler', () => lerConfig());
lidar('config:salvar', (c) => salvarConfig(c));
lidar('app:versao', () => app.getVersion());

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
  const r = T.GRAVADOR_TESTE_TEXTO ? { canceled: false, filePaths: [T.GRAVADOR_TESTE_TEXTO] } : await dialog.showOpenDialog(janela, {
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

function converter(entrada, saida, duracao, qualidade) {
  const ff = procurar('ffmpeg');
  if (!ff) throw new Error('Não achei o FFmpeg, que transforma a gravação em MP4. Reinstale o Gravador de Vídeo.');
  return new Promise((resolve, reject) => {
    const p = spawn(ff, argumentosMp4(entrada, saida, qualidade), { windowsHide: true });
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
  const pasta = pastaSaida();
  fs.mkdirSync(pasta, { recursive: true });
  let nome = nomeDoVideo(new Date(), formato);
  for (let i = 2; fs.existsSync(path.join(pasta, nome)); i++) nome = nomeDoVideo(new Date(), formato).replace(/\.mp4$/, ` ${i}.mp4`);
  const saida = path.join(pasta, nome);
  try {
    await converter(g.arquivo, saida, duracao, qualidade);
  } catch (e) {
    // Não perde a gravação: guarda o WebM original na pasta de saída.
    const reserva = saida.replace(/\.mp4$/, '.webm');
    try { fs.copyFileSync(g.arquivo, reserva); fs.unlinkSync(g.arquivo); } catch (_) { /* */ }
    try { fs.unlinkSync(saida); } catch (_) { /* */ }
    throw new Error(`${e.message} A gravação original ficou guardada como ${path.basename(reserva)}, na mesma pasta.`);
  }
  fs.unlinkSync(g.arquivo);
  return { arquivo: saida, nome, pasta, documentos: path.basename(pastaDocumentos()), formato, qualidade };
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
lidar('melhorar:iniciar', ({ arquivo, formato, qualidade, efeito, fundo, amostra, duracao, ajuste }) => {
  const ff = procurar('ffmpeg');
  if (!ff) throw new Error('Não achei o FFmpeg. Reinstale o Gravador de Vídeo.');
  if (!fs.existsSync(arquivo)) throw new Error('Não achei o vídeo original. Ele foi movido ou apagado?');
  const ef = TX.acharPor(TX.EFEITOS, efeito);
  if (!ef) throw new Error('Efeito desconhecido.');
  const aj = AJ.normalizarAjuste(ajuste);
  const comAudio = !AJ.ajusteNeutro(aj);
  if (efeito === 'nenhum' && !comAudio) throw new Error('Nada para melhorar: escolha um efeito para a imagem ou mude o áudio.');
  let sufixo = ef.sufixo, fundoArq = null;
  if (efeito === 'substituir') {
    const fu = TX.acharPor(TX.FUNDOS, fundo);
    if (!fu) throw new Error('Escolha um dos fundos.');
    sufixo = fu.sufixo;
    fundoArq = path.join(pastaFundos(), `${fu.valor}-${formatoValido(formato) || 'horizontal'}.jpg`);
    if (!fs.existsSync(fundoArq)) throw new Error('Não achei a imagem do fundo. Reinstale o Gravador de Vídeo.');
  }
  const { largura, altura } = tamanhoSaida(formato, qualidade);
  const { mw, mh } = MH.tamanhoMascara(largura, altura);
  const tr = MH.trecho(duracao, amostra);
  const total = MH.quadrosDo(tr.duracao);
  const pasta = path.dirname(arquivo);
  const nome = nomeLivre(pasta, nomeMelhorado3({ data: dataDoArquivo(arquivo), formato, quadros: 30, sufixo, audio: comAudio, amostra }));
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
  job.decod = spawn(ff, MH.argumentosDecodificar({ original: arquivo, inicio: tr.inicio, duracao: tr.duracao, mw, mh }), { windowsHide: true });
  job.comp = spawn(ff, MH.argumentosCompor({ original: arquivo, saida, efeito, fundoArq, largura, altura, mw, mh,
    inicio: tr.inicio, duracao: tr.duracao, qualidade, ajuste: aj }), { windowsHide: true });
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
// Ouvir: 5 segundos do meio do vídeo, só o som, já com volume, equalização e velocidade.
lidar('melhorar:ouvir', ({ arquivo, duracao, ajuste }) => {
  const ff = procurar('ffmpeg');
  if (!ff) throw new Error('Não achei o FFmpeg. Reinstale o Gravador de Vídeo.');
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

lidar('melhorar:concluir', async ({ id }) => {
  const job = melhorias.get(id);
  if (!job) throw new Error('Processamento não encontrado.');
  if (!job.soAudio) job.comp.stdin.end();
  const codigo = await job.fimComp;
  melhorias.delete(id);
  if (codigo !== 0 || !fs.existsSync(job.saida)) {
    try { fs.unlinkSync(job.saida); } catch (_) { /* */ }
    throw new Error('O FFmpeg não conseguiu montar o vídeo. ' + (job.erroComp + ' ' + job.erroDecod).split('\n').filter(Boolean).slice(-2).join(' '));
  }
  return { arquivo: job.saida, nome: job.nome, pasta: job.pasta, documentos: path.basename(pastaDocumentos()) };
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
