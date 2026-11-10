/* Gravador de Vídeo (teste) 0.3: proporção e qualidade, câmera e microfone, leitura sombreada,
   legenda opcional no vídeo, Alt R grava e para, Alt T pausa (com bipes só para quem grava),
   Alt E fala o enquadramento e os objetos na imagem (antes e durante), e depois da gravação:
   Salvar e finalizar, ou Melhorar (borrar ou substituir o fundo, e melhorar o áudio). */

const $ = (id) => document.getElementById(id);
const PU = window.api.puro;
const st = {
  config: null, cameraStream: null, micStream: null, frases: [], atual: 0,
  gravador: null, gravId: null, cadeia: Promise.resolve(), erroGravar: null, pausado: false,
  inicioTrecho: 0, acumulado: 0, salvando: false, analisando: false, visao: null,
  anuncios: [], ultimoEnquadramento: null, ultimoSalvo: null, legendaCache: null,
  audioCtx: null, fonteAudio: null, ganho: null, destino: null, bipes: [], ajuste: null, ouvindo: null,
  original: null, melhoria: null, ultimaMelhoria: null
};
window.__gravador = st; // usado só pelos testes automáticos

// --- Fala para o leitor de tela --------------------------------------------------

let alternar = false;
let falaAdiada = null;
/** Fala daqui a pouco (depois de o foco mudar), a menos que outra fala venha antes. */
function falarDepois(msg, ms) {
  clearTimeout(falaAdiada);
  falaAdiada = setTimeout(() => falar(msg), ms);
}
function falar(msg) {
  clearTimeout(falaAdiada);
  alternar = !alternar; // repetir a mesma frase também precisa ser anunciado
  $('status').textContent = msg ? msg + (alternar ? '\u00a0' : '') : '';
  if (msg) st.anuncios.push(msg);
}
function alertar(msg) {
  $('alerta').textContent = '';
  st.anuncios.push('ALERTA: ' + msg);
  setTimeout(() => { $('alerta').textContent = msg; }, 30);
}
async function chamar(nome, dados) {
  const r = await window.api[nome](dados);
  if (!r.ok) throw new Error(r.erro);
  return r.valor;
}
const salvarConfig = (c) => chamar('configSalvar', c).then((n) => { st.config = n; }).catch(() => {});
const gravando = () => !!st.gravador && st.gravador.state !== 'inactive';

// --- Escolhas em grupos de opções (cada opção com a descrição de uso) ---------------------

function montarGrupo(idGrupo, nome, opcoes, escolhido, aoMudar) {
  const g = $(idGrupo);
  for (const o of opcoes) {
    const d = document.createElement('div');
    d.className = 'radio';
    const inp = document.createElement('input');
    inp.type = 'radio'; inp.name = nome; inp.value = o.valor; inp.id = `${nome}-${o.valor}`;
    inp.setAttribute('aria-describedby', `${inp.id}-desc`);
    inp.checked = o.valor === escolhido;
    const lab = document.createElement('label');
    lab.htmlFor = inp.id; lab.textContent = o.nome;
    const desc = document.createElement('p');
    desc.className = 'desc'; desc.id = `${inp.id}-desc`; desc.textContent = o.descricao;
    inp.addEventListener('change', () => { if (inp.checked) aoMudar(o.valor); });
    d.append(inp, lab, desc);
    g.appendChild(d);
  }
}
const valorDe = (nome) => { const r = document.querySelector(`input[name="${nome}"]:checked`); return r ? r.value : ''; };
function focarGrupo(nome) {
  const r = document.querySelector(`input[name="${nome}"]:checked`) || document.querySelector(`input[name="${nome}"]`);
  if (r) r.focus();
}
function travarGrupo(nome, travado) { document.querySelectorAll(`input[name="${nome}"]`).forEach((r) => { r.disabled = travado; }); }
const formato = () => valorDe('formato') || 'horizontal';
const qualidade = () => valorDe('qualidade');

// --- Câmera e microfone -----------------------------------------------------------

const AUDIO = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

function preencher(sel, itens, escolhido, vazio) {
  sel.textContent = '';
  if (!itens.length) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = vazio;
    sel.appendChild(o);
    return;
  }
  for (const [valor, rotulo] of itens) {
    const o = document.createElement('option');
    o.value = valor; o.textContent = rotulo;
    sel.appendChild(o);
  }
  sel.value = itens.some(([v]) => v === escolhido) ? escolhido : itens[0][0];
}

async function listarDispositivos() {
  const devs = await navigator.mediaDevices.enumerateDevices();
  const cams = devs.filter((d) => d.kind === 'videoinput').map((d, i) => [d.deviceId, d.label || `Câmera ${i + 1}`]);
  const mics = devs.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications')
    .map((d, i) => [d.deviceId, d.label || `Microfone ${i + 1}`]);
  preencher($('camera'), cams, st.config.camera, 'Nenhuma câmera encontrada');
  preencher($('microfone'), mics.length ? [['', 'Padrão do Windows'], ...mics] : [], st.config.microfone, 'Nenhum microfone encontrado');
  return { cams: cams.length, mics: mics.length };
}

function pararFluxo(f) { if (f) f.getTracks().forEach((t) => t.stop()); }

async function abrirCamera() {
  pararFluxo(st.cameraStream);
  st.cameraStream = null;
  const id = $('camera').value;
  if (!id) return false;
  const v = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };
  try {
    st.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { ...v, deviceId: { exact: id } } });
  } catch (_) {
    try { st.cameraStream = await navigator.mediaDevices.getUserMedia({ video: v }); } catch (e) {
      alertar('Não consegui abrir a câmera. Confira se ela está ligada, liberada no Windows e fechada em outros programas.');
      return false;
    }
  }
  const vid = $('camera-video');
  vid.srcObject = st.cameraStream;
  await vid.play().catch(() => {});
  return true;
}

async function abrirMicrofone() {
  pararFluxo(st.micStream);
  st.micStream = null;
  const id = $('microfone').value;
  try {
    st.micStream = await navigator.mediaDevices.getUserMedia({ audio: id ? { ...AUDIO, deviceId: { exact: id } } : AUDIO });
  } catch (_) {
    try { st.micStream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO }); } catch (e) {
      alertar('Não consegui abrir o microfone. Confira se ele está ligado e liberado no Windows.');
      return false;
    }
  }
  await montarAudio();
  return true;
}

/* O som gravado passa pelo Web Audio (microfone, controle de volume, gravação).
   Na 0.3 a gravação não fica mais muda no Alt E (a Joyce grava com fone de ouvido). */
async function montarAudio() {
  garantirAudio();
  if (st.audioCtx.state === 'suspended') await st.audioCtx.resume().catch(() => {});
  if (st.fonteAudio) { try { st.fonteAudio.disconnect(); } catch (_) { /* */ } }
  st.fonteAudio = st.audioCtx.createMediaStreamSource(st.micStream);
  st.fonteAudio.connect(st.ganho);
}
function garantirAudio() {
  if (st.audioCtx) return;
  st.audioCtx = new AudioContext({ sampleRate: 48000 });
  st.ganho = st.audioCtx.createGain();
  st.destino = st.audioCtx.createMediaStreamDestination();
  st.ganho.connect(st.destino);
}

/* Bipes curtos ao gravar, parar, pausar e retomar. Tocam só no fone ou na caixa de som
   (saída do Web Audio), nunca no destino da gravação: não entram no vídeo. */
const BIPES = {
  gravar: [[660, 0.07], [990, 0.07]],
  parar: [[990, 0.07], [660, 0.07]],
  pausar: [[440, 0.12]],
  retomar: [[880, 0.08]]
};
function bipe(tipo) {
  const notas = BIPES[tipo];
  if (!notas) return;
  try {
    garantirAudio();
    const ctx = st.audioCtx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    let t = ctx.currentTime + 0.01;
    for (const [freq, dur] of notas) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.15, t + 0.008);
      g.gain.setValueAtTime(0.15, t + dur - 0.015);
      g.gain.linearRampToValueAtTime(0, t + dur);
      osc.connect(g);
      g.connect(ctx.destination); // só a saída de som; o destino da gravação é st.destino
      osc.start(t);
      osc.stop(t + dur + 0.01);
      t += dur + 0.02;
    }
    st.bipes.push({ tipo, quando: performance.now(), notas: notas.map((n) => n[0]) });
  } catch (_) { /* sem som, segue sem bipe */ }
}

// --- Quadro do vídeo (prévia e gravação) -------------------------------------------

function ajustarTela() {
  const f = PU.tamanhoSaida(formato(), qualidade() || 'alta');
  const c = $('previa');
  if (c.width !== f.largura || c.height !== f.altura) { c.width = f.largura; c.height = f.altura; st.legendaCache = null; }
}

function legendaAtiva() { return valorDe('uso') === 'legenda' && st.frases.length > 0; }

function layoutLegenda(ctx, W, H) {
  const texto = st.frases[st.atual] || '';
  const chave = `${texto}|${W}x${H}`;
  if (st.legendaCache && st.legendaCache.chave === chave) return st.legendaCache;
  const m = PU.medidasLegenda(W, H);
  const medirCom = (t) => { ctx.font = `600 ${t}px "Segoe UI", Arial, sans-serif`; return (s) => ctx.measureText(s).width; };
  const r = PU.montarLegenda(texto, m, medirCom);
  st.legendaCache = { chave, ...r, m };
  return st.legendaCache;
}

function desenharLegenda(ctx, W, H) {
  const { tamanho, linhas, m } = layoutLegenda(ctx, W, H);
  if (!linhas.length) return;
  ctx.font = `600 ${tamanho}px "Segoe UI", Arial, sans-serif`;
  const alturaLinha = Math.round(tamanho * 1.3);
  const larguras = linhas.map((l) => ctx.measureText(l).width);
  const pad = Math.round(tamanho * 0.45);
  const caixaW = Math.max(...larguras) + pad * 2;
  const caixaH = alturaLinha * linhas.length + pad;
  const x0 = (W - caixaW) / 2;
  const y0 = H - m.margemBaixo - caixaH;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
  ctx.beginPath();
  ctx.roundRect(x0, y0, caixaW, caixaH, Math.round(tamanho * 0.3));
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, Math.round(tamanho / 12));
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#fff';
  linhas.forEach((l, i) => {
    const y = y0 + pad / 2 + alturaLinha * i + alturaLinha / 2;
    ctx.strokeText(l, W / 2, y);
    ctx.fillText(l, W / 2, y);
  });
}

function desenhar() {
  const c = $('previa');
  const ctx = c.getContext('2d');
  const v = $('camera-video');
  ctx.fillStyle = '#000';
  if (!st.cameraStream || !v.videoWidth) { ctx.fillRect(0, 0, c.width, c.height); return; }
  const r = PU.recorte(v.videoWidth, v.videoHeight, formato());
  ctx.drawImage(v, r.sx, r.sy, r.sw, r.sh, 0, 0, c.width, c.height);
  if (legendaAtiva()) desenharLegenda(ctx, c.width, c.height);
}

// --- Leitura sombreada ----------------------------------------------------------------

function atualizarTexto() {
  const frases = PU.frasesDoTexto($('texto').value);
  const mudou = frases.join('\n') !== st.frases.join('\n');
  st.frases = frases;
  if (mudou) st.atual = 0;
  st.legendaCache = null;
  $('frase').hidden = !frases.length;
  $('frase-texto').textContent = frases[st.atual] || '';
}

function moverFrase(tecla) {
  const n = st.frases.length;
  if (!n) return;
  const atual = st.atual;
  const passo = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 }[tecla] || 0;
  let i = tecla === 'Home' ? 0 : tecla === 'End' ? n - 1 : atual + passo;
  i = Math.max(0, Math.min(n - 1, i));
  if (i === atual && (tecla === 'ArrowDown' || tecla === 'ArrowUp')) return falar(tecla === 'ArrowDown' ? 'Fim do texto.' : 'Começo do texto.');
  st.atual = i;
  st.legendaCache = null;
  $('frase-texto').textContent = st.frases[i];
  falar(st.frases[i]);
}

async function abrirTexto() {
  try {
    const r = await chamar('textoAbrir');
    if (!r) return;
    $('texto').value = r.texto;
    atualizarTexto();
    salvarConfig({ texto: r.texto });
    $('frase').focus();
    falarDepois(`Texto aberto: ${r.nome}.`, 250);
  } catch (e) { alertar(e.message); }
}

// --- Gravação --------------------------------------------------------------------------

function escolherFormatoGravacao() {
  const op = ['video/webm;codecs=h264,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return op.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

function duracaoAtual() {
  return (st.acumulado + (st.pausado || !gravando() ? 0 : performance.now() - st.inicioTrecho)) / 1000;
}

function mostrarEstado() {
  const e = $('estado');
  e.textContent = gravando() ? (st.pausado ? 'Gravação pausada.' : 'Gravando.') : st.salvando ? 'Salvando o vídeo...' : '';
  e.className = 'estado' + (gravando() && !st.pausado ? ' gravando' : '');
  $('gravar').textContent = gravando() ? 'Parar (Alt R)' : 'Gravar (Alt R)';
  $('pausar').textContent = st.pausado ? 'Continuar (Alt T)' : 'Pausar (Alt T)';
  $('pausar').disabled = !gravando();
  const travar = gravando() || st.salvando;
  for (const id of ['camera', 'microfone']) $(id).disabled = travar;
  travarGrupo('formato', travar);
  travarGrupo('qualidade', travar);
}

function faltaEscolher() {
  if (!valorDe('formato')) { focarGrupo('formato'); return 'Antes de gravar, escolha a proporção do vídeo: horizontal, vertical ou quadrado.'; }
  if (!qualidade()) { focarGrupo('qualidade'); return 'Antes de gravar, escolha a qualidade: alta, padrão ou leve.'; }
  return null;
}

async function iniciarGravacao() {
  const falta = faltaEscolher();
  if (falta) return alertar(falta);
  if (!st.cameraStream) return alertar('Nenhuma câmera aberta. Escolha uma câmera antes de gravar.');
  if (!st.micStream || !st.destino) return alertar('Nenhum microfone aberto. Escolha um microfone antes de gravar.');
  ajustarTela();
  if (st.audioCtx.state === 'suspended') await st.audioCtx.resume().catch(() => {});
  const fluxo = $('previa').captureStream(30);
  for (const t of st.destino.stream.getAudioTracks()) fluxo.addTrack(t);
  let id;
  try { id = await chamar('gravacaoIniciar'); } catch (e) { return alertar(e.message); }
  st.gravId = id;
  st.cadeia = Promise.resolve();
  st.erroGravar = null;
  st.ganho.gain.cancelScheduledValues(st.audioCtx.currentTime);
  st.ganho.gain.setValueAtTime(1, st.audioCtx.currentTime);
  const rec = new MediaRecorder(fluxo, { mimeType: escolherFormatoGravacao(), videoBitsPerSecond: PU.bitsDoGravador(qualidade()), audioBitsPerSecond: 192000 });
  // Cada pedaço (1 segundo) vai direto para o disco; nada se acumula na memória.
  rec.ondataavailable = (ev) => {
    if (!ev.data || !ev.data.size) return;
    const blob = ev.data;
    st.cadeia = st.cadeia.then(async () => {
      if (st.erroGravar) return;
      await chamar('gravacaoPedaco', { id, dados: new Uint8Array(await blob.arrayBuffer()) });
    }).catch((e) => { st.erroGravar = e; });
  };
  st.fluxoGravacao = fluxo;
  st.gravador = rec;
  st.formatoGravado = formato();
  st.qualidadeGravada = qualidade();
  st.pausado = false;
  st.acumulado = 0;
  st.inicioTrecho = performance.now();
  rec.start(1000);
  bipe('gravar');
  mostrarEstado();
  if (st.frases.length && document.activeElement !== $('frase')) $('frase').focus();
  falar('Gravando.');
}

function alternarPausa() {
  if (!gravando()) return falar('Nenhuma gravação em andamento. Alt R começa a gravar.');
  if (st.pausado) {
    st.gravador.resume();
    bipe('retomar');
    st.pausado = false;
    st.inicioTrecho = performance.now();
    mostrarEstado();
    falar('Gravação retomada.');
  } else {
    st.gravador.pause();
    bipe('pausar');
    st.acumulado += performance.now() - st.inicioTrecho;
    st.pausado = true;
    mostrarEstado();
    falar('Gravação pausada. Alt T continua, Alt R para e salva.');
  }
}

/** Avisa o andamento de uma tarefa longa a cada 10% e devolve a função que desliga o aviso. */
function acompanhar(assinar, rotulo, barra) {
  const aviso = PU.criarAvisoDeProgresso({ rotulo });
  return assinar((pct) => {
    if (barra) barra.value = pct;
    const msg = aviso(pct);
    if (msg) falar(msg);
  });
}

async function pararGravacao() {
  const rec = st.gravador;
  const duracao = duracaoAtual();
  bipe('parar');
  const parou = new Promise((r) => { rec.onstop = r; });
  rec.stop();
  await parou;
  // Para só a imagem da gravação; o microfone continua aberto para a próxima.
  st.fluxoGravacao.getVideoTracks().forEach((t) => t.stop());
  st.gravador = null;
  st.pausado = false;
  st.salvando = true;
  mostrarEstado();
  falar('Gravação parada. Salvando o vídeo, aguarde.');
  const solta = acompanhar(window.api.aoProgresso, 'Salvando');
  try {
    await st.cadeia;
    if (st.erroGravar) throw st.erroGravar;
    const r = await chamar('gravacaoFinalizar', { id: st.gravId, duracao, formato: st.formatoGravado, qualidade: st.qualidadeGravada });
    st.ultimoSalvo = { ...r, duracao };
    st.original = st.ultimoSalvo;
    st.ajuste = null; // vídeo novo: o áudio começa como foi gravado
    mostrarDecidir();
  } catch (e) {
    alertar(`O vídeo não foi salvo. ${e.message}`);
  } finally {
    solta();
    st.salvando = false;
    mostrarEstado();
  }
}

// --- Telas depois da gravação -------------------------------------------------------------

const TELAS = ['tela-gravar', 'tela-decidir', 'tela-melhorar', 'tela-pronto'];
function mostrarTela(id) { for (const t of TELAS) $(t).hidden = t !== id; }
const semMp4 = (n) => n.replace(/\.mp4$/i, '');

function mostrarDecidir() {
  const o = st.original;
  const info = `Gravação pronta, com o nome ${semMp4(o.nome)}. Duração: ${PU.duracaoFalada(o.duracao)}. Escolha Salvar e finalizar, ou Melhorar.`;
  $('decidir-info').textContent = info;
  mostrarTela('tela-decidir');
  $('finalizar').focus();
  falarDepois(info, 300);
}

function mostrarPronto(info, comMelhoria) {
  $('pronto-info').textContent = info;
  $('melhorar-de-novo').hidden = !comMelhoria;
  mostrarTela('tela-pronto');
  $('voltar').focus();
  falarDepois(info, 300);
}

function finalizar() {
  const o = st.original;
  st.ultimoSalvo = o;
  mostrarPronto(`Vídeo salvo na pasta ${o.documentos}, Gravador de Vídeo, com o nome ${semMp4(o.nome)}. Duração: ${PU.duracaoFalada(o.duracao)}.`, false);
}

function voltarAoInicio(anunciar = true) {
  mostrarTela('tela-gravar');
  $('gravar').focus();
  if (anunciar) falarDepois('Pronto para gravar outro vídeo. Alt R grava.', 250);
}

// --- Melhorar: borrar ou substituir o fundo, e melhorar o áudio ---------------------------------

const AJU = PU.ajuste;
const NEUTRO = () => ({ volume: 1, velocidade: 1, eq: { graves: 0, medios: 0, agudos: 0 } });
const ajuste = () => { if (!st.ajuste) st.ajuste = NEUTRO(); return st.ajuste; };

function mostrarFundos() { $('grupo-fundo').hidden = valorDe('efeito') !== 'substituir'; }

function abrirMelhorar() {
  if (!st.original) return;
  $('processando').hidden = true;
  $('melhorar-botoes').hidden = false;
  travarGrupo('efeito', false);
  travarGrupo('fundo', false);
  travarAudio(false);
  mostrarFundos();
  mostrarAjuste();
  mostrarTela('tela-melhorar');
  focarGrupo('efeito');
  falarDepois('Melhorar o vídeo. Escolha o efeito da imagem e, se quiser, melhore o áudio logo abaixo: Control com setas para os lados muda o volume, para cima e para baixo muda a velocidade. Depois, Salvar amostra de 5 segundos ou Salvar o vídeo todo. O original continua guardado.', 300);
}

function descricaoDoEfeito() {
  const ef = valorDe('efeito');
  const audio = !AJU.ajusteNeutro(ajuste());
  let img = '';
  if (ef === 'substituir') {
    const f = PU.FUNDOS.find((x) => x.valor === valorDe('fundo'));
    img = f ? f.sufixo : 'fundo novo';
  } else if (ef === 'borrar') img = 'fundo borrado';
  if (img && audio) return `${img} e áudio melhorado`;
  return img || (audio ? 'áudio melhorado' : '');
}

// Controles do "Melhorar áudio": os mesmos do Voz da Cena (volume, graves, médios, agudos, velocidade).
const CAMPOS_AUDIO = { 'eq-volume': null, 'eq-graves': 'graves', 'eq-medios': 'medios', 'eq-agudos': 'agudos', 'eq-velocidade': null };
function textoEq(id, v) {
  if (id === 'eq-volume' || id === 'eq-velocidade') return `${v}%`;
  return AJU.decibeisFalados(v);
}
function mostrarAjuste() {
  const a = ajuste();
  $('eq-volume').value = String(Math.round(a.volume * 100));
  $('eq-velocidade').value = String(Math.round(a.velocidade * 100));
  for (const [id, k] of Object.entries(CAMPOS_AUDIO)) {
    if (k) $(id).value = String(a.eq[k]);
    $(id).setAttribute('aria-valuetext', textoEq(id, Number($(id).value)));
  }
  const nome = AJU.nomeDoEq(a.eq);
  const p = AJU.PREDEFINICOES_EQ.find((x) => x.nome === nome);
  $('eq-predefinicao').value = p ? p.id : 'personalizada';
  const o = st.original;
  $('audio-info').textContent = `${AJU.resumoDoAjuste(a)}${o ? ` Vídeo de ${PU.duracaoFalada(o.duracao / a.velocidade)}.` : ''}`;
}
function travarAudio(travado) {
  for (const id of [...Object.keys(CAMPOS_AUDIO), 'eq-predefinicao', 'eq-ouvir', 'eq-zerar']) $(id).disabled = travado;
}
function montarAudioUI() {
  const pre = $('eq-predefinicao');
  pre.textContent = '';
  for (const p of AJU.PREDEFINICOES_EQ) {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = p.nome; pre.appendChild(o);
  }
  const pers = document.createElement('option');
  pers.value = 'personalizada'; pers.textContent = 'Personalizada';
  pre.appendChild(pers);
  for (const id of Object.keys(CAMPOS_AUDIO)) {
    $(id).addEventListener('input', (e) => {
      const a = ajuste();
      const v = Number(e.target.value);
      if (id === 'eq-volume') a.volume = Math.max(0.1, Math.min(3, v / 100));
      else if (id === 'eq-velocidade') a.velocidade = Math.max(0.5, Math.min(2.5, v / 100));
      else a.eq = AJU.normalizarEq({ ...a.eq, [CAMPOS_AUDIO[id]]: v });
      mostrarAjuste();
    });
  }
  pre.addEventListener('change', () => {
    const p = AJU.PREDEFINICOES_EQ.find((x) => x.id === pre.value);
    if (!p) return;
    ajuste().eq = { ...p.eq };
    mostrarAjuste();
    falar(`${p.nome}: graves ${AJU.decibeisFalados(p.eq.graves)}, médios ${AJU.decibeisFalados(p.eq.medios)}, agudos ${AJU.decibeisFalados(p.eq.agudos)}.`);
  });
  $('eq-ouvir').addEventListener('click', ouvirAjuste);
  $('eq-zerar').addEventListener('click', () => {
    st.ajuste = NEUTRO();
    mostrarAjuste();
    falar('Áudio como foi gravado: volume 100%, equalização Neutro, velocidade 100%.');
  });
}

function mudarVolume(direcao) {
  const a = ajuste();
  const antes = a.volume;
  const novo = AJU.mudarVolume(antes, direcao);
  if (novo === antes) return falar(`Volume já está em ${AJU.porcento(novo)}, o ${direcao > 0 ? 'máximo' : 'mínimo'}.`);
  a.volume = novo;
  mostrarAjuste();
  falar(`Volume ${AJU.porcento(novo)}.`);
}
function mudarVelocidade(direcao) {
  const a = ajuste();
  const antes = a.velocidade;
  const nova = AJU.mudarVelocidade(antes, direcao);
  if (nova === antes) return falar(`Velocidade já está em ${AJU.porcento(nova)}, o ${direcao > 0 ? 'máximo' : 'mínimo'}.`);
  a.velocidade = nova;
  mostrarAjuste();
  falar(`Velocidade ${AJU.porcento(nova)}. Vídeo de ${PU.duracaoFalada(st.original.duracao / nova)}.`);
}

function pararOuvir() {
  if (st.ouvindo) { try { st.ouvindo.pause(); URL.revokeObjectURL(st.ouvindo.src); } catch (_) { /* */ } st.ouvindo = null; }
}
async function ouvirAjuste() {
  if (!st.original || st.melhoria) return;
  pararOuvir();
  falar('Preparando 5 segundos do áudio com o ajuste.');
  try {
    const wav = await chamar('melhorarOuvir', { arquivo: st.original.arquivo, duracao: st.original.duracao, ajuste: ajuste() });
    const el = new Audio(URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })));
    st.ouvindo = el;
    st.ultimoOuvir = { bytes: wav.byteLength, ajuste: { ...ajuste(), eq: { ...ajuste().eq } } };
    el.onended = pararOuvir;
    await el.play();
  } catch (e) {
    alertar(e.message);
  }
}

async function processar(amostra) {
  if (st.melhoria) return;
  const efeito = valorDe('efeito');
  if (!efeito) { focarGrupo('efeito'); return alertar('Escolha um efeito: borrar o fundo, substituir o fundo, ou não mudar a imagem.'); }
  if (efeito === 'substituir' && !valorDe('fundo')) { focarGrupo('fundo'); return alertar('Escolha um dos fundos.'); }
  if (efeito === 'nenhum' && AJU.ajusteNeutro(ajuste())) {
    $('eq-predefinicao').focus();
    return alertar('Nada para melhorar: a imagem fica como está e o áudio também. Mude o volume, a equalização ou a velocidade, ou escolha um efeito para a imagem.');
  }
  pararOuvir();
  const o = st.original;
  const qual = descricaoDoEfeito();
  st.melhoria = { cancelar: false, id: null };
  $('melhorar-botoes').hidden = true;
  $('processando').hidden = false;
  $('processando-barra').value = 0;
  $('processando-info').textContent = `Processando ${amostra ? 'a amostra' : 'o vídeo todo'} com ${qual}...`;
  travarGrupo('efeito', true);
  travarGrupo('fundo', true);
  travarAudio(true);
  $('cancelar').focus();
  const demora = efeito === 'nenhum' ? 'Costuma ser mais rápido que o tempo do vídeo.' : 'Pode demorar: mais ou menos o tempo do vídeo, ou mais.';
  falar(`Processando ${amostra ? 'a amostra de 5 segundos' : 'o vídeo todo'} com ${qual}. ${amostra ? 'Leva alguns segundos.' : demora} Aguarde.`);
  const solta = acompanhar(window.api.aoProgressoMelhoria, 'Processando', $('processando-barra'));
  const m = st.melhoria;
  try {
    const info = await chamar('melhorarIniciar', { arquivo: o.arquivo, formato: o.formato, qualidade: o.qualidade, efeito,
      fundo: valorDe('fundo'), amostra, duracao: o.duracao, ajuste: ajuste() });
    m.id = info.id;
    if (!info.soAudio) {
      await trabalhador('segmentarIniciar');
      const tempos = { quadro: 0, segmentar: 0, mascara: 0, quadros: 0 };
      st.temposMelhoria = tempos;
      for (;;) {
        if (m.cancelar) break;
        let t = performance.now();
        let q = await chamar('melhorarQuadro', { id: info.id });
        tempos.quadro += performance.now() - t;
        if (!q || m.cancelar) break;
        if (q.byteOffset || q.byteLength !== q.buffer.byteLength) q = q.slice();
        t = performance.now();
        const mascara = await trabalhador('segmentar', { dados: q.buffer, w: info.mw, h: info.mh }, [q.buffer]);
        tempos.segmentar += performance.now() - t;
        t = performance.now();
        await chamar('melhorarMascara', { id: info.id, dados: mascara });
        tempos.mascara += performance.now() - t;
        tempos.quadros++;
      }
    }
    if (m.cancelar) return;
    const r = await chamar('melhorarConcluir', { id: info.id });
    if (m.cancelar) return;
    st.ultimoSalvo = { ...r, duracao: info.duracaoSaida || info.duracao };
    st.ultimaMelhoria = { ...r, amostra, qual, efeito, ajuste: { ...ajuste(), eq: { ...ajuste().eq } }, duracaoSaida: info.duracaoSaida };
    mostrarPronto(`${amostra ? 'Amostra' : 'Vídeo'} com ${qual} salv${amostra ? 'a' : 'o'} na pasta ${r.documentos}, Gravador de Vídeo, com o nome ${semMp4(r.nome)}. O vídeo original continua guardado.`, true);
  } catch (e) {
    if (m.cancelar) return;
    if (m.id) chamar('melhorarCancelar', { id: m.id }).catch(() => {});
    alertar(`Não consegui melhorar o vídeo. ${e.message} O vídeo original continua guardado.`);
    abrirMelhorar();
  } finally {
    solta();
    if (st.melhoria === m) st.melhoria = null;
  }
}

async function cancelarMelhoria() {
  const m = st.melhoria;
  if (!m) return;
  m.cancelar = true;
  if (m.id) await chamar('melhorarCancelar', { id: m.id }).catch(() => {});
  st.melhoria = null;
  abrirMelhorar();
  falarDepois('Processamento cancelado. Nada novo foi salvo; o vídeo original continua guardado.', 350);
}

async function alternarGravacao() {
  if (st.salvando) return falar('Aguarde, ainda estou salvando o vídeo anterior.');
  if (st.melhoria) return falar('Aguarde, estou processando o vídeo. Para parar, use o botão Cancelar.');
  if (gravando()) return pararGravacao();
  if ($('tela-gravar').hidden) voltarAoInicio(false);
  return iniciarGravacao();
}

// --- Detecção e segmentação no worker (MediaPipe, sem internet) ----------------------------------

let worker = null;
const pendentes = new Map();
let proximaTarefa = 1;
function trabalhador(tipo, dados, transferir = []) {
  if (!worker) {
    worker = new Worker('visao-worker.js');
    worker.onmessage = (ev) => {
      const p = pendentes.get(ev.data.id);
      if (!p) return;
      pendentes.delete(ev.data.id);
      if (ev.data.ok) p.resolve(ev.data.valor); else p.reject(new Error(ev.data.erro));
    };
    worker.onerror = (ev) => {
      for (const p of pendentes.values()) p.reject(new Error(ev.message || 'Erro na detecção.'));
      pendentes.clear();
      worker = null;
    };
  }
  const id = proximaTarefa++;
  return new Promise((resolve, reject) => {
    pendentes.set(id, { resolve, reject });
    worker.postMessage({ id, tipo, dados }, transferir);
  });
}

async function analisarQuadro() {
  const v = $('camera-video');
  const r = PU.recorte(v.videoWidth, v.videoHeight, formato());
  const esc = Math.min(1, 960 / Math.max(r.sw, r.sh));
  const bitmap = await createImageBitmap(v, r.sx, r.sy, r.sw, r.sh, { resizeWidth: Math.round(r.sw * esc), resizeHeight: Math.round(r.sh * esc) });
  const f = PU.FORMATOS[formato()];
  return trabalhador('analisar', { bitmap, largura: f.largura, altura: f.altura }, [bitmap]);
}

async function enquadramento() {
  if (st.analisando) return;
  if (!st.cameraStream || !$('camera-video').videoWidth) return falar('Nenhuma câmera aberta.');
  st.analisando = true;
  // 0.3: a gravação não fica mais muda enquanto o leitor fala (a Joyce grava com fone de ouvido).
  const durante = gravando() && !st.pausado;
  const demorou = setTimeout(() => falar('Olhando a câmera, um instante.'), 700);
  try {
    const dados = await analisarQuadro();
    const objetos = PU.descreverObjetos(dados.objetos || []).texto;
    const r = PU.descreverEnquadramento({ ...dados, espelhada: espelhada(), objetos });
    st.ultimoEnquadramento = { ...r, entrada: dados, durante, objetos };
    clearTimeout(demorou);
    falar(r.texto);
  } catch (e) {
    clearTimeout(demorou);
    alertar('Não consegui analisar o enquadramento. ' + (e.message || e));
  } finally {
    st.analisando = false;
  }
}

const espelhada = () => $('espelhada').checked;

/** Testar o espelho: levante a mão direita; o programa vê de que lado da imagem ela aparece. */
async function testarEspelho() {
  if (st.analisando) return;
  if (!st.cameraStream || !$('camera-video').videoWidth) return falar('Nenhuma câmera aberta.');
  st.analisando = true;
  falar('Levante a mão direita acima do ombro e fique assim. Vou olhar daqui a 3 segundos.');
  try {
    await new Promise((r) => setTimeout(r, Number(st.esperaEspelho ?? 3000)));
    const dados = await analisarQuadro();
    const r = PU.testarEspelho(dados.pose);
    st.ultimoTesteEspelho = { resultado: r, entrada: dados };
    if (r === null) return falar('Não consegui ver uma mão levantada. Deixe a mão direita acima do ombro, dentro da imagem, e tente de novo. Nada mudou.');
    $('espelhada').checked = r;
    salvarConfig({ espelhada: r });
    falar(r ? 'Sua câmera espelha a imagem. Marquei a opção: os lados do Alt E já levam isso em conta. Pode baixar a mão.'
      : 'Sua câmera não espelha a imagem. Desmarquei a opção: os lados do Alt E já levam isso em conta. Pode baixar a mão.');
  } catch (e) {
    alertar('Não consegui testar o espelho. ' + (e.message || e));
  } finally {
    st.analisando = false;
  }
}

// --- Teclado ------------------------------------------------------------------------------

document.addEventListener('keydown', (e) => {
  const alt = e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey;
  const nada = !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
  const feito = () => { e.preventDefault(); e.stopPropagation(); };
  if (alt && e.code === 'KeyR') { feito(); if (!e.repeat) alternarGravacao(); return; }
  if (alt && e.code === 'KeyT') { feito(); if (!e.repeat) alternarPausa(); return; }
  if (alt && e.code === 'KeyE') { feito(); if (!e.repeat) enquadramento(); return; }
  // Melhorar áudio: as mesmas teclas do Voz da Cena. Control com setas para os lados muda o volume
  // (num campo de texto ou controle deslizante, continuam as teclas normais); para cima e para baixo, a velocidade.
  const ctrl = e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
  if (ctrl && !$('tela-melhorar').hidden && !st.melhoria && st.original) {
    const campo = e.target && (e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && !['radio', 'checkbox', 'button'].includes(e.target.type)));
    if (!campo && e.key === 'ArrowRight') { feito(); mudarVolume(1); return; }
    if (!campo && e.key === 'ArrowLeft') { feito(); mudarVolume(-1); return; }
    if (e.key === 'ArrowUp') { feito(); mudarVelocidade(1); return; }
    if (e.key === 'ArrowDown') { feito(); mudarVelocidade(-1); return; }
  }
  if (document.activeElement === $('frase') && nada && ['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(e.key)) {
    feito();
    moverFrase(e.key);
  }
}, true);

// --- Início ---------------------------------------------------------------------------------

async function iniciar() {
  st.config = await chamar('configLer');
  montarGrupo('grupo-formato', 'formato', PU.PROPORCOES, st.config.formato, (v) => { ajustarTela(); salvarConfig({ formato: v }); });
  montarGrupo('grupo-qualidade', 'qualidade', PU.QUALIDADES, st.config.qualidade, (v) => { ajustarTela(); salvarConfig({ qualidade: v }); });
  montarGrupo('grupo-uso', 'uso', PU.USOS_DO_TEXTO, st.config.legenda ? 'legenda' : 'leitor', (v) => salvarConfig({ legenda: v === 'legenda' }));
  montarGrupo('grupo-efeito', 'efeito', PU.EFEITOS, 'borrar', mostrarFundos);
  montarGrupo('grupo-fundo', 'fundo', PU.FUNDOS, 'consultorio', () => {});
  montarAudioUI();
  $('espelhada').checked = st.config.espelhada !== false;
  $('espelhada-desc').textContent = PU.ESPELHO.descricao;
  $('espelhada').addEventListener('change', () => {
    salvarConfig({ espelhada: $('espelhada').checked });
    falar($('espelhada').checked ? 'Câmera espelhada: marcado.' : 'Câmera espelhada: desmarcado.');
  });
  $('testar-espelho').addEventListener('click', testarEspelho);
  $('texto').value = st.config.texto || '';
  atualizarTexto();
  ajustarTela();
  setInterval(desenhar, 1000 / 30);

  $('camera').addEventListener('change', async () => { salvarConfig({ camera: $('camera').value }); await abrirCamera(); });
  $('microfone').addEventListener('change', async () => { salvarConfig({ microfone: $('microfone').value }); await abrirMicrofone(); });
  let espera = null;
  $('texto').addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(atualizarTexto, 400); });
  $('texto').addEventListener('change', () => { atualizarTexto(); salvarConfig({ texto: $('texto').value }); });
  $('abrir-texto').addEventListener('click', abrirTexto);
  $('gravar').addEventListener('click', alternarGravacao);
  $('pausar').addEventListener('click', alternarPausa);
  $('enquadrar').addEventListener('click', enquadramento);
  $('finalizar').addEventListener('click', finalizar);
  $('melhorar').addEventListener('click', abrirMelhorar);
  $('amostra').addEventListener('click', () => processar(true));
  $('todo').addEventListener('click', () => processar(false));
  $('melhorar-voltar').addEventListener('click', mostrarDecidir);
  $('cancelar').addEventListener('click', cancelarMelhoria);
  $('melhorar-de-novo').addEventListener('click', abrirMelhorar);
  $('voltar').addEventListener('click', () => voltarAoInicio());
  $('abrir-pasta').addEventListener('click', () => chamar('pastaAbrir', st.ultimoSalvo && st.ultimoSalvo.pasta).catch((e) => alertar(e.message)));

  // Pede a permissão uma vez, para o Windows mostrar os nomes de verdade das câmeras e microfones.
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    pararFluxo(s);
  } catch (_) {
    try { pararFluxo(await navigator.mediaDevices.getUserMedia({ audio: true })); } catch (__) { /* */ }
  }
  const n = await listarDispositivos();
  const okCam = n.cams ? await abrirCamera() : false;
  const okMic = n.mics ? await abrirMicrofone() : false;
  navigator.mediaDevices.addEventListener('devicechange', async () => {
    if (gravando() || st.salvando) return;
    const antesCam = $('camera').value, antesMic = $('microfone').value;
    await listarDispositivos();
    if ($('camera').value !== antesCam) await abrirCamera();
    if ($('microfone').value !== antesMic) await abrirMicrofone();
  });
  mostrarEstado();
  focarGrupo('formato');
  const falta = [!n.cams && 'Nenhuma câmera encontrada.', !n.mics && 'Nenhum microfone encontrado.'].filter(Boolean).join(' ');
  const escolher = !valorDe('formato') || !qualidade() ? ' Antes da primeira gravação, escolha a proporção e a qualidade.' : '';
  if (falta) alertar(`${falta} Conecte e reabra o programa.`);
  else if (okCam && okMic) setTimeout(() => { falar('Gravador pronto. Alt R grava, Alt E fala o enquadramento.' + escolher); st.pronto = true; }, 400);
  if (falta || !(okCam && okMic)) st.pronto = true;
  // Prepara a detecção de rosto em segundo plano, para o primeiro Alt E não demorar.
  setTimeout(() => trabalhador('carregar').catch(() => {}), 1500);
}

iniciar().catch((e) => alertar('Erro ao abrir o gravador: ' + (e.message || e)));
